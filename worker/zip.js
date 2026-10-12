const encoder = new TextEncoder();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function u16(out, value) { out.push(value & 255, (value >>> 8) & 255); }
function u32(out, value) { u16(out, value); u16(out, value >>> 16); }

export function zipFiles(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.includes('..')) throw new Error('Invalid ZIP entry name');
    const filename = encoder.encode(name);
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(bytes);
    const header = [];
    u32(header, 0x04034b50); u16(header, 20); u16(header, 0x0800); u16(header, 0);
    u16(header, 0); u16(header, 0); u32(header, crc); u32(header, bytes.length); u32(header, bytes.length);
    u16(header, filename.length); u16(header, 0);
    local.push(Uint8Array.from(header), filename, bytes);
    const entry = [];
    u32(entry, 0x02014b50); u16(entry, 20); u16(entry, 20); u16(entry, 0x0800); u16(entry, 0);
    u16(entry, 0); u16(entry, 0); u32(entry, crc); u32(entry, bytes.length); u32(entry, bytes.length);
    u16(entry, filename.length); u16(entry, 0); u16(entry, 0); u16(entry, 0); u16(entry, 0); u32(entry, 0); u32(entry, offset);
    central.push(Uint8Array.from(entry), filename);
    offset += header.length + filename.length + bytes.length;
  }
  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const footer = [];
  u32(footer, 0x06054b50); u16(footer, 0); u16(footer, 0);
  u16(footer, Object.keys(files).length); u16(footer, Object.keys(files).length);
  u32(footer, centralSize); u32(footer, offset); u16(footer, 0);
  const parts = [...local, ...central, Uint8Array.from(footer)];
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let cursor = 0;
  for (const part of parts) { output.set(part, cursor); cursor += part.length; }
  return output;
}
