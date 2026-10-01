// SPDX-License-Identifier: MPL-2.0

// Screenshot -> NeoMME patches (#54), as transformers' NeoMMEImageProcessor
// does it: antialiased bilinear resize so the longest side is at most
// max_side (never upscaled), zero padding at the bottom and right to whole
// 32-pixel patches, then x / 127.5 - 1, flattened patch by patch as
// (row, column, y, x, channel).

export const PATCH = 32;
export const PATCH_DIM = 3 * PATCH * PATCH;

export interface Patches {
  pixels: Float32Array;
  grid: [number, number];
}

// Python's round(): halves go to the even neighbour.
function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) {
    return floor + 1;
  }
  if (diff < 0.5) {
    return floor;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

// get_resize_output_size with only max_side set.
export function resizedSize(height: number, width: number, maxSide: number): [number, number] {
  const scale = Math.min(1, maxSide / Math.max(height, width));
  if (scale === 1) {
    return [height, width];
  }
  let h = Math.max(1, pyRound(height * scale));
  let w = Math.max(1, pyRound(width * scale));
  if (Math.max(h, w) > maxSide) {
    h = Math.max(1, Math.floor(height * scale));
    w = Math.max(1, Math.floor(width * scale));
  }
  return [h, w];
}

export function patchGrid(height: number, width: number, maxSide: number): [number, number] {
  const [h, w] = resizedSize(height, width, maxSide);
  return [Math.ceil(h / PATCH), Math.ceil(w / PATCH)];
}

// Antialiased bilinear weights (PIL / torchvision "aa"), per output pixel.
function weights(inSize: number, outSize: number): { start: number[]; values: Float64Array[] } {
  const scale = inSize / outSize;
  const support = scale >= 1 ? scale : 1;
  const invScale = scale >= 1 ? 1 / scale : 1;
  const start: number[] = [];
  const values: Float64Array[] = [];
  for (let i = 0; i < outSize; i++) {
    const center = scale * (i + 0.5);
    const min = Math.max(Math.trunc(center - support + 0.5), 0);
    const max = Math.min(Math.trunc(center + support + 0.5), inSize);
    const row = new Float64Array(max - min);
    let total = 0;
    for (let j = 0; j < row.length; j++) {
      const w = Math.max(0, 1 - Math.abs((j + min - center + 0.5) * invScale));
      row[j] = w;
      total += w;
    }
    if (total > 0) {
      for (let j = 0; j < row.length; j++) {
        row[j] /= total;
      }
    }
    start.push(min);
    values.push(row);
  }
  return { start, values };
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

// RGBA bytes (height x width) -> RGB bytes (outHeight x outWidth), with a
// byte-rounded intermediate like the uint8 kernels.
function resize(rgba: Uint8ClampedArray, height: number, width: number, outHeight: number, outWidth: number): Uint8Array {
  const horizontal = weights(width, outWidth);
  const mid = new Uint8Array(height * outWidth * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < outWidth; x++) {
      const w = horizontal.values[x];
      const start = horizontal.start[x];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < w.length; k++) {
        const i = (y * width + start + k) * 4;
        r += rgba[i] * w[k];
        g += rgba[i + 1] * w[k];
        b += rgba[i + 2] * w[k];
      }
      const o = (y * outWidth + x) * 3;
      mid[o] = clampByte(r);
      mid[o + 1] = clampByte(g);
      mid[o + 2] = clampByte(b);
    }
  }
  const vertical = weights(height, outHeight);
  const out = new Uint8Array(outHeight * outWidth * 3);
  for (let y = 0; y < outHeight; y++) {
    const w = vertical.values[y];
    const start = vertical.start[y];
    for (let x = 0; x < outWidth; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < w.length; k++) {
        const i = ((start + k) * outWidth + x) * 3;
        r += mid[i] * w[k];
        g += mid[i + 1] * w[k];
        b += mid[i + 2] * w[k];
      }
      const o = (y * outWidth + x) * 3;
      out[o] = clampByte(r);
      out[o + 1] = clampByte(g);
      out[o + 2] = clampByte(b);
    }
  }
  return out;
}

export function patches(rgba: Uint8ClampedArray, height: number, width: number, maxSide: number): Patches {
  const [h, w] = resizedSize(height, width, maxSide);
  let rgb: Uint8Array;
  if (h === height && w === width) {
    rgb = new Uint8Array(h * w * 3);
    for (let i = 0; i < h * w; i++) {
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
  } else {
    rgb = resize(rgba, height, width, h, w);
  }
  const gridH = Math.ceil(h / PATCH);
  const gridW = Math.ceil(w / PATCH);
  const pixels = new Float32Array(gridH * gridW * PATCH_DIM);
  let o = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      for (let py = 0; py < PATCH; py++) {
        const y = gy * PATCH + py;
        for (let px = 0; px < PATCH; px++) {
          const x = gx * PATCH + px;
          if (y < h && x < w) {
            const i = (y * w + x) * 3;
            pixels[o++] = rgb[i] / 127.5 - 1;
            pixels[o++] = rgb[i + 1] / 127.5 - 1;
            pixels[o++] = rgb[i + 2] / 127.5 - 1;
          } else {
            // Padding is black before normalizing.
            pixels[o++] = -1;
            pixels[o++] = -1;
            pixels[o++] = -1;
          }
        }
      }
    }
  }
  return { pixels, grid: [gridH, gridW] };
}
