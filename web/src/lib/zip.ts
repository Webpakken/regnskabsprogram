/**
 * Minimal ZIP-writer (kun «stored», ingen komprimering).
 *
 * Vi zipper PDF'er og billeder, der allerede er komprimerede, så deflate ville
 * give ~0 gevinst — til gengæld slipper vi for en ekstra afhængighed. Arkivet
 * bygges i hukommelsen, så det egner sig til eksport i hundredvis af filer,
 * ikke til gigabyte-arkiver.
 */

/** `Uint8Array<ArrayBuffer>`: Blob-konstruktøren afviser SharedArrayBuffer-varianten. */
export type ZipBytes = Uint8Array<ArrayBuffer>

export type ZipEntry = { name: string; data: ZipBytes }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** MS-DOS-tid/dato som ZIP-headeren kræver. */
function dosStamp(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * Gør et navn sikkert som filnavn i arkivet: ingen mappeskift, ingen tegn der
 * driller på Windows/macOS.
 */
export function safeZipName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'fil'
  )
}

export function buildZip(entries: ZipEntry[], now = new Date()): Blob {
  const encoder = new TextEncoder()
  const { time, date } = dosStamp(now)
  const parts: ZipBytes[] = []
  const central: ZipBytes[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8-navne
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    const dir = new Uint8Array(46 + name.length)
    const dv = new DataView(dir.buffer)
    dv.setUint32(0, 0x02014b50, true)
    dv.setUint16(4, 20, true) // version made by
    dv.setUint16(6, 20, true) // version needed
    dv.setUint16(8, 0x0800, true)
    dv.setUint16(10, 0, true)
    dv.setUint16(12, time, true)
    dv.setUint16(14, date, true)
    dv.setUint32(16, crc, true)
    dv.setUint32(20, size, true)
    dv.setUint32(24, size, true)
    dv.setUint16(28, name.length, true)
    dv.setUint32(42, offset, true)
    dir.set(name, 46)

    parts.push(local, entry.data)
    central.push(dir)
    offset += local.length + size
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}
