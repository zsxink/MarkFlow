/**
 * macOS `.DS_Store` 的最小读写实现。
 *
 * 只为 DMG 安装窗口外观服务，因此刻意收窄到三类记录：
 *   icvp  payload 是 bplist00，装着图标视图设置（arrangeBy / iconSize / textSize …）
 *   bwsp  payload 是 bplist00，装着窗口边界（WindowBounds）
 *   Iloc  payload 固定 16 字节，装着单个条目的图标坐标
 *
 * 改写一律**等长原地覆盖**。bplist00 把每个对象的长度写死在字节流里，长度一变就必须重排
 * 整个对象表——那超出这里的职责，所以遇到长度不匹配一律抛错，不做猜测性修复。
 *
 * 已实测确认的语义（别凭印象改）：
 *   - 记录头 12 字节：<4B 结构标记><4B 记录类型><4B payload 长度>
 *   - bplist00 的 dict 计数就是项数，**不需要 +1**
 *   - icvp 里 preserve 的键名是 ASCII 短串；iconSize 是 1 字节 marker + 8 字节 BE double
 *   - Iloc 的条目名是 UTF-16BE，位于 'Iloc' 之前
 */

const RECORD_HEADER_SIZE = 12
const PLIST_MAGIC = 'bplist00'

export const ILOC_PAYLOAD_SIZE = 16

function readUInt(buf, offset, size) {
  let value = 0
  for (let i = 0; i < size; i += 1) value = value * 256 + buf[offset + i]
  return value
}

function readCount(buf, offset, info) {
  if (info !== 0x0f) return { count: info, dataStart: offset + 1 }
  const intSize = 1 << (buf[offset + 1] & 0x0f)
  return { count: readUInt(buf, offset + 2, intSize), dataStart: offset + 2 + intSize }
}

/**
 * 定位 dict 的键值区布局。
 *
 * 坑在这里：CFBinaryPlist 规范里 dict 应当带 `keyRefSize` / `objectRefSize` 两个字节，
 * 但**实测 macOS 写入的 `.DS_Store` 省略了它们**，Python 标准库 plistlib 的解析器也是
 * 按省略处理（直接用 trailer 的 ref size）。照着规范读这两字节，会把键数组的头两个字节
 * 误当成 ref 尺寸——于是所有 value 引用都变成越界的大整数，解析结果静默变成空 dict。
 *
 * 麻烦的是没法靠单看字节区分：被误认为 ref 尺寸的那两字节本也是小整数（实测 1、2，
 * 恰好是前两个 keyRef）。所以按「先标准、后省略」两套候选去试，用「所有引用必须落在
 * 对象表内、且每个键必须是字符串对象」这条硬判据筛出成立的那套。
 */
function resolveDictLayout(buf, trailer, offset, info) {
  const { count, dataStart } = readCount(buf, offset, info)

  const candidates = []
  if (dataStart + 2 <= buf.length) {
    const keyRefSize = buf[dataStart]
    const objectRefSize = buf[dataStart + 1]
    if (keyRefSize > 0 && keyRefSize <= 8 && objectRefSize > 0 && objectRefSize <= 8) {
      candidates.push({ keyRefSize, objectRefSize, keysStart: dataStart + 2 })
    }
  }
  candidates.push({
    keyRefSize: trailer.objectRefSize,
    objectRefSize: trailer.objectRefSize,
    keysStart: dataStart,
  })

  for (const candidate of candidates) {
    if (isPlausibleDict(buf, trailer, count, candidate)) return { count, ...candidate }
  }

  throw new Error(
    `无法确定 dict 的键值区布局（count=${count}，numObjects=${trailer.numObjects}）——` +
      '两套候选布局都出现越界引用或非字符串键，说明这不是本模块认识的 bplist 变体',
  )
}

function isPlausibleDict(buf, trailer, count, layout) {
  const { keysStart, keyRefSize, objectRefSize } = layout
  const valuesStart = keysStart + count * keyRefSize
  if (valuesStart + count * objectRefSize > buf.length) return false

  for (let i = 0; i < count; i += 1) {
    const keyRef = readUInt(buf, keysStart + i * keyRefSize, keyRefSize)
    if (keyRef >= trailer.numObjects) return false
    const keyMarker = buf[objectOffset(buf, trailer, keyRef)]
    if ((keyMarker & 0xf0) !== 0x50 && (keyMarker & 0xf0) !== 0x60) return false

    const valueRef = readUInt(buf, valuesStart + i * objectRefSize, objectRefSize)
    if (valueRef >= trailer.numObjects) return false
  }
  return true
}

