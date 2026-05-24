import { randomInt } from "../qrng/randomInt.js";
import type { QrngProvider } from "../qrng/types.js";
import { tarotDeck, type TarotCard } from "./deck.js";

export interface TarotDraw {
  readonly card: TarotCard;
  readonly reversed: boolean;
  readonly provider: string;
}

export async function drawSingleCard(provider: QrngProvider): Promise<TarotDraw> {
  const cardIndex = await randomInt(provider, tarotDeck.length);
  const orientation = await randomInt(provider, 2);

  return {
    card: tarotDeck[cardIndex],
    reversed: orientation === 1,
    provider: provider.name
  };
}
