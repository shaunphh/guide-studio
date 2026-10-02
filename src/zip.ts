// Stored ZIP entries: PNGs are already compressed. No network export dependency.
const encoder = new TextEncoder()
const table = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
export const crc32 = (data: Uint8Array) => { let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Blob {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = []
  let offset = 0, directorySize = 0
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.bytes)
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, file.bytes.length, true); h.setUint32(22, file.bytes.length, true); h.setUint16(26, name.length, true); header.set(name, 30)
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, file.bytes.length, true); c.setUint32(24, file.bytes.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46)
    chunks.push(header, file.bytes); directory.push(central); directorySize += central.length; offset += header.length + file.bytes.length
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' })
}
