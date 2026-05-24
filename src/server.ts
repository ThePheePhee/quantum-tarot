import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./config/loadEnv.js";
import { AnuQrngProvider } from "./qrng/anuProvider.js";
import { QrngError } from "./qrng/types.js";
import { createSeededRng, drawDistinctNumbers, type SeededRng } from "./rng/seededRng.js";
import { getCardByNumber } from "./tarot/deck.js";

loadEnv();

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const reseedCooldownMs = 1100;
const seedLengthBytes = 16;

let rng: SeededRng | null = null;
let seedVersion = 0;
let lastReseededAt = 0;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/status") {
      return sendJson(response, {
        seeded: rng !== null,
        qrngConfigured: Boolean(process.env.ANU_QRNG_API_KEY),
        seedVersion,
        lastReseededAt: lastReseededAt || null,
        minSecondsBetweenReseeds: reseedCooldownMs / 1000
      });
    }

    if (request.method === "POST" && url.pathname === "/api/reseed") {
      return handleReseed(response);
    }

    if (request.method === "POST" && url.pathname === "/api/draw") {
      return handleDraw(response);
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    return sendJson(response, { error: "Not found" }, 404);
  } catch (error) {
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

    return sendJson(response, {
      seeded: true,
      seedVersion,
      lastReseededAt,
      entropyBytesUsed: seedLengthBytes,
      source: provider.name
    });
  } catch (error) {
    if (error instanceof QrngError) {
      return sendJson(response, { error: error.message, provider: error.providerName }, 503);
    }

    throw error;
  }
}

function handleDraw(response: ServerResponse): void {
  if (!rng) {
    return sendJson(response, { error: "Reseed quantum randomness before drawing." }, 409);
  }

  const numbers = drawDistinctNumbers(rng, 3, 78);
  const cards = numbers.map((number, index) => ({
    position: ["Past", "Present", "Future"][index],
    ...getCardByNumber(number)
  }));

  return sendJson(response, { seedVersion, cards });
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
