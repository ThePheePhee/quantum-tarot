export interface SeededRng {
  nextFloat(): number;
}

export function createSeededRng(seedBytes: Uint8Array): SeededRng {
  if (seedBytes.length < 16) {
    throw new RangeError("Seeded RNG requires at least 16 bytes of seed material");
  }

  const state = seedState(seedBytes);
  let [a, b, c, d] = state;

  return {
    nextFloat() {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;

      const t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      const result = (t + d) | 0;
      c = (c + result) | 0;

      return (result >>> 0) / 4294967296;
    }
  };
}

function seedState(seedBytes: Uint8Array): [number, number, number, number] {
  const state: [number, number, number, number] = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344];

  for (let index = 0; index < seedBytes.length; index += 1) {
    const lane = index % state.length;
    state[lane] ^= seedBytes[index] << ((index % 4) * 8);
    state[lane] = Math.imul(state[lane] ^ (state[lane] >>> 16), 0x7feb352d) >>> 0;
    state[lane] ^= state[(lane + 1) % state.length] >>> 7;
  }

  if (state.every((value) => value === 0)) {
    state[0] = 1;
  }

  return state;
}

export function drawDistinctNumbers(rng: SeededRng, count: number, upperInclusive: number): number[] {
  if (count > upperInclusive) {
    throw new RangeError("count cannot exceed upperInclusive");
  }

  const values = Array.from({ length: upperInclusive }, (_, index) => index + 1);

  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + Math.floor(rng.nextFloat() * (values.length - index));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values.slice(0, count);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}