/** 解析一个 bplist00 对象，只覆盖外观校验与改写会碰到的类型。 */
function readPlistObject(buf, trailer, offset) {
  const marker = buf[offset]
  const type = marker >> 4
  const info = marker & 0x0f

  switch (type) {
    case 0x0:
      if (info === 0x0) return { kind: 'null', next: offset + 1 }
      if (info === 0x8) return { kind: 'bool', value: false, next: offset + 1 }
      if (info === 0x9) return { kind: 'bool', value: true, next: offset + 1 }
      return { kind: 'unknown', next: offset + 1 }
    case 0x1: {
      const size = 1 << info
      return {
        kind: 'int',
        value: readUInt(buf, offset + 1, size),
        dataStart: offset + 1,
        dataSize: size,
        next: offset + 1 + size,
      }
    }
    case 0x2: {
      const size = 1 << info
      const value = size === 4 ? buf.readFloatBE(offset + 1) : buf.readDoubleBE(offset + 1)
      return { kind: 'real', value, dataStart: offset + 1, dataSize: size, next: offset + 1 + size }
    }
    case 0x4: {
      // data：`icvp.backgroundImageAlias` 就是它。这里只暴露长度（值本身不在校验范围内）。
      const { count, dataStart } = readCount(buf, offset, info)
      return { kind: 'data', value: count, dataStart, dataSize: count, next: dataStart + count }
    }
    case 0x5: {
      const { count, dataStart } = readCount(buf, offset, info)
      return {
        kind: 'ascii',
        value: buf.toString('ascii', dataStart, dataStart + count),
        dataStart,
        dataSize: count,
        next: dataStart + count,
      }
    }
    case 0x6: {
      const { count, dataStart } = readCount(buf, offset, info)
      let value = ''
      for (let i = 0; i < count; i += 1) value += String.fromCharCode(buf.readUInt16BE(dataStart + i * 2))
      return { kind: 'utf16', value, dataStart, dataSize: count * 2, next: dataStart + count * 2 }
    }
    case 0xd: {
      const { count, keyRefSize, objectRefSize, keysStart } = resolveDictLayout(buf, trailer, offset, info)
      return {
        kind: 'dict',
        count,
        keyRefSize,
        objectRefSize,
        keysStart,
        next: keysStart + count * (keyRefSize + objectRefSize),
      }
    }
    default:
      return { kind: 'unknown', next: offset + 1 }
  }
}

function readTrailer(buf) {
  const t = buf.length - 32
  return {
    offsetIntSize: buf[t + 6],
    objectRefSize: buf[t + 7],
    numObjects: readUInt(buf, t + 8, 8),
    topObject: readUInt(buf, t + 16, 8),
    offsetTableOffset: readUInt(buf, t + 24, 8),
  }
}

function objectOffset(buf, trailer, ref) {
  return readUInt(buf, trailer.offsetTableOffset + ref * trailer.offsetIntSize, trailer.offsetIntSize)
}

/**
 * 在 `.DS_Store` 里定位某类记录。type 需为 4 字节 ASCII 记录名（'icvp' / 'bwsp' / 'Iloc'）。
 * 会对 payload 长度做合理性校验，避免 payload 内恰好出现同样字节时被误判。
 */
export function findRecords(buf, type) {
  const found = []
  const needle = Buffer.from(type, 'ascii')
  if (needle.length !== 4) throw new Error(`记录类型必须是 4 字节 ASCII：${type}`)

  let cursor = 0
  for (;;) {
    const headerOffset = buf.indexOf(needle, cursor, 'ascii')
    if (headerOffset === -1) break
    cursor = headerOffset + 4

    if (headerOffset < 4) continue
    const length = readUInt(buf, headerOffset + 8, 4)
    const payloadStart = headerOffset + RECORD_HEADER_SIZE
    if (length <= 0 || payloadStart + length > buf.length) continue

    found.push({ type, headerOffset, payloadStart, length })
  }
  return found
}

/** 打开一条 bplist00 记录，返回可读写的 payload 视图与其根 dict 偏移。 */
export function openPlistRecord(buf, record) {
  const payload = buf.subarray(record.payloadStart, record.payloadStart + record.length)
  if (payload.subarray(0, 8).toString('ascii') !== PLIST_MAGIC) {
    throw new Error(`记录 ${record.type} 的 payload 不是 ${PLIST_MAGIC}`)
  }
  const trailer = readTrailer(payload)
  return {
    payload,
    trailer,
    dictOffset: objectOffset(payload, trailer, trailer.topObject),
  }
}

/** 在 plist dict 里查一个键，返回键与值对象的字节位置。 */
export function plistDictLookup(opened, key) {
  const { payload, trailer, dictOffset } = opened
  const dict = readPlistObject(payload, trailer, dictOffset)
  if (dict.kind !== 'dict') throw new Error(`根对象不是 dict，实际是 ${dict.kind}`)

  const valuesStart = dict.keysStart + dict.count * dict.keyRefSize
  for (let i = 0; i < dict.count; i += 1) {
    const keyRef = readUInt(payload, dict.keysStart + i * dict.keyRefSize, dict.keyRefSize)
    const keyObject = readPlistObject(payload, trailer, objectOffset(payload, trailer, keyRef))
    if (keyObject.kind !== 'ascii' || keyObject.value !== key) continue

    const valueRef = readUInt(payload, valuesStart + i * dict.objectRefSize, dict.objectRefSize)
    const valueOffset = objectOffset(payload, trailer, valueRef)
    return { valueOffset, value: readPlistObject(payload, trailer, valueOffset) }
  }
  return null
}

