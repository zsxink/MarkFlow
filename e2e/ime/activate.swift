// MARK: - P4B 7.3 real-IME helper
//
// Activates a running app by PID and posts PHYSICAL key events through the
// Quartz event tap so the active system input method performs real
// composition. WebDriver text injection is explicitly NOT accepted as
// equivalent evidence — see
// validation/issues/20260830-p4b-real-ime-locked-session.md.
//
// Usage:
//   activate --info
//   activate <pid> [--keys "zhongwen " ] [--waitMs 5000]
//
// `--keys` accepts ASCII letters, digits, space, and Enter (as '\n') and maps
// them to fixed ANSI virtual keycodes. This is deliberately layout-independent:
// a Pinyin/Kotoeri session receives the raw romanized keystrokes and performs
// its own candidate composition.
import Foundation
import AppKit
import Carbon

// ANSI virtual keycodes (kVK_*), layout-independent for the romanized range.
// Escape / Backspace are addressable as the two-character escapes `\e` and `\b`
// so they can ride along in the same `--keys` string.
let escapeCodeTable: [Character: UInt16] = [
    "e": 53, "b": 51, "r": 36, "t": 48,
    "l": 123, "R": 124, "d": 125, "u": 126,
]

let keyCodeTable: [Character: UInt16] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8,
    "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25,
    "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33,
    "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42,
    ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, " ": 49, "\n": 36,
]

func jsonOut(_ obj: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}

/// Posting to the HID event tap requires the caller to be an Accessibility
/// (Process Trusted) client. Without it events are silently dropped, which
/// would look exactly like "the IME did nothing".
func accessibilityTrusted() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

func frontmostInfo() -> [String: Any] {
    guard let app = NSWorkspace.shared.frontmostApplication else {
        return ["bundleId": "", "frontmost": NSNull(), "pid": -1]
    }
    return [
        "bundleId": app.bundleIdentifier ?? "",
        "frontmost": app.localizedName ?? "unknown",
        "pid": app.processIdentifier,
    ]
}

/// Reads the text of the AX-focused element of an app. AppleScript cannot do
/// this from a non-GUI context (Automation permission is separate from
/// Accessibility trust), so we go through AXUIElement directly. This is the
/// control experiment that proves the HID key pipeline really delivers text.
func axFocusedText(_ pid: pid_t) -> [String: Any] {
    let app = AXUIElementCreateApplication(pid)
    var focusedWindow: CFTypeRef?
    let winErr = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focusedWindow)
    guard winErr == .success, let win = focusedWindow else {
        return ["ok": false, "error": "focusedWindow err=\(winErr.rawValue)"]
    }
    var focusedEl: CFTypeRef?
    let elErr = AXUIElementCopyAttributeValue(win as! AXUIElement, kAXFocusedUIElementAttribute as CFString, &focusedEl)
    if elErr != .success || focusedEl == nil {
        // Fall back to walking the window's own attributes.
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(win as! AXUIElement, kAXRoleAttribute as CFString, &role)
        return ["ok": false, "error": "focusedUIElement err=\(elErr.rawValue)", "windowRole": role as? String ?? ""]
    }
    let el = focusedEl as! AXUIElement
    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
    var value: CFTypeRef?
    let vErr = AXUIElementCopyAttributeValue(el, kAXValueAttribute as CFString, &value)
    return [
        "ok": true,
        "role": role as? String ?? "",
        "valueErr": vErr.rawValue,
        "value": (value as? String) ?? "",
        "valueLength": (value as? String)?.count ?? 0,
    ]
}

/// Depth-limited AX dump. Needed because the *focused* element is often not
/// reported (kAXErrorNoValue) while a descendant still holds the typed text.
func axWalk(_ el: AXUIElement, depth: Int, into out: inout [[String: Any]]) {
    if depth > 6 || out.count > 120 { return }
    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXValueAttribute as CFString, &value)
    var desc: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXDescriptionAttribute as CFString, &desc)
    var children: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children)
    let kids = children as? [AXUIElement] ?? []
    out.append([
        "depth": depth,
        "role": role as? String ?? "",
        "value": String(((value as? String) ?? "").prefix(200)),
        "valueLen": (value as? String)?.count ?? 0,
        "desc": String(((desc as? String) ?? "").prefix(80)),
        "children": kids.count,
    ])
    for kid in kids { axWalk(kid, depth: depth + 1, into: &out) }
}

// MARK: - Text Input Services control
//
// The spec must not depend on whichever input source happens to be selected:
// it selects the target source explicitly and restores the original
// afterwards. `TISEnableInputSource` is the supported way to add a source
// that ships with macOS (Kotoeri) without opening System Settings.

/// `TISGetInputSourceProperty` returns a raw pointer whose type varies per
/// property. Bridging it blindly crashes, so every read is type-guarded.
func tisPtr(_ src: TISInputSource, _ key: CFString) -> CFTypeRef? {
    guard let ptr = TISGetInputSourceProperty(src, key) else { return nil }
    return Unmanaged<CFTypeRef>.fromOpaque(ptr).takeUnretainedValue()
}

func tisString(_ src: TISInputSource, _ key: CFString) -> String? {
    guard let cf = tisPtr(src, key), CFGetTypeID(cf) == CFStringGetTypeID() else { return nil }
    return cf as? String
}

func tisBool(_ src: TISInputSource, _ key: CFString) -> Bool {
    guard let cf = tisPtr(src, key), CFGetTypeID(cf) == CFBooleanGetTypeID() else { return false }
    return CFBooleanGetValue(cf as! CFBoolean)
}

