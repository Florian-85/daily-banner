"use strict";
// A minimal TrueType (glyf) reader, subsetter and WOFF writer. No dependency.
// Authoring-time only: it runs when the bundled fonts are built, never when a banner is drawn.
const zlib = require("node:zlib");

function readTable(buffer) {
  const count = buffer.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = buffer.toString("latin1", at, at + 4);
    const offset = buffer.readUInt32BE(at + 8);
    const length = buffer.readUInt32BE(at + 12);
    tables[tag] = buffer.subarray(offset, offset + length);
  }
  return tables;
}

function parseCmap(table) {
  const map = new Map();
  const count = table.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < count; i++) {
    const platform = table.readUInt16BE(4 + i * 8);
    const encoding = table.readUInt16BE(6 + i * 8);
    const offset = table.readUInt32BE(8 + i * 8);
    const format = table.readUInt16BE(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode && (format === 4 || format === 12) && (!best || format > best.format)) best = { offset, format };
  }
  if (!best) throw new Error("no usable Unicode cmap");
  const at = best.offset;
  if (best.format === 12) {
    const groups = table.readUInt32BE(at + 12);
    for (let g = 0; g < groups; g++) {
      const base = at + 16 + g * 12;
      const start = table.readUInt32BE(base);
      const end = table.readUInt32BE(base + 4);
      const glyph = table.readUInt32BE(base + 8);
      for (let c = start; c <= end; c++) map.set(c, glyph + (c - start));
    }
  } else {
    const segments = table.readUInt16BE(at + 6) / 2;
    const endAt = at + 14;
    const startAt = endAt + segments * 2 + 2;
    const deltaAt = startAt + segments * 2;
    const rangeAt = deltaAt + segments * 2;
    for (let s = 0; s < segments; s++) {
      const end = table.readUInt16BE(endAt + s * 2);
      const start = table.readUInt16BE(startAt + s * 2);
      const delta = table.readInt16BE(deltaAt + s * 2);
      const range = table.readUInt16BE(rangeAt + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph;
        if (range === 0) glyph = (c + delta) & 0xffff;
        else {
          const p = rangeAt + s * 2 + range + (c - start) * 2;
          glyph = table.readUInt16BE(p);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) map.set(c, glyph);
      }
    }
  }
  return map;
}

function open(buffer) {
  const tables = readTable(buffer);
  const head = tables.head;
  const hhea = tables.hhea;
  const unitsPerEm = head.readUInt16BE(18);
  const longLoca = head.readInt16BE(50) === 1;
  const numGlyphs = tables.maxp.readUInt16BE(4);
  const numberOfHMetrics = hhea.readUInt16BE(34);
  const loca = i => (longLoca ? tables.loca.readUInt32BE(i * 4) : tables.loca.readUInt16BE(i * 2) * 2);
  const advance = gid => tables.hmtx.readUInt16BE(Math.min(gid, numberOfHMetrics - 1) * 4);

  function glyphBytes(gid) {
    return tables.glyf.subarray(loca(gid), loca(gid + 1));
  }

  // Contours as arrays of { x, y, on } in font units (y up). Composite glyphs are flattened.
  function contours(gid, depth = 0) {
    const data = glyphBytes(gid);
    if (data.length === 0) return [];
    const count = data.readInt16BE(0);
    if (count >= 0) return simple(data, count);
    if (depth > 6) return [];
    const result = [];
    let at = 10;
    let more = true;
    while (more) {
      const flags = data.readUInt16BE(at);
      const component = data.readUInt16BE(at + 2);
      at += 4;
      let dx;
      let dy;
      if (flags & 1) { dx = data.readInt16BE(at); dy = data.readInt16BE(at + 2); at += 4; } else { dx = data.readInt8(at); dy = data.readInt8(at + 1); at += 2; }
      if (!(flags & 2)) { dx = 0; dy = 0; }
      let a = 1; let b = 0; let c = 0; let d = 1;
      const f2 = () => { const v = data.readInt16BE(at) / 16384; at += 2; return v; };
      if (flags & 8) { a = d = f2(); } else if (flags & 0x40) { a = f2(); d = f2(); } else if (flags & 0x80) { a = f2(); b = f2(); c = f2(); d = f2(); }
      for (const contour of contours(component, depth + 1)) {
        result.push(contour.map(p => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })));
      }
      more = (flags & 0x20) !== 0;
    }
    return result;
  }

  function simple(data, count) {
    if (count === 0) return [];
    const ends = [];
    for (let i = 0; i < count; i++) ends.push(data.readUInt16BE(10 + i * 2));
    const total = ends[count - 1] + 1;
    let at = 10 + count * 2;
    at += 2 + data.readUInt16BE(at);
    const flags = [];
    while (flags.length < total) {
      const flag = data[at++];
      flags.push(flag);
      if (flag & 8) { let repeat = data[at++]; while (repeat-- > 0) flags.push(flag); }
    }
    const coordinates = (shortBit, sameBit) => {
      const values = [];
      let value = 0;
      for (let i = 0; i < total; i++) {
        const flag = flags[i];
        if (flag & shortBit) { const delta = data[at++]; value += flag & sameBit ? delta : -delta; } else if (!(flag & sameBit)) { value += data.readInt16BE(at); at += 2; }
        values.push(value);
      }
      return values;
    };
    const xs = coordinates(2, 16);
    const ys = coordinates(4, 32);
    const out = [];
    let first = 0;
    for (const end of ends) {
      const contour = [];
      for (let i = first; i <= end; i++) contour.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
      out.push(contour);
      first = end + 1;
    }
    return out;
  }

  // Dependencies of a glyph (composite components), to keep them when subsetting.
  function components(gid) {
    const data = glyphBytes(gid);
    if (data.length === 0 || data.readInt16BE(0) >= 0) return [];
    const result = [];
    let at = 10;
    let more = true;
    while (more) {
      const flags = data.readUInt16BE(at);
      result.push(data.readUInt16BE(at + 2));
      at += 4 + (flags & 1 ? 4 : 2);
      if (flags & 8) at += 2; else if (flags & 0x40) at += 4; else if (flags & 0x80) at += 8;
      more = (flags & 0x20) !== 0;
    }
    return result;
  }

  return { tables, unitsPerEm, numGlyphs, cmap: parseCmap(tables.cmap), advance, contours, components, glyphBytes, numberOfHMetrics, longLoca, loca };
}

