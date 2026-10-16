// overlay.swift — Glyphh's native overlay: one effect over Claude's window, or
// over the whole screen.
//
// Compiled by the mod with swiftc the first time a native effect plays
// (hooks/overlay/host.ts) and kept in ~/Library/Caches/glyphh-overlay. The
// protocol is hooks/overlay/overlay.ts's (version 2):
//
//   drips-overlay screen   prints the screen under the pointer as one JSON
//                          line: {"x":0,"y":0,"w":1512,"h":982}
//   drips-overlay apps     prints the apps among this process's ancestors,
//                          nearest first: {"ancestors":[{"pid":N,
//                          "bundleId":"com.apple.Terminal","regular":true}]}
//   drips-overlay window   reads {"v":2,"target":{"bundleId":"...","pid":N,
//                          "pick":"largest"|"frontmost"}} on stdin and prints
//                          that app's window: {"found":true,"id":N,"x":..,
//                          "y":..,"w":..,"h":..}, or the screen under the
//                          pointer with "found":false when it has none
//   drips-overlay play     reads {"v":2,"html":"...","frame":{...},
//                          "closeAfterMs":8000,"layer":"window"|"screen",
//                          "follow":N|null,"interactive":false} on stdin,
//                          shows the document in a transparent, borderless,
//                          click-through window (with "interactive":true, a
//                          game: one that takes the pointer and keys) and
//                          prints {"t":"shown","pid":N}, then
//                          {"t":"closed","why":"signal"|"timeout"|"term"|"orphan"}
//                          as it exits; {"t":"error","message":"..."} when it
//                          cannot.
//
// Frames are points in AppKit's global coordinates (origin at the bottom left
// of the primary display, y up). Windows are found with
// CGWindowListCopyWindowInfo, reading only each window's owner, layer, number
// and bounds: never its title or contents, so no Screen Recording permission
// is needed.
//
// Layer "window" sits at the normal window level, ordered directly above the
// window it follows: over Claude, under anything in front of Claude, and
// under every menu, the Dock and notifications. It follows that window ten
// times a second (moved and resized with it, hidden while it is minimised or
// on another Space). With no window to follow it floats over its frame.
// Layer "screen" is the fullscreen overlay: above everything, on every Space.
//
// It closes on the document's "__drip_close__" (console.log, or a postMessage
// to itself), after closeAfterMs (never more than 30 minutes, whatever it is
// asked), on SIGTERM, or when the process that started it is gone. It never
// takes focus or the pointer, unless the request is interactive (a game):
// then the window accepts clicks (the first one too), becomes key with the
// app activated so the page hears Esc, and Esc closes it even if the page
// does not.

import AppKit
import Darwin
import Foundation
import WebKit

let protocolVersion = 2
let capMs = 30 * 60_000
let minMs = 100
let followHz = 10.0
/// A window smaller than this on either side is a panel or a popover, not the app's window.
let minSide: CGFloat = 120

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
    let line = String(data: data, encoding: .utf8)
  else { return }
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func fail(_ message: String) -> Never {
  emit(["t": "error", "message": message])
  exit(1)
}

// MARK: - Geometry

struct Rect: Codable { let x: Double; let y: Double; let w: Double; let h: Double }

func screenUnderPointer() -> NSScreen? {
  let point = NSEvent.mouseLocation
  return NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main
}

/// CoreGraphics' global rectangles start at the top left of the primary
/// display with y going down; AppKit's at its bottom left with y going up. The
/// primary display (the first screen) is at the origin in both, so one flip
/// about its height converts any display's rectangle.
func appKitRect(_ cg: CGRect) -> NSRect {
  let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
  return NSRect(x: cg.minX, y: primaryHeight - cg.maxY, width: cg.width, height: cg.height)
}

func rectJSON(_ r: NSRect) -> [String: Any] {
  ["x": r.origin.x, "y": r.origin.y, "w": r.size.width, "h": r.size.height]
}

// MARK: - Windows (owner, layer, number and bounds only)

func windowInfos(_ option: CGWindowListOption, _ id: CGWindowID = kCGNullWindowID) -> [[String: Any]] {
  (CGWindowListCopyWindowInfo(option, id) as? [[String: Any]]) ?? []
}

func number(_ info: [String: Any], _ key: CFString) -> Int? { (info[key as String] as? NSNumber)?.intValue }

func bounds(_ info: [String: Any]) -> CGRect? {
  guard let dict = info[kCGWindowBounds as String] as? NSDictionary else { return nil }
  return CGRect(dictionaryRepresentation: dict as CFDictionary)
}

struct Target: Decodable { let bundleId: String?; let pid: Int32?; let pick: String }
struct WindowRequest: Decodable { let v: Int; let target: Target }

