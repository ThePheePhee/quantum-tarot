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

const imageBaseUrl = "https://www.sacred-texts.com/tarot/pkt/img";

const majorArcana = [
  ["ar00", "The Fool"],
  ["ar01", "The Magician"],
  ["ar02", "The High Priestess"],
  ["ar03", "The Empress"],
  ["ar04", "The Emperor"],
  ["ar05", "The Hierophant"],
  ["ar06", "The Lovers"],
  ["ar07", "The Chariot"],
  ["ar08", "Strength"],
  ["ar09", "The Hermit"],
  ["ar10", "Wheel of Fortune"],
  ["ar11", "Justice"],
  ["ar12", "The Hanged Man"],
  ["ar13", "Death"],
  ["ar14", "Temperance"],
  ["ar15", "The Devil"],
  ["ar16", "The Tower"],
  ["ar17", "The Star"],
  ["ar18", "The Moon"],
  ["ar19", "The Sun"],
  ["ar20", "Judgement"],
  ["ar21", "The World"]
] as const;

const suits = ["wands", "swords", "cups", "disks"] as const;
const suitImagePrefixes: Record<TarotSuit, string> = {
  wands: "wa",
  swords: "sw",
  cups: "cu",
  disks: "pe"
};
const ranks = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"] as const;
const rankImageSuffixes = ["ac", "02", "03", "04", "05", "06", "07", "08", "09", "10", "pa", "kn", "qu", "ki"] as const;

export const tarotDeck: readonly TarotCard[] = [
  ...majorArcana.map(([imageName, name], index) => ({
    number: index + 1,
    id: imageName,
    name,
    arcana: "major" as const,
    imageUrl: `${imageBaseUrl}/${imageName}.jpg`
  })),
  ...suits.flatMap((suit, suitIndex) =>
    ranks.map((rank, rankIndex) => ({
      number: 23 + suitIndex * ranks.length + rankIndex,
      id: `${suit}-${rank.toLowerCase()}`,
      name: `${rank} of ${titleCase(suit)}`,
      arcana: "minor" as const,
      suit,
      rank,
      imageUrl: `${imageBaseUrl}/${suitImagePrefixes[suit]}${rankImageSuffixes[rankIndex]}.jpg`
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