// Contours to an SVG path. Coordinates are scaled to 1000 units per em, y pointing down from the baseline.
function toPath(contours, unitsPerEm) {
  const k = 1000 / unitsPerEm;
  const n = value => String(Math.round(value * k));
  const point = p => [p.x, -p.y];
  const segments = [];
  for (const contour of contours) {
    if (contour.length < 2) continue;
    const pts = contour.slice();
    // Start on an on-curve point; if there is none, start at the midpoint of the first two.
    let startIndex = pts.findIndex(p => p.on);
    let start;
    let ordered;
    if (startIndex === -1) {
      start = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true };
      ordered = pts.slice(1).concat([pts[0]]);
    } else {
      start = pts[startIndex];
      ordered = pts.slice(startIndex + 1).concat(pts.slice(0, startIndex));
    }
    let d = `M${n(point(start)[0])} ${n(point(start)[1])}`;
    let control = null;
    let current = start;
    const lineTo = p => { d += `L${n(point(p)[0])} ${n(point(p)[1])}`; current = p; };
    const quad = (c, p) => { d += `Q${n(point(c)[0])} ${n(point(c)[1])} ${n(point(p)[0])} ${n(point(p)[1])}`; current = p; };
    for (const p of ordered) {
      if (p.on) {
        if (control) { quad(control, p); control = null; } else lineTo(p);
      } else if (control) {
        quad(control, { x: (control.x + p.x) / 2, y: (control.y + p.y) / 2, on: true });
        control = p;
      } else control = p;
    }
    if (control) quad(control, start); else if (current !== start) lineTo(start);
    segments.push(d + "Z");
  }
  return segments.join("");
}

const align4 = n => (n + 3) & ~3;

