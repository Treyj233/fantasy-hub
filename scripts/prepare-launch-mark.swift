import AppKit

// Apply the same 27% corner mask as the bundled and web launch screens.
// Keep the canonical brand artwork unchanged; only the native launch copy changes.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("native-shell/fh-blue-app-mark.png")
let destination = root.appendingPathComponent("ios/App/App/Assets.xcassets/LaunchMark.imageset/fh-blue-app-mark.png")
guard let image = NSImage(contentsOf: source),
      let bitmap = NSBitmapImageRep(data: try Data(contentsOf: source)),
      let output = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: bitmap.pixelsWide,
        pixelsHigh: bitmap.pixelsHigh, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: output) else { fatalError("Invalid logo") }
let rect = NSRect(x: 0, y: 0, width: bitmap.pixelsWide, height: bitmap.pixelsHigh)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSBezierPath(roundedRect: rect, xRadius: rect.width * 0.27, yRadius: rect.height * 0.27).addClip()
image.draw(in: rect, from: .zero, operation: .copy, fraction: 1)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = output.representation(using: .png, properties: [:]) else { fatalError("PNG failed") }
try png.write(to: destination)
print("Prepared transparent-corner native launch logo.")
