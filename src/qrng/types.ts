export type RandomByte = number;

export interface QrngProvider {
  readonly name: string;
  getBytes(length: number): Promise<Uint8Array>;
}

export class QrngError extends Error {
  constructor(
    message: string,
    readonly providerName: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "QrngError";
  }
}
