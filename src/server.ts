import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
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
const seedLengthBytes = 32;

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
  readonly decks?: unknown;
  readonly replacement?: unknown;
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
  const seedBytes = localSeedBytes(localSeed);

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
  const localBytes = localSeedBytes(localSeed);

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

  try {
    const drawRequest = (await readOptionalJsonBody(request)) as DrawRequest;
    const replacement = normalizeReplacement(drawRequest.replacement);
    const decks = normalizeDeckCount(drawRequest.decks);
    const count = normalizeDrawCount(drawRequest.count, replacement, decks);
    const numbers = drawNumbers(rng, count, replacement, decks);
    const cards = numbers.map((number, index) => ({
      position: positionLabel(index, count),
      ...getCardByNumber(number)
    }));
    latestDraw = cards;

    return sendJson(response, { seedVersion, cards });
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(response, { error: error.message }, error.status);
    }

    throw error;
  }
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

function localSeedBytes(localSeed: { timingMs: number[]; timingSum: number; letterCount: number }): Uint8Array {
  const payload = JSON.stringify({
    version: 1,
    source: "local-keystroke-timing",
    letterCount: localSeed.letterCount,
    timingSum: localSeed.timingSum,
    timingMs: localSeed.timingMs
  });

  return new Uint8Array(createHash("sha256").update(payload).digest());
}

function normalizeDrawCount(value: unknown, replacement: boolean, decks: number): number {
  const count = Number(value ?? 3);

  if (!Number.isSafeInteger(count) || count < 1) {
    throw new HttpError("Draw count must be a positive integer.", 400);
  }

  if (!replacement && count > decks * 78) {
    throw new HttpError(
      `With ${decks} deck${decks === 1 ? "" : "s"} without replacement, the maximum draw is ${decks * 78} cards.`,
      400
    );
  }

  return count;
}

function normalizeReplacement(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeDeckCount(value: unknown): number {
  const decks = Number(value ?? 1);

  if (!Number.isSafeInteger(decks) || decks < 1 || decks > 20) {
    throw new HttpError("Deck count must be an integer between 1 and 20.", 400);
  }

  return decks;
}

function drawNumbers(provider: SeededRng, count: number, replacement: boolean, decks: number): number[] {
  if (replacement) {
    return Array.from({ length: count }, () => Math.floor(provider.nextFloat() * 78) + 1);
  }

  const numbers: number[] = [];

  for (let cycle = 0; cycle < decks && numbers.length < count; cycle += 1) {
    const remaining = count - numbers.length;
    numbers.push(...drawDistinctNumbers(provider, Math.min(remaining, 78), 78));
  }

  return numbers;
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