export function plistDictEntries(opened) {
  const { payload, trailer, dictOffset } = opened
  const dict = readPlistObject(payload, trailer, dictOffset)
  if (dict.kind !== 'dict') throw new Error(`根对象不是 dict，实际是 ${dict.kind}`)

  const valuesStart = dict.keysStart + dict.count * dict.keyRefSize
  const out = {}
  for (let i = 0; i < dict.count; i += 1) {
    const keyRef = readUInt(payload, dict.keysStart + i * dict.keyRefSize, dict.keyRefSize)
    const keyObject = readPlistObject(payload, trailer, objectOffset(payload, trailer, keyRef))
    const valueRef = readUInt(payload, valuesStart + i * dict.objectRefSize, dict.objectRefSize)
    const valueObject = readPlistObject(payload, trailer, objectOffset(payload, trailer, valueRef))
    if (keyObject.kind === 'ascii') out[keyObject.value] = valueObject.value
  }
  return out
}

/** 等长覆写一个 ASCII 短串值。长度不同会破坏 bplist 结构，因此直接拒绝。 */
export function overwriteAsciiString(opened, key, next) {
  const hit = plistDictLookup(opened, key)
  if (!hit) throw new Error(`plist 里找不到键 ${key}`)
  if (hit.value.kind !== 'ascii') throw new Error(`键 ${key} 不是 ASCII 短串，实际是 ${hit.value.kind}`)
  if (hit.value.dataSize !== Buffer.byteLength(next, 'ascii')) {
    throw new Error(
      `键 ${key} 的值长度必须等长：当前 ${hit.value.dataSize} 字节，目标 "${next}" 为 ` +
        `${Buffer.byteLength(next, 'ascii')} 字节。等长是这个实现的硬约束，不做记录表重排。`,
    )
  }
  opened.payload.write(next, hit.value.dataStart, 'ascii')
}

/** 等长覆写一个 real 值（iconSize / textSize 都是 8 字节 BE double）。 */
export function overwriteReal(opened, key, next) {
  const hit = plistDictLookup(opened, key)
  if (!hit) throw new Error(`plist 里找不到键 ${key}`)
  if (hit.value.kind !== 'real' || hit.value.dataSize !== 8) {
    throw new Error(`键 ${key} 不是 8 字节 real，实际是 ${hit.value.kind}/${hit.value.dataSize}`)
  }
  opened.payload.writeDoubleBE(next, hit.value.dataStart)
}

/** 覆写一个固定宽度的整数值（backgroundType 等 Finder 枚举字段）。 */
export function overwriteInteger(opened, key, next) {
  const hit = plistDictLookup(opened, key)
  if (!hit) throw new Error(`plist 里找不到键 ${key}`)
  if (hit.value.kind !== 'int' || hit.value.dataSize < 1 || hit.value.dataSize > 6) {
    throw new Error(`键 ${key} 不是可覆写的整数，实际 ${hit.value.kind}/${hit.value.dataSize}`)
  }
  if (!Number.isInteger(next) || next < 0 || next >= 2 ** (hit.value.dataSize * 8)) {
    throw new Error(`键 ${key} 的目标值超出 ${hit.value.dataSize} 字节整数范围：${next}`)
  }
  for (let offset = hit.value.dataSize - 1; offset >= 0; offset -= 1) {
    opened.payload[hit.value.dataStart + offset] = next & 0xff
    next >>>= 8
  }
}

export function readIloc(buf, record) {
  if (record.length !== ILOC_PAYLOAD_SIZE) {
    throw new Error(`Iloc payload 应为 ${ILOC_PAYLOAD_SIZE} 字节，实际 ${record.length}`)
  }
  return { x: buf.readUInt32BE(record.payloadStart), y: buf.readUInt32BE(record.payloadStart + 4) }
}

export function overwriteIloc(buf, record, x, y) {
  if (record.length !== ILOC_PAYLOAD_SIZE) {
    throw new Error(`Iloc payload 应为 ${ILOC_PAYLOAD_SIZE} 字节，实际 ${record.length}`)
  }
  buf.writeUInt32BE(x, record.payloadStart)
  buf.writeUInt32BE(y, record.payloadStart + 4)
}

export function utf16beBytes(text) {
  const out = Buffer.alloc(text.length * 2)
  for (let i = 0; i < text.length; i += 1) out.writeUInt16BE(text.charCodeAt(i) & 0xffff, i * 2)
  return out
}

/**
 * 判断一条 Iloc 记录属于哪个条目。
 *
 * 条目名（UTF-16BE）位于 'Iloc' 之前，但两者之间的间隔不固定，所以不按固定偏移解析，
 * 而是向前扫一段窗口取最近的匹配。这比猜偏移稳。
 */
export function ilocOwnerName(buf, record, candidates, window = 320) {
  const from = Math.max(0, record.headerOffset - window)
  const slice = buf.subarray(from, record.headerOffset)

  let best = null
  for (const name of candidates) {
    const index = slice.lastIndexOf(utf16beBytes(name))
    if (index !== -1 && (best === null || index > best.index)) best = { name, index }
  }
  return best === null ? null : best.name
}
