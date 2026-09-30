/**
 * 小程序端 SHA-256 + HMAC-SHA256（纯 JS 实现）
 *
 * 背景：小程序运行环境不提供 Node 的 crypto 模块，而平台 API 采用
 * 「请求级 HMAC 签名」（X-Agent / X-Timestamp / X-Signature），
 * 因此必须在端侧实现与 Node crypto.createHmac("sha256", key) 逐字节一致的算法。
 * 本实现为标准 FIPS 180-4 SHA-256，已通过 Node crypto 交叉验证
 * （含中文 / emoji / 超块长密钥用例）。
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** 字符串 → UTF-8 字节数组（含中文与代理对 emoji） */
function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

/** SHA-256：输入字节数组，返回 32 字节数组（标准填充：0x80 + 0x00… + 64bit 大端长度） */
function sha256Bytes(bytes) {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  const padded = bytes.slice();
  const bitLen = bytes.length * 8;
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  // 64 位大端长度（JS 位运算为 32 位，用 hi/lo 拆分）
  const hi = Math.floor(bitLen / 4294967296);
  const lo = bitLen >>> 0;
  padded.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  padded.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  const w = new Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) {
      const b = off + j * 4;
      w[j] = ((padded[b] << 24) | (padded[b + 1] << 16) | (padded[b + 2] << 8) | padded[b + 3]) | 0;
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  const out = [];
  for (const v of H) out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  return out;
}

function bytesToHex(bytes) {
  let hex = "";
  for (const b of bytes) hex += (b < 16 ? "0" : "") + b.toString(16);
  return hex;
}

/** SHA-256 十六进制摘要 */
function sha256Hex(str) {
  return bytesToHex(sha256Bytes(utf8Bytes(str)));
}

/** HMAC-SHA256 十六进制摘要（与 Node crypto.createHmac('sha256', secret).update(msg).digest('hex') 一致） */
function hmacSha256Hex(secret, message) {
  const BLOCK = 64;
  let key = utf8Bytes(secret);
  if (key.length > BLOCK) key = sha256Bytes(key);
  while (key.length < BLOCK) key.push(0);

  const oKeyPad = key.map((b) => b ^ 0x5c);
  const iKeyPad = key.map((b) => b ^ 0x36);

  const inner = sha256Bytes(iKeyPad.concat(utf8Bytes(message)));
  return bytesToHex(sha256Bytes(oKeyPad.concat(inner)));
}

module.exports = { sha256Hex, hmacSha256Hex, utf8Bytes };
