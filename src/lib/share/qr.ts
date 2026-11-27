// Lightweight spec-compliant QR Code Byte-mode SVG generator (EC Level L, Versions 1–8, max ~192 UTF-8 bytes)

const VERSION_DATA_BYTES = [0, 19, 34, 55, 80, 108, 136, 156, 194] as const;
const VERSION_EC_BYTES = [0, 7, 10, 15, 20, 26, 36, 40, 48] as const;
const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255] ?? 0;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[((GF_LOG[a] ?? 0) + (GF_LOG[b] ?? 0)) % 255] ?? 0;
}

function computeEcBytes(data: Uint8Array, ecCount: number): Uint8Array {
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    const factor = GF_EXP[i] ?? 1;
    for (let j = 0; j < gen.length; j++) {
      next[j] = (next[j] ?? 0) ^ (gen[j] ?? 0);
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(gen[j] ?? 0, factor);
    }
    gen = next;
  }

  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const lead = msg[i] ?? 0;
    if (lead === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      msg[i + j] = (msg[i + j] ?? 0) ^ gfMul(gen[j] ?? 0, lead);
    }
  }
  return msg.slice(data.length);
}

function encodeCodewords(payloadBytes: Uint8Array): { version: number; bits: number[] } {
  let version = 1;
  while (version <= 8 && (VERSION_DATA_BYTES[version] ?? 0) < payloadBytes.length + 2) {
    version++;
  }
  if (version > 8) version = 8;

  const cap = VERSION_DATA_BYTES[version] ?? 194;
  const clamped = payloadBytes.slice(0, cap - 2);
  const bitBuf: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(clamped.length, 8);
  for (const b of clamped) pushBits(b, 8);
  pushBits(0, Math.min(4, cap * 8 - bitBuf.length));
  while (bitBuf.length % 8 !== 0) bitBuf.push(0);

  let padIdx = 0;
  while (bitBuf.length < cap * 8) {
    pushBits(padIdx % 2 === 0 ? 0xec : 0x11, 8);
    padIdx++;
  }

  const dataBytes = new Uint8Array(cap);
  for (let i = 0; i < cap; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | (bitBuf[i * 8 + b] ?? 0);
    }
    dataBytes[i] = val;
  }

  // Split into 1 or 2 blocks (V1–5 have 1 block; V6–8 split into 2 blocks at EC Level L)
  const ecPerBlock = version === 6 ? 18 : version === 7 ? 20 : version === 8 ? 24 : (VERSION_EC_BYTES[version] ?? 7);
  const blocks: Uint8Array[] = [];
  const ecs: Uint8Array[] = [];

  if (version <= 5) {
    blocks.push(dataBytes);
    ecs.push(computeEcBytes(dataBytes, ecPerBlock));
  } else {
    const half = Math.floor(dataBytes.length / 2);
    const b1 = dataBytes.slice(0, half);
    const b2 = dataBytes.slice(half);
    blocks.push(b1, b2);
    ecs.push(computeEcBytes(b1, ecPerBlock), computeEcBytes(b2, ecPerBlock));
  }

  const outBits: number[] = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of blocks) {
      if (i < blk.length) {
        const byte = blk[i] ?? 0;
        for (let b = 7; b >= 0; b--) outBits.push((byte >> b) & 1);
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecs) {
      const byte = ec[i] ?? 0;
      for (let b = 7; b >= 0; b--) outBits.push((byte >> b) & 1);
    }
  }
  return { version, bits: outBits };
}

/**
 * Generates an inline scannable SVG QR code string without any third-party runtime packages.
 */
export function encodeQrSvg(text: string, darkColor = "#0a0a0b", lightColor = "#f0efe9"): string {
  const bytes = new TextEncoder().encode(text);
  const { version, bits } = encodeCodewords(bytes);
  const size = version * 4 + 17;
  const modules: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFixed = (r: number, c: number, val: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r]![c] = val;
      reserved[r]![c] = true;
    }
  };

  const placeFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on =
          r >= 0 &&
          r <= 6 &&
          c >= 0 &&
          c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFixed(rr, cc, on ? 1 : 0);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    setFixed(6, i, bit);
    setFixed(i, 6, bit);
  }

  // Alignment patterns
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (const cr of centers) {
    for (const cc of centers) {
      if (reserved[cr]?.[cc]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFixed(cr + dr, cc + dc, on ? 1 : 0);
        }
      }
    }
  }

  // Format information placeholders (EC Level L = 01, Mask 0 = 000 -> BCH encoded = 111011111000100)
  const FORMAT_MASK0_L = 0b111011111000100;
  setFixed(4 * version + 9, 8, 1);
  for (let i = 0; i <= 14; i++) {
    const bit = (FORMAT_MASK0_L >> (14 - i)) & 1;
    if (i < 6) setFixed(8, i, bit);
    else if (i < 8) setFixed(8, i + 1, bit);
    else setFixed(8, size - 15 + i, bit);

    if (i < 8) setFixed(size - 1 - i, 8, bit);
    else if (i === 8) setFixed(7, 8, bit);
    else setFixed(14 - i, 8, bit);
  }

  // Zigzag bit placement with mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const r = up ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (c < 0 || reserved[r]?.[c]) continue;
        const raw = bits[bitIdx++] ?? 0;
        const masked = (r + c) % 2 === 0 ? raw ^ 1 : raw;
        modules[r]![c] = masked;
      }
    }
    up = !up;
  }

  let pathD = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r]?.[c] === 1) {
        pathD += `M${c + 2},${r + 2}h1v1h-1z`;
      }
    }
  }
  const viewSize = size + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="${lightColor}" rx="2"/><path d="${pathD}" fill="${darkColor}"/></svg>`;
}