/// The target app's window: on screen, at the normal layer, not tiny; the
/// frontmost of them, or the largest.
func findWindow(_ target: Target) -> (id: CGWindowID, frame: CGRect)? {
  var owners = Set<pid_t>()
  if let pid = target.pid { owners.insert(pid) }
  if let bundleId = target.bundleId {
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: bundleId) { owners.insert(app.processIdentifier) }
  }
  owners.remove(getpid())
  // Front to back, as the window server stacks them.
  let candidates: [(id: CGWindowID, frame: CGRect)] = windowInfos([.optionOnScreenOnly, .excludeDesktopElements]).compactMap { info in
    guard let owner = number(info, kCGWindowOwnerPID), owners.contains(pid_t(owner)),
      number(info, kCGWindowLayer) == 0,
      let id = number(info, kCGWindowNumber),
      (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1 > 0,
      let frame = bounds(info), frame.width >= minSide, frame.height >= minSide
    else { return nil }
    return (CGWindowID(id), frame)
  }
  if target.pick == "frontmost" { return candidates.first }
  return candidates.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
}

/// A window's frame while it is on screen; nil when it is minimised, on
/// another Space, or gone.
func onScreenFrame(_ id: CGWindowID) -> CGRect? {
  guard let info = windowInfos(.optionIncludingWindow, id).first,
    (info[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue == true
  else { return nil }
  return bounds(info)
}

// MARK: - Ancestors

func parentOf(_ pid: pid_t) -> pid_t? {
  var info = kinfo_proc()
  var size = MemoryLayout<kinfo_proc>.stride
  var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
  guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return nil }
  return info.kp_eproc.e_ppid
}

func executablePath(_ pid: pid_t) -> String? {
  var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
  return proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 ? String(cString: buffer) : nil
}

/// The bundle a process belongs to: the running app's, or the app bundle its
/// executable sits in.
func bundleIdOf(_ pid: pid_t) -> (id: String?, regular: Bool) {
  if let app = NSRunningApplication(processIdentifier: pid), let id = app.bundleIdentifier {
    return (id, app.activationPolicy == .regular)
  }
  guard let path = executablePath(pid), let range = path.range(of: ".app/Contents/MacOS/", options: .backwards) else { return (nil, false) }
  return (Bundle(path: String(path[..<range.lowerBound]) + ".app")?.bundleIdentifier, false)
}

func ancestors() -> [[String: Any]] {
  var found: [[String: Any]] = []
  var pid = getppid()
  var seen = Set<pid_t>()
  while pid > 1, !seen.contains(pid) {
    seen.insert(pid)
    let (id, regular) = bundleIdOf(pid)
    if let id { found.append(["pid": Int(pid), "bundleId": id, "regular": regular]) }
    guard let parent = parentOf(pid) else { break }
    pid = parent
  }
  return found
}

// MARK: - Playing

struct PlayRequest: Decodable {
  let v: Int
  let html: String
  let frame: Rect
  let closeAfterMs: Double
  let layer: String
  let follow: UInt32?
  let interactive: Bool?
}

/// A borderless window that can become key: a game's, so its page hears keys.
final class KeyWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

/// Takes the click that activates the window, so a game's first shot counts.
final class GameWebView: WKWebView {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Hears the document's close signal: console.log("__drip_close__") is
/// forwarded here by a script added before the document's own, and so is a
/// postMessage of it to the window itself. A game's score comes the same way,
/// posted as {__drip_score__: n}, and is printed as a score event.
final class CloseListener: NSObject, WKScriptMessageHandler {
  let onClose: () -> Void
  init(onClose: @escaping () -> Void) { self.onClose = onClose }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    if (message.body as? String) == "__drip_close__" { onClose() }
    if let body = message.body as? [String: Any], let score = body["score"] as? NSNumber, score.doubleValue.isFinite, score.intValue >= 0 {
      emit(["t": "score", "score": score.intValue])
    }
  }
}

let closeBridge = """
  (function () {
    var send = function (v) { try {
      if (v === "__drip_close__") window.webkit.messageHandlers.drip.postMessage(v);
      else if (v && typeof v.__drip_score__ === "number") window.webkit.messageHandlers.drip.postMessage({ score: v.__drip_score__ });
    } catch (e) {} };
    var log = console.log;
    console.log = function () { send(arguments[0]); return log.apply(console, arguments) };
    window.addEventListener("message", function (ev) { send(ev.data) });
  })();
  """

final class Overlay: NSObject, NSApplicationDelegate {
  let request: PlayRequest
  var window: NSWindow?
  var closed = false
  var signalSource: DispatchSourceSignal?
  let parent = getppid()

  init(request: PlayRequest) { self.request = request }

  func applicationDidFinishLaunching(_ note: Notification) {
    let r = request.frame
    let frame = NSRect(x: r.x, y: r.y, width: r.w, height: r.h)
    let interactive = request.interactive == true
    let window: NSWindow = interactive
      ? KeyWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
      : NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
    window.isOpaque = false
    window.backgroundColor = .clear
    window.hasShadow = false
    window.ignoresMouseEvents = !interactive
    window.acceptsMouseMovedEvents = interactive
    window.isReleasedWhenClosed = false
    if request.layer == "screen" {
      window.level = .screenSaver
      window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    } else {
      window.level = request.follow == nil ? .floating : .normal
      window.collectionBehavior = [.fullScreenAuxiliary, .ignoresCycle]
    }

    let config = WKWebViewConfiguration()
    // Sounds play from the first frame: a click-through effect never gets a
    // click, and a game's intro comes before one.
    config.mediaTypesRequiringUserActionForPlayback = []
    let controller = WKUserContentController()
    controller.add(CloseListener { [weak self] in self?.close("signal") }, name: "drip")
    controller.addUserScript(WKUserScript(source: closeBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    config.userContentController = controller
    let web: WKWebView = interactive
      ? GameWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
      : WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
    web.setValue(false, forKey: "drawsBackground")
    web.autoresizingMask = [.width, .height]
    window.contentView = web
    web.loadHTMLString(request.html, baseURL: nil)
    self.window = window
    if let id = request.follow {
      follow(id)
      Timer.scheduledTimer(withTimeInterval: 1 / followHz, repeats: true) { [weak self] _ in self?.follow(id) }
    } else {
      window.orderFrontRegardless()
    }
    if interactive {
      NSApp.activate(ignoringOtherApps: true)
      window.makeKeyAndOrderFront(nil)
      window.makeFirstResponder(web)
      // Esc quits the game even when the page misses it.
      NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        if event.keyCode == 53 {
          self?.close("signal")
          return nil
        }
        return event
      }
    }
    emit(["t": "shown", "pid": Int(getpid())])

    let ms = min(capMs, max(minMs, Int(request.closeAfterMs.isFinite ? request.closeAfterMs : Double(capMs))))
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(ms)) { [weak self] in self?.close("timeout") }
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self else { return }
      if getppid() != self.parent { self.close("orphan") }
    }
    signal(SIGTERM, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    source.setEventHandler { [weak self] in self?.close("term") }
    source.resume()
    signalSource = source
  }

  /// Keeps the overlay on the window it follows: its frame matched, ordered
  /// directly above it, hidden while it is not on screen.
  func follow(_ id: CGWindowID) {
    guard let window, !closed else { return }
    guard let cg = onScreenFrame(id) else {
      if window.isVisible { window.orderOut(nil) }
      return
    }
    let frame = appKitRect(cg)
    if window.frame != frame { window.setFrame(frame, display: true) }
    if !window.isVisible || !isDirectlyAbove(id) { window.order(.above, relativeTo: Int(id)) }
  }

  /// Whether the overlay is the window stacked immediately above `id`.
  func isDirectlyAbove(_ id: CGWindowID) -> Bool {
    let above = windowInfos(.optionOnScreenAboveWindow, id)
    return above.last.flatMap { number($0, kCGWindowNumber) } == window?.windowNumber
  }

  func close(_ why: String) {
    if closed { return }
    closed = true
    window?.orderOut(nil)
    emit(["t": "closed", "why": why])
    exit(0)
  }
}

func readRequest<T: Decodable>(_ type: T.Type, _ what: String) -> T {
  let input = FileHandle.standardInput.readDataToEndOfFile()
  guard let request = try? JSONDecoder().decode(type, from: input) else { fail("not a \(what) request") }
  return request
}

let args = CommandLine.arguments
guard args.count == 2 else { fail("usage: drips-overlay screen | apps | window | play") }

switch args[1] {
case "screen":
  guard let screen = screenUnderPointer() else { fail("no screen") }
  emit(rectJSON(screen.frame))
case "apps":
  emit(["ancestors": ancestors()])
case "window":
  let request = readRequest(WindowRequest.self, "window")
  guard request.v == protocolVersion else { fail("protocol version \(request.v) is not \(protocolVersion)") }
  if let found = findWindow(request.target) {
    emit(rectJSON(appKitRect(found.frame)).merging(["found": true, "id": Int(found.id)]) { a, _ in a })
  } else {
    guard let screen = screenUnderPointer() else { fail("no screen") }
    emit(rectJSON(screen.frame).merging(["found": false]) { a, _ in a })
  }
case "play":
  let request = readRequest(PlayRequest.self, "play")
  guard request.v == protocolVersion else { fail("protocol version \(request.v) is not \(protocolVersion)") }
  guard request.frame.w > 0, request.frame.h > 0 else { fail("no frame size") }
  guard request.layer == "window" || request.layer == "screen" else { fail("unknown layer \(request.layer)") }
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let overlay = Overlay(request: request)
  app.delegate = overlay
  app.run()
default:
  fail("unknown command \(args[1])")
}
