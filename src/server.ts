import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./config/loadEnv.js";
import { getDrawCorrespondences, OntologyDatabaseError } from "./ontology/baserow.js";
import { AnuQrngProvider } from "./qrng/anuProvider.js";
import { QrngError } from "./qrng/types.js";
import { createSeededRng, drawDistinctNumbers, type SeededRng } from "./rng/seededRng.js";
import { getCardByNumber, type TarotCard } from "./tarot/deck.js";

loadEnv();

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const reseedCooldownMs = 1100;
const seedLengthBytes = 16;

interface SeedReceipt {
  readonly mode: "quantum" | "local" | "combined";
  readonly source: string;
  readonly seedVersion: number;
  readonly receivedAt: number;
  readonly entropyBytesUsed: number;
  readonly seedHex: string;
  readonly seedBytes: readonly number[];
  readonly localTimingSum?: number;
  readonly localTimingMs?: readonly number[];
  readonly localLetterCount?: number;
  readonly quantumSeedHex?: string;
  readonly quantumSeedBytes?: readonly number[];
}

interface LocalSeedRequest {
  readonly timingMs?: unknown;
  readonly timingSum?: unknown;
  readonly letterCount?: unknown;
}

interface DrawRequest {
  readonly count?: unknown;
}

let rng: SeededRng | null = null;
let seedVersion = 0;
let lastReseededAt = 0;
let latestReceipt: SeedReceipt | null = null;
let latestDraw: Array<TarotCard & { position: string }> = [];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/status") {
      return sendJson(response, {
        seeded: rng !== null,
        qrngConfigured: Boolean(process.env.ANU_QRNG_API_KEY),
        seedVersion,
        lastReseededAt: lastReseededAt || null,
        minSecondsBetweenReseeds: reseedCooldownMs / 1000,
        latestReceipt
      });
    }

    if (request.method === "POST" && url.pathname === "/api/reseed") {
      return sendJson(response, { error: "QRNG is disabled for now. Use local entropy." }, 410);
    }

    if (request.method === "POST" && url.pathname === "/api/reseed-local") {
      return handleLocalReseed(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/reseed-combined") {
      return sendJson(response, { error: "Combined QRNG seeding is disabled for now. Use local entropy." }, 410);
    }

    if (request.method === "POST" && url.pathname === "/api/draw") {
      return handleDraw(request, response);
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      return handleDashboard(response);
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    return sendJson(response, { error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(response, { error: error.message }, error.status);
    }

    console.error(error);
    return sendJson(response, { error: "Unexpected server error" }, 500);
  }
});

server.listen(port, () => {
  console.log(`Quantum Tarot listening at http://localhost:${port}`);
});

async function handleReseed(response: ServerResponse): Promise<void> {
  const now = Date.now();

  if (now - lastReseededAt < reseedCooldownMs) {
    return sendJson(response, {
      error: "Please wait before reseeding again.",
      retryAfterMs: reseedCooldownMs - (now - lastReseededAt)
    }, 429);
  }

  try {
    const provider = new AnuQrngProvider();
    const seedBytes = await provider.getBytes(seedLengthBytes);
    rng = createSeededRng(seedBytes);
    seedVersion += 1;
    lastReseededAt = now;
    latestReceipt = {
      mode: "quantum",
      source: provider.name,
      seedVersion,
      receivedAt: lastReseededAt,
      entropyBytesUsed: seedLengthBytes,
      seedHex: bytesToHex(seedBytes),
      seedBytes: Array.from(seedBytes)
    };

    return sendJson(response, {
      seeded: true,
      ...latestReceipt,
      lastReseededAt
    });
  } catch (error) {
    if (error instanceof QrngError) {
      return sendJson(response, { error: error.message, provider: error.providerName }, 503);
    }

    throw error;
  }
}

async function handleLocalReseed(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const localSeed = await readLocalSeedRequest(request);
  const seedBytes = localSeedBytes(localSeed.timingSum);

  rng = createSeededRng(seedBytes);
  seedVersion += 1;
  lastReseededAt = Date.now();
  latestReceipt = {
    mode: "local",
    source: "Local keystroke timing",
    seedVersion,
    receivedAt: lastReseededAt,
    entropyBytesUsed: seedLengthBytes,
    seedHex: bytesToHex(seedBytes),
    seedBytes: Array.from(seedBytes),
    localTimingSum: localSeed.timingSum,
    localTimingMs: localSeed.timingMs,
    localLetterCount: localSeed.letterCount
  };

  return sendJson(response, {
    seeded: true,
    ...latestReceipt,
    lastReseededAt
  });
}