func inputSourceId(_ src: TISInputSource) -> String {
    tisString(src, kTISPropertyInputSourceID) ?? ""
}

func inputSourceList(_ includeAll: Bool) -> [[String: Any]] {
    // Passing a property dictionary that mixes non-filter keys (localized
    // name) makes TIS return objects it cannot describe; ask for everything
    // and filter here instead.
    guard let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] else { return [] }
    return list.compactMap { src in
        let id = inputSourceId(src)
        guard !id.isEmpty else { return nil }
        let enabled = tisBool(src, kTISPropertyInputSourceIsEnabled)
        let selectable = tisBool(src, kTISPropertyInputSourceIsSelectCapable)
        guard includeAll || selectable || enabled else { return nil }
        return [
            "enabled": enabled,
            "id": id,
            "name": tisString(src, kTISPropertyLocalizedName) ?? "",
            "selectCapable": selectable,
        ]
    }
}

func findSource(_ id: String) -> TISInputSource? {
    let props = [kTISPropertyInputSourceID: id as CFString] as CFDictionary
    guard let list = TISCreateInputSourceList(props, true)?.takeRetainedValue() as? [TISInputSource],
          let first = list.first else { return nil }
    return first
}

let args = CommandLine.arguments

if args.contains("--list-sources") {
    jsonOut(["ok": true, "sources": inputSourceList(true)])
    exit(0)
}

if let sIdx = args.firstIndex(of: "--select"), sIdx + 1 < args.count {
    let id = args[sIdx + 1]
    guard let src = findSource(id) else {
        jsonOut(["error": "input source not installed", "id": id, "ok": false])
        exit(5)
    }
    let status = TISSelectInputSource(src)
    jsonOut(["id": id, "ok": status == noErr, "status": status])
    exit(0)
}

if let eIdx = args.firstIndex(of: "--enable"), eIdx + 1 < args.count {
    let id = args[eIdx + 1]
    guard let src = findSource(id) else {
        jsonOut(["error": "input source not installed", "id": id, "ok": false])
        exit(5)
    }
    let status = TISEnableInputSource(src)
    jsonOut([
        "enabled": tisBool(src, kTISPropertyInputSourceIsEnabled),
        "id": id,
        "ok": status == noErr,
        "status": status,
    ])
    exit(0)
}

if let cIdx = args.firstIndex(of: "--current") {
    guard let src = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() else {
        jsonOut(["error": "no current input source", "ok": false])
        exit(6)
    }
    jsonOut([
        "id": inputSourceId(src),
        "name": tisString(src, kTISPropertyLocalizedName) ?? "",
        "ok": true,
    ])
    exit(cIdx >= 0 ? 0 : 0)
}

if let wIdx = args.firstIndex(of: "--axwalk"), wIdx + 1 < args.count, let p = pid_t(args[wIdx + 1]) {
    var nodes: [[String: Any]] = []
    axWalk(AXUIElementCreateApplication(p), depth: 0, into: &nodes)
    jsonOut(["nodes": nodes, "ok": true, "pid": p])
    exit(0)
}

if let aIdx = args.firstIndex(of: "--axtext"), aIdx + 1 < args.count, let p = pid_t(args[aIdx + 1]) {
    jsonOut(axFocusedText(p))
    exit(0)
}

if args.contains("--info") {
    var info = frontmostInfo()
    info["ok"] = true
    info["accessibilityTrusted"] = accessibilityTrusted()
    jsonOut(info)
    exit(0)
}

guard args.count >= 2, let pid = pid_t(args[1]) else {
    jsonOut(["error": "usage: activate <pid> [--keys <string>]", "ok": false])
    exit(2)
}

guard let target = NSRunningApplication(processIdentifier: pid) else {
    jsonOut(["error": "no running app for pid", "ok": false, "pid": pid])
    exit(3)
}

let activated = target.activate(options: [.activateIgnoringOtherApps])
var waited = 0
while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && waited < 500 {
    RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    waited += 1
}

var result: [String: Any] = [
    "accessibilityTrusted": accessibilityTrusted(),
    "activated": activated,
    "becameFrontmost": NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
    "frontmost": frontmostInfo(),
    "ok": true,
    "pid": pid,
    "waitedMs": waited * 10,
]

if let kIdx = args.firstIndex(of: "--keys"), kIdx + 1 < args.count {
    let keys = args[kIdx + 1]
    guard let src = CGEventSource(stateID: .combinedSessionState) else {
        result["ok"] = false
        result["typeError"] = "no event source"
        jsonOut(result)
        exit(4)
    }
    src.localEventsSuppressionInterval = 0
    var posted = 0
    var unmapped: [String] = []
    // Route through the HID event tap so events travel the normal
    // window-server → focused-app → Text Input Services path. `postToPid`
    // delivers straight to a process and therefore BYPASSES the system input
    // method, which is why it cannot produce real composition evidence.
    var chars = Array(keys)
    var i = 0
    while i < chars.count {
        let ch = chars[i]
        var code: UInt16?
        if ch == "\\", i + 1 < chars.count, let esc = escapeCodeTable[chars[i + 1]] {
            code = esc
            i += 1
        } else {
            code = keyCodeTable[ch]
        }
        i += 1
        guard let code else {
            unmapped.append(String(ch))
            continue
        }
        if let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true) {
            down.post(tap: .cghidEventTap)
        }
        if let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false) {
            up.post(tap: .cghidEventTap)
        }
        posted += 1
        usleep(70_000)
    }
    result["postedKeys"] = posted
    result["requestedKeys"] = keys
    if !unmapped.isEmpty { result["unmapped"] = unmapped }
}

jsonOut(result)
