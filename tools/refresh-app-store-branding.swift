import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let logoURL = root.appendingPathComponent("public/marketing/app-store/fh-blue-app-mark.png")
let screenshots = root.appendingPathComponent("public/marketing/app-store/iphone-6.5")
let masters = root.appendingPathComponent("public/marketing/app-store/generated-masters")

guard let logo = NSImage(contentsOf: logoURL) else {
  fatalError("Missing live Fantasy Hub logo")
}

func refresh(_ url: URL) throws {
  guard let source = NSImage(contentsOf: url),
        let bitmap = NSBitmapImageRep(
          bitmapDataPlanes: nil,
          pixelsWide: 1242,
          pixelsHigh: 2688,
          bitsPerSample: 8,
          samplesPerPixel: 4,
          hasAlpha: true,
          isPlanar: false,
          colorSpaceName: .deviceRGB,
          bytesPerRow: 0,
          bitsPerPixel: 0
        ) else { return }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  source.draw(in: NSRect(x: 0, y: 0, width: 1242, height: 2688))

  // The blue app mark is composited directly into the existing scene. It owns
  // its internal white tile; no extra white brand plate is added around it.
  logo.draw(in: NSRect(x: 421, y: 2294, width: 400, height: 400), from: .zero, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()

  guard let data = bitmap.representation(using: .png, properties: [:]) else { return }
  try data.write(to: url, options: .atomic)
}

let files = try FileManager.default.contentsOfDirectory(at: screenshots, includingPropertiesForKeys: nil)
  .filter { $0.pathExtension.lowercased() == "png" }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }

for file in files {
  try refresh(file)
  try FileManager.default.copyItemReplacing(at: file, to: masters.appendingPathComponent(file.lastPathComponent))
}

extension FileManager {
  func copyItemReplacing(at source: URL, to destination: URL) throws {
    if fileExists(atPath: destination.path) { try removeItem(at: destination) }
    try copyItem(at: source, to: destination)
  }
}
