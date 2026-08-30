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

// ANSI virtual keycodes (kVK_*), layout-independent for the romanized range.
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

let args = CommandLine.arguments

if args.contains("--info") {
    var info = frontmostInfo()
    info["ok"] = true
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
    for ch in keys {
        guard let code = keyCodeTable[ch] else {
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
