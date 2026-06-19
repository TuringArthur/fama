import sharp from "sharp"
import { writeFileSync } from "fs"

const input = "assets/logo图案（透明底上下排列）.png"
const output = "packages/desktop/icons/dev/icon.ico"

// Generate multiple sizes for ICO
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function generateIco() {
  const buffers: Buffer[] = []
  
  for (const size of sizes) {
    const buf = await sharp(input)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    buffers.push(buf)
  }

  // Create ICO file manually
  // ICO format: header + entries + image data
  const headerSize = 6
  const entrySize = 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type: ICO
  header.writeUInt16LE(sizes.length, 4) // Number of images

  let offset = headerSize + entrySize * sizes.length
  const entries: Buffer[] = []
  const images: Buffer[] = []

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]
    const buf = buffers[i]
    
    const entry = Buffer.alloc(entrySize)
    entry.writeUInt8(size === 256 ? 0 : size, 0) // Width
    entry.writeUInt8(size === 256 ? 0 : size, 1) // Height
    entry.writeUInt8(0, 2) // Color palette
    entry.writeUInt8(0, 3) // Reserved
    entry.writeUInt16LE(1, 4) // Color planes
    entry.writeUInt16LE(32, 6) // Bits per pixel
    entry.writeUInt32LE(buf.length, 8) // Image size
    entry.writeUInt32LE(offset, 12) // Image offset
    entries.push(entry)
    images.push(buf)
    offset += buf.length
  }

  const ico = Buffer.concat([header, ...entries, ...images])
  writeFileSync(output, ico)
  console.log(`Generated ICO file: ${output}`)
}

generateIco().catch(console.error)
