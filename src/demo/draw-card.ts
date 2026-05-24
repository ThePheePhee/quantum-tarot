import { loadEnv } from "../config/loadEnv.js";
import { AnuQrngProvider } from "../qrng/anuProvider.js";
import { drawSingleCard } from "../tarot/draw.js";

loadEnv();

const provider = new AnuQrngProvider();
const draw = await drawSingleCard(provider);
const orientation = draw.reversed ? "reversed" : "upright";

console.log(`${draw.card.name} (${orientation})`);
console.log(`Randomness source: ${draw.provider}`);
