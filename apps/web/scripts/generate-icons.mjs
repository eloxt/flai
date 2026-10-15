// Draws the FlaiChat app icons (favicons, touch and PWA icons) into public/.
// The mark is four rectangles on the 24-unit grid of app/components/flai-mark.tsx, so it can
// be rasterised exactly here (per-pixel area coverage) without an SVG renderer.
//   node scripts/generate-icons.mjs
import { writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"

const OUT = new URL("../public/", import.meta.url)

/** [x, y, width, height] on the 24-unit grid; keep in sync with FlaiMark. */
const MARK = [
  [3, 3, 3.5, 18],
  [6.5, 3, 10.5, 3.5],
  [6.5, 10, 6.5, 3.5],
  [17, 10, 3, 11],
]
const BOX = { x: 3, y: 3, w: 17, h: 18 }

const TILE = [0x1c, 0x19, 0x17] // stone-900, the app's ink
const INK = [0xfa, 0xfa, 0xf9] // stone-50, the app's page colour

/**
 * Place the mark on a size×size tile with its height a `scale` fraction of the tile, centred.
 * Small icons snap edges to whole pixels so strokes stay crisp.
 */
function layout(size, scale, snap) {
  const k = (size * scale) / BOX.h
  const ox = (size - BOX.w * k) / 2 - BOX.x * k
  const oy = (size - BOX.h * k) / 2 - BOX.y * k
  return MARK.map(([x, y, w, h]) => {
    let x0 = ox + x * k
    let y0 = oy + y * k
    let x1 = x0 + w * k
    let y1 = y0 + h * k
    if (snap) {
      ;[x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round)
      x1 = Math.max(x1, x0 + 1)
      y1 = Math.max(y1, y0 + 1)
    }
    return [x0, y0, x1, y1]
  })
}

function rasterise(size, scale) {
  const rects = layout(size, scale, size <= 48)
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0
      for (const [x0, y0, x1, y1] of rects) {
        const w = Math.min(px + 1, x1) - Math.max(px, x0)
        const h = Math.min(py + 1, y1) - Math.max(py, y0)
        if (w > 0 && h > 0) cover += w * h
      }
      cover = Math.min(1, cover)
      const i = (py * size + px) * 4
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(TILE[c] + (INK[c] - TILE[c]) * cover)
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, rgba)
}

// ---------------------------------------------------------------- PNG / ICO encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])))
  return Buffer.concat([head, data, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/** An .ico holding PNG images (supported by every current browser). */
function encodeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16
    header[e] = size >= 256 ? 0 : size
    header[e + 1] = size >= 256 ? 0 : size
    header.writeUInt16LE(1, e + 4) // planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

function svg(scale) {
  const size = 32
  const rects = layout(size, scale, false)
    .map(([x0, y0, x1, y1]) => `<rect x="${+x0.toFixed(3)}" y="${+y0.toFixed(3)}" width="${+(x1 - x0).toFixed(3)}" height="${+(y1 - y0).toFixed(3)}"/>`)
    .join("")
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${hex(TILE)}"/><g fill="${hex(INK)}">${rects}</g></svg>\n`
}

// ---------------------------------------------------------------- outputs

// How much of the tile's height the mark takes: tight at favicon sizes (legibility), roomier
// for home-screen icons, and inside the 80% safe zone for maskable ones.
const FAVICON = 0.6
const APP = 0.5
const MASKABLE = 0.42

const files = {
  "favicon-16x16.png": rasterise(16, FAVICON),
  "favicon-32x32.png": rasterise(32, FAVICON),
  "apple-touch-icon.png": rasterise(180, APP),
  "android-chrome-192x192.png": rasterise(192, APP),
  "android-chrome-512x512.png": rasterise(512, APP),
  "icon-192-maskable.png": rasterise(192, MASKABLE),
  "icon-512-maskable.png": rasterise(512, MASKABLE),
  "favicon.ico": encodeIco([16, 32, 48].map((size) => ({ size, png: rasterise(size, FAVICON) }))),
  "favicon.svg": svg(FAVICON),
}
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), data)
  console.log(`wrote public/${name}`)
}
