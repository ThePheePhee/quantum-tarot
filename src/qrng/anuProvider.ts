import { QrngError, type QrngProvider } from "./types.js";

export interface AnuQrngProviderOptions {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface AnuQrngResponse {
  success: boolean;
  type: "uint8";
  length: number;
  data: number[];
}

const DEFAULT_ENDPOINT = "https://api.quantumnumbers.anu.edu.au/";
const MAX_UINT8_VALUES_PER_REQUEST = 1024;

export class AnuQrngProvider implements QrngProvider {
  readonly name = "ANU Quantum Numbers";

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnuQrngProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANU_QRNG_API_KEY ?? "";
    this.endpoint = options.endpoint ?? process.env.ANU_QRNG_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getBytes(length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(length) || length < 1) {
      throw new RangeError("length must be a positive safe integer");
    }

    const chunks: Uint8Array[] = [];
    let remaining = length;

    while (remaining > 0) {
      const requestLength = Math.min(remaining, MAX_UINT8_VALUES_PER_REQUEST);
      chunks.push(await this.fetchByteChunk(requestLength));
      remaining -= requestLength;
    }

    const output = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }

    return output;
  }

  private async fetchByteChunk(length: number): Promise<Uint8Array> {
    if (!this.apiKey) {
      throw new QrngError(
        "Missing ANU_QRNG_API_KEY. Create an ANU Quantum Numbers API key and add it to your environment.",
        this.name
      );
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("length", String(length));
    url.searchParams.set("type", "uint8");

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          "x-api-key": this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as AnuQrngResponse;

      if (!payload.success || payload.type !== "uint8" || Number(payload.length) !== length) {
        throw new Error("ANU QRNG returned an unexpected response shape");
      }

      return Uint8Array.from(payload.data);
    } catch (error) {
      throw new QrngError("Unable to fetch quantum random bytes", this.name, error);
    }
  }
}
