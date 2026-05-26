import type { TarotCard } from "../tarot/deck.js";

const majorCardIds = [
  "major_00_fool",
  "major_01_magus",
  "major_02_priestess",
  "major_03_empress",
  "major_04_emperor",
  "major_05_hierophant",
  "major_06_lovers",
  "major_07_chariot",
  "major_08_adjustment",
  "major_09_hermit",
  "major_10_fortune",
  "major_11_lust",
  "major_12_hanged_man",
  "major_13_death",
  "major_14_art",
  "major_15_devil",
  "major_16_tower",
  "major_17_star",
  "major_18_moon",
  "major_19_sun",
  "major_20_aeon",
  "major_21_universe"
] as const;

const smallRankByName: Record<string, string> = {
  Ace: "01",
  Two: "02",
  Three: "03",
  Four: "04",
  Five: "05",
  Six: "06",
  Seven: "07",
  Eight: "08",
  Nine: "09",
  Ten: "10"
};

const courtRankByName: Record<string, string> = {
  Page: "princess",
  Knight: "prince",
  Queen: "queen",
  King: "knight"
};

export function ontologyCardIdForTarotCard(card: TarotCard): string | null {
  if (card.arcana === "major") {
    return majorCardIds[card.number - 1] ?? null;
  }

  if (!card.suit || !card.rank) {
    return null;
  }

  const smallRank = smallRankByName[card.rank];

  if (smallRank) {
    return `minor_${card.suit}_${smallRank}`;
  }

  const courtRank = courtRankByName[card.rank];

  return courtRank ? `court_${card.suit}_${courtRank}` : null;
}