async function handleCombinedReseed(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const now = Date.now();

  if (now - lastReseededAt < reseedCooldownMs) {
    return sendJson(response, {
      error: "Please wait before reseeding again.",
      retryAfterMs: reseedCooldownMs - (now - lastReseededAt)
    }, 429);
  }

  const localSeed = await readLocalSeedRequest(request);
  const localBytes = localSeedBytes(localSeed.timingSum);

  try {
    const provider = new AnuQrngProvider();
    const quantumBytes = await provider.getBytes(seedLengthBytes);
    const seedBytes = quantumBytes.map((byte, index) => byte ^ localBytes[index]);

    rng = createSeededRng(seedBytes);
    seedVersion += 1;
    lastReseededAt = now;
    latestReceipt = {
      mode: "combined",
      source: `${provider.name} + local keystroke timing`,
      seedVersion,
      receivedAt: lastReseededAt,
      entropyBytesUsed: seedLengthBytes,
      seedHex: bytesToHex(seedBytes),
      seedBytes: Array.from(seedBytes),
      localTimingSum: localSeed.timingSum,
      localTimingMs: localSeed.timingMs,
      localLetterCount: localSeed.letterCount,
      quantumSeedHex: bytesToHex(quantumBytes),
      quantumSeedBytes: Array.from(quantumBytes)
    };

    return sendJson(response, {
      seeded: true,
      ...latestReceipt,
      lastReseededAt
    });
  } catch (error) {
    if (error instanceof QrngError) {
      return sendJson(response, { error: error.message, provider: error.providerName }, 503);
    }

    throw error;
  }
}

async function handleDraw(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!rng) {
    return sendJson(response, { error: "Seed local entropy before drawing." }, 409);
  }

  const drawRequest = (await readOptionalJsonBody(request)) as DrawRequest;
  const count = normalizeDrawCount(drawRequest.count);
  const numbers = drawDistinctNumbers(rng, count, 78);
  const cards = numbers.map((number, index) => ({
    position: positionLabel(index, count),
    ...getCardByNumber(number)
  }));
  latestDraw = cards;

  return sendJson(response, { seedVersion, cards });
}

async function handleDashboard(response: ServerResponse): Promise<void> {
  if (latestDraw.length === 0) {
    return sendJson(response, {
      connected: Boolean(process.env.BASEROW_TOKEN && process.env.BASEROW_DATABASE_ID),
      draw: [],
      correspondences: []
    });
  }

  try {
    const correspondences = await getDrawCorrespondences(latestDraw);

    return sendJson(response, {
      connected: true,
      draw: latestDraw,
      correspondences
    });
  } catch (error) {
    if (error instanceof OntologyDatabaseError) {
      return sendJson(response, {
        connected: false,
        draw: latestDraw,
        correspondences: [],
        error: error.message
      }, error.status && error.status >= 400 && error.status < 600 ? error.status : 503);
    }

    throw error;
  }
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    return sendJson(response, { error: "Not found" }, 404);
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(content);
  } catch {
    sendJson(response, { error: "Not found" }, 404);
  }
}

function sendJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readLocalSeedRequest(request: IncomingMessage): Promise<{
  timingMs: number[];
  timingSum: number;
  letterCount: number;
}> {
  const payload = (await readJsonBody(request)) as LocalSeedRequest;

  if (!Array.isArray(payload.timingMs)) {
    throw new HttpError("Missing local timing data.", 400);
  }

  const timingMs = payload.timingMs.map((value) => Number(value));
  const letterCount = Number(payload.letterCount);
  const timingSum = Number(payload.timingSum);

  if (!Number.isSafeInteger(letterCount) || letterCount < 10) {
    throw new HttpError("Enter a phrase with at least 10 letters.", 400);
  }

  if (
    timingMs.length < 10 ||
    !timingMs.every((value) => Number.isSafeInteger(value) && value >= 0) ||
    !Number.isSafeInteger(timingSum)
  ) {
    throw new HttpError("Local timing data must be integer milliseconds.", 400);
  }

  const computedSum = timingMs.reduce((sum, value) => sum + value, 0);

  if (computedSum !== timingSum) {
    throw new HttpError("Local timing sum does not match the submitted timings.", 400);
  }

  return { timingMs, timingSum, letterCount };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

async function readOptionalJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0 || Buffer.concat(chunks).length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

function contentType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function localSeedBytes(timingSum: number): Uint8Array {
  const bytes = new Uint8Array(seedLengthBytes);
  let state = timingSum >>> 0;

  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }

  return bytes;
}

function normalizeDrawCount(value: unknown): number {
  const count = Number(value ?? 3);

  if (!Number.isSafeInteger(count) || count < 1 || count > 12) {
    throw new HttpError("Draw count must be an integer between 1 and 12.", 400);
  }

  return count;
}

function positionLabel(index: number, count: number): string {
  if (count === 3) {
    return ["Past", "Present", "Future"][index] ?? `Card ${index + 1}`;
  }

  return `Card ${index + 1}`;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}
