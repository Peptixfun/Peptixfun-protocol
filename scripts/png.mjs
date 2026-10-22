import zlib from "node:zlib";

/* ---------- png codec (8-bit, non-interlaced) ---------- */
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let p = 8, w, h, bd, ct, il; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  if (bd !== 8 || ct !== 6 || il !== 0) throw new Error("logo must be 8-bit RGBA non-interlaced, got bd=" + bd + " ct=" + ct + " il=" + il);
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, bd, ct, il, px };
}
export function encodePng(w, h, px) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1; /* Sub filter */
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = (px[y * stride + x] - (x >= 4 ? px[y * stride + x - 4] : 0)) & 255;
  }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, "latin1"); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
/* area-weighted resize of a premultiplied crop; colour is un-premultiplied on the way out */
export function resizePremul(img, sx, sy, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4), ry = sh / dh, rx = sw / dw;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const x0 = sx + x * rx, x1 = x0 + rx, y0 = sy + y * ry, y1 = y0 + ry;
    let R = 0, G = 0, B = 0, A = 0, W = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
      const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
        const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0)), i = (yy * img.w + xx) * 4, a = img.px[i + 3] / 255;
        R += img.px[i] * a * w; G += img.px[i + 1] * a * w; B += img.px[i + 2] * a * w; A += a * w; W += w;
      }
    }
    const o = (y * dw + x) * 4;
    if (A > 0) { out[o] = Math.round(R / A); out[o + 1] = Math.round(G / A); out[o + 2] = Math.round(B / A); }
    out[o + 3] = Math.round((A / W) * 255);
  }
  return out;
}

