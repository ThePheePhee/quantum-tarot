export interface TarotCard {
  readonly id: string;
  readonly name: string;
  readonly arcana: "major" | "minor";
  readonly suit?: "cups" | "pentacles" | "swords" | "wands";
}

const majorArcana = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World"
] as const;

const suits = ["cups", "pentacles", "swords", "wands"] as const;
const ranks = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"] as const;

export const tarotDeck: readonly TarotCard[] = [
  ...majorArcana.map((name, index) => ({
    id: `major-${index}`,
    name,
    arcana: "major" as const
  })),
  ...suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${suit}-${rank.toLowerCase()}`,
      name: `${rank} of ${titleCase(suit)}`,
      arcana: "minor" as const,
      suit
    }))
  )
];

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