function checksum(buffer) {
  let sum = 0;
  const padded = Buffer.concat([buffer, Buffer.alloc(align4(buffer.length) - buffer.length)]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

// A subset that keeps glyph numbers (so composite glyphs stay valid) but empties every glyph that is not needed.
function subsetTables(font, codePoints) {
  const keep = new Set([0]);
  const stack = [];
  for (const code of codePoints) {
    const gid = font.cmap.get(code);
    if (gid) { keep.add(gid); stack.push(gid); }
  }
  while (stack.length) for (const part of font.components(stack.pop())) if (!keep.has(part)) { keep.add(part); stack.push(part); }

  const glyphs = [];
  const offsets = [0];
  let size = 0;
  for (let gid = 0; gid < font.numGlyphs; gid++) {
    const bytes = keep.has(gid) ? font.glyphBytes(gid) : Buffer.alloc(0);
    const padded = Buffer.concat([bytes, Buffer.alloc(align4(bytes.length) - bytes.length)]);
    glyphs.push(padded);
    size += padded.length;
    offsets.push(size);
  }
  const glyf = Buffer.concat(glyphs);
  const loca = Buffer.alloc(offsets.length * 4);
  offsets.forEach((value, i) => loca.writeUInt32BE(value, i * 4));

  const head = Buffer.from(font.tables.head);
  head.writeInt16BE(1, 50);
  head.writeUInt32BE(0, 8);

  const hmtx = Buffer.from(font.tables.hmtx);
  for (let gid = 0; gid < font.numberOfHMetrics; gid++) if (!keep.has(gid)) { hmtx.writeUInt16BE(0, gid * 4); hmtx.writeInt16BE(0, gid * 4 + 2); }

  // cmap format 4 limited to the characters kept (basic multilingual plane).
  const entries = [...codePoints].filter(code => font.cmap.has(code) && code < 0xffff).sort((a, b) => a - b);
  const segments = [];
  for (const code of entries) {
    const last = segments[segments.length - 1];
    if (last && code === last.end + 1) last.end = code; else segments.push({ start: code, end: code });
  }
  segments.push({ start: 0xffff, end: 0xffff });
  const segCount = segments.length;
  const glyphIds = [];
  const cmapBody = Buffer.alloc(16 + segCount * 8 + 0);
  let rangeOffsetBytes = 0;
  const idRangeOffsets = [];
  const idDeltas = [];
  for (const [index, segment] of segments.entries()) {
    if (segment.start === 0xffff) { idDeltas.push(1); idRangeOffsets.push(0); continue; }
    idDeltas.push(0);
    idRangeOffsets.push((segCount - index) * 2 + rangeOffsetBytes);
    for (let code = segment.start; code <= segment.end; code++) glyphIds.push(font.cmap.get(code));
    rangeOffsetBytes += (segment.end - segment.start + 1) * 2;
  }
  const subtableLength = 16 + segCount * 8 + glyphIds.length * 2;
  const sub = Buffer.alloc(subtableLength);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(subtableLength, 2);
  sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(segCount * 2, 6);
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  sub.writeUInt16BE(searchRange, 8);
  sub.writeUInt16BE(Math.floor(Math.log2(segCount)), 10);
  sub.writeUInt16BE(segCount * 2 - searchRange, 12);
  segments.forEach((segment, i) => {
    sub.writeUInt16BE(segment.end, 14 + i * 2);
    sub.writeUInt16BE(segment.start, 16 + segCount * 2 + i * 2);
    sub.writeInt16BE(idDeltas[i], 16 + segCount * 4 + i * 2);
    sub.writeUInt16BE(idRangeOffsets[i], 16 + segCount * 6 + i * 2);
  });
  glyphIds.forEach((gid, i) => sub.writeUInt16BE(gid, 16 + segCount * 8 + i * 2));
  void cmapBody;
  const cmap = Buffer.alloc(12 + sub.length);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(1, 6);
  cmap.writeUInt32BE(12, 8);
  sub.copy(cmap, 12);

  // A minimal post table (format 3: no glyph names).
  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  const out = { cmap, glyf, head, hhea: font.tables.hhea, hmtx, loca, maxp: font.tables.maxp, name: font.tables.name, "OS/2": font.tables["OS/2"], post };
  return out;
}

// WOFF 1: every table deflated on its own. Supported wherever a font can be embedded in an SVG.
function toWoff(tables, flavor) {
  const tags = Object.keys(tables).sort();
  const entries = tags.map(tag => {
    const data = tables[tag];
    const compressed = zlib.deflateSync(data, { level: 9 });
    const stored = compressed.length < data.length ? compressed : data;
    return { tag, data, stored, original: data.length, check: checksum(data) };
  });
  const headerSize = 44 + entries.length * 20;
  let offset = headerSize;
  const directory = Buffer.alloc(entries.length * 20);
  const parts = [];
  entries.forEach((entry, i) => {
    directory.write(entry.tag, i * 20, "latin1");
    directory.writeUInt32BE(offset, i * 20 + 4);
    directory.writeUInt32BE(entry.stored.length, i * 20 + 8);
    directory.writeUInt32BE(entry.original, i * 20 + 12);
    directory.writeUInt32BE(entry.check, i * 20 + 16);
    const padded = align4(entry.stored.length);
    parts.push(Buffer.concat([entry.stored, Buffer.alloc(padded - entry.stored.length)]));
    offset += padded;
  });
  const sfntSize = 12 + entries.length * 16 + entries.reduce((sum, e) => sum + align4(e.original), 0);
  const header = Buffer.alloc(44);
  header.write("wOFF", 0, "latin1");
  header.writeUInt32BE(flavor, 4);
  header.writeUInt32BE(offset, 8);
  header.writeUInt16BE(entries.length, 12);
  header.writeUInt32BE(sfntSize, 16);
  return Buffer.concat([header, directory, ...parts]);
}

module.exports = { open, toPath, subsetTables, toWoff };
