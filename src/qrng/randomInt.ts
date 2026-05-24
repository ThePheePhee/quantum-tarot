import type { QrngProvider } from "./types.js";

export async function randomInt(provider: QrngProvider, upperExclusive: number): Promise<number> {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
    throw new RangeError("upperExclusive must be a positive safe integer");
  }

  const bytesNeeded = Math.max(1, Math.ceil(Math.log2(upperExclusive) / 8));
  const range = 256 ** bytesNeeded;
  const rejectionLimit = range - (range % upperExclusive);

  while (true) {
    const bytes = await provider.getBytes(bytesNeeded);
    let value = 0;

    for (const byte of bytes) {
      value = value * 256 + byte;
    }

    if (value < rejectionLimit) {
      return value % upperExclusive;
    }
  }
}
