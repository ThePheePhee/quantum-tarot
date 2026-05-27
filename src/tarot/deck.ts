export type TarotSuit = "wands" | "swords" | "cups" | "disks";

export interface TarotCard {
  readonly number: number;
  readonly id: string;
  readonly name: string;
  readonly arcana: "major" | "minor";
  readonly suit?: TarotSuit;
  readonly rank?: string;
  readonly imageUrl: string;
}

const imageBaseUrl = "/cards/thoth";

const majorArcana = [
  ["major-00", "The Fool"],
  ["major-01", "The Magus"],
  ["major-02", "The Priestess"],
  ["major-03", "The Empress"],
  ["major-04", "The Emperor"],
  ["major-05", "The Hierophant"],
  ["major-06", "The Lovers"],
  ["major-07", "The Chariot"],
  ["major-08", "Adjustment"],
  ["major-09", "The Hermit"],
  ["major-10", "Fortune"],
  ["major-11", "Lust"],
  ["major-12", "The Hanged Man"],
  ["major-13", "Death"],
  ["major-14", "Art"],
  ["major-15", "The Devil"],
  ["major-16", "The Tower"],
  ["major-17", "The Star"],
  ["major-18", "The Moon"],
  ["major-19", "The Sun"],
  ["major-20", "The Aeon"],
  ["major-21", "The Universe"]
] as const;

const suits = ["wands", "swords", "cups", "disks"] as const;
const ranks = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Princess", "Prince", "Queen", "Knight"] as const;
const rankImageSuffixes = ["ace", "02", "03", "04", "05", "06", "07", "08", "09", "10", "princess", "prince", "queen", "knight"] as const;

export const tarotDeck: readonly TarotCard[] = [
  ...majorArcana.map(([imageName, name], index) => ({
    number: index + 1,
    id: imageName,
    name,
    arcana: "major" as const,
    imageUrl: `${imageBaseUrl}/${imageName}.webp`
  })),
  ...suits.flatMap((suit, suitIndex) =>
    ranks.map((rank, rankIndex) => ({
      number: 23 + suitIndex * ranks.length + rankIndex,
      id: `${suit}-${rank.toLowerCase()}`,
      name: `${rank} of ${titleCase(suit)}`,
      arcana: "minor" as const,
      suit,
      rank,
      imageUrl: `${imageBaseUrl}/${suit}-${rankImageSuffixes[rankIndex]}.webp`
    }))
  )
];

export function getCardByNumber(number: number): TarotCard {
  const card = tarotDeck[number - 1];

  if (!card) {
    throw new RangeError(`No tarot card exists for number ${number}`);
  }

  return card;
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
