// ── Opaque range handling ─────────────────────────────────────────────
//
// Two halves: `scanner.ts` locates opaque spans in the raw source, and
// `registry.ts` mints/validates the session-local sentinels that stand in for
// those spans inside the editor document. Both are re-exported here so callers
// keep a single import surface.

export {
  scanCodeRegions,
  scanOpaqueSpans,
  type CodeRegion,
  type OpaqueScanResult,
  type OpaqueSpan,
} from './scanner';
export {
  OPAQUE_SENTINEL_PREFIX,
  OPAQUE_SENTINEL_SUFFIX,
  OpaqueRegistry,
  containsSentinel,
  opaqueDigest,
  parseSentinel,
  sentinelFor,
  type OpaqueRegistryOptions,
  type RandomSource,
} from './registry';
export type { OpaqueCategory, OpaqueEntry } from '../types';
