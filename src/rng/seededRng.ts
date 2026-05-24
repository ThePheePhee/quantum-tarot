export interface SeededRng {
  nextFloat(): number;
}

export function createSeededRng(seedBytes: Uint8Array): SeededRng {
  if (seedBytes.length < 16) {
    throw new RangeError("Seeded RNG requires at least 16 bytes of seed material");
  }

  let a = readUint32(seedBytes, 0);
  let b = readUint32(seedBytes, 4);
  let c = readUint32(seedBytes, 8);
  let d = readUint32(seedBytes, 12);

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
