import { ontologyCardIdForTarotCard } from "./cardMap.js";
import type {
  CardCorrespondence,
  Correspondence,
  CorrespondenceType,
  DrawCorrespondence,
  OntologyCard
} from "./types.js";
import type { TarotCard } from "../tarot/deck.js";

type BaserowRow = Record<string, unknown> & { id?: number };

interface BaserowTable {
  id: number;
  name: string;
}

interface BaserowListResponse {
  results: BaserowRow[];
  next: string | null;
}

export class OntologyDatabaseError extends Error {
  constructor(message: string, readonly status?: number, readonly detail?: unknown) {
    super(message);
    this.name = "OntologyDatabaseError";
  }
}

const tableNames = ["cards", "correspondence_types", "correspondences", "card_correspondences"] as const;

export async function getDrawCorrespondences(cards: readonly TarotCard[]): Promise<DrawCorrespondence[]> {
  const tables = await tableMap();
  const [ontologyCards, types, correspondences, links] = await Promise.all([
    listRows(tables.cards.id, normalizeCard),
    listRows(tables.correspondence_types.id, normalizeCorrespondenceType),
    listRows(tables.correspondences.id, normalizeCorrespondence),
    listRows(tables.card_correspondences.id, normalizeCardCorrespondence)
  ]);

  const cardsByStableId = new Map(ontologyCards.map((card) => [card.card_id, card]));
  const typesById = new Map(types.map((type) => [type.id, type]));
  const correspondencesById = new Map(correspondences.map((correspondence) => [correspondence.id, correspondence]));
  const selected = new Set(cards.map(ontologyCardIdForTarotCard).filter(Boolean));

  return cards.flatMap((card) => {
    const ontologyCardId = ontologyCardIdForTarotCard(card);
    const ontologyCard = ontologyCardId ? cardsByStableId.get(ontologyCardId) : undefined;

    if (!ontologyCard?.id) {
      return [{
        cardNumber: card.number,
        cardName: card.name,
        ontologyCardId,
        type: "Missing ontology card",
        layer: "",
        displayName: "No ontology row found",
        value: ontologyCardId ?? "No stable ID mapped",
        description: "",
        system: "",
        certainty: "",
        reviewStatus: "",
        sourceReference: ""
      }];
    }

    return links
      .filter((link) => link.card === ontologyCard.id && link.correspondence)
      .map((link) => {
        const correspondence = correspondencesById.get(link.correspondence ?? 0);
        const type = typesById.get(correspondence?.type ?? 0);

        return {
          cardNumber: card.number,
          cardName: card.name,
          ontologyCardId: ontologyCard.card_id,
          type: type?.display_name || "No type",
          layer: type?.layer || "",
          displayName: correspondence?.display_name || "Unknown correspondence",
          value: correspondence?.value || "",
          description: correspondence?.description || "",
          system: link.system,
          certainty: link.certainty,
          reviewStatus: link.review_status,
          sourceReference: link.source_reference
        };
      });
  }).filter((item) => selected.size > 0 || item);
}

async function tableMap(): Promise<Record<(typeof tableNames)[number], BaserowTable>> {
  const tables = await listTables();
  const entries = tableNames.map((name) => {
    const table = tables.find((item) => item.name === name);

    if (!table) {
      throw new OntologyDatabaseError(`Baserow table "${name}" was not found. Run ontology setup first.`);
    }

    return [name, table] as const;
  });

  return Object.fromEntries(entries) as Record<(typeof tableNames)[number], BaserowTable>;
}

async function listTables(): Promise<BaserowTable[]> {
  try {
    return await request<BaserowTable[]>(`/api/database/tables/database/${requireEnv("BASEROW_DATABASE_ID")}/`);
  } catch (error) {
    if (!(error instanceof OntologyDatabaseError) || error.status !== 401) {
      throw error;
    }

    const tables = await request<Array<BaserowTable & { database_id?: number }>>("/api/database/tables/all-tables/");
    return tables.filter((table) => String(table.database_id) === String(requireEnv("BASEROW_DATABASE_ID")));
  }
}

async function listRows<T>(tableId: number, normalize: (row: BaserowRow) => T): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;

  while (true) {
    const result = await request<BaserowListResponse>(
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`
    );
    rows.push(...result.results.map(normalize));

    if (!result.next) {
      return rows;
    }

    page += 1;
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    headers: {
      Authorization: `Token ${requireEnv("BASEROW_TOKEN")}`,
      "Content-Type": "application/json"
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new OntologyDatabaseError(`Baserow request failed (${response.status})`, response.status, body);
  }

  return body as T;
}

function apiUrl(): string {
  return (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(/\/$/, "");
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new OntologyDatabaseError(`Missing ${name}. Add it to .env and restart the server.`);
  }

  return value;
}

function selectValue(value: unknown): string {
  if (value && typeof value === "object" && "value" in value) {
    return String((value as { value: unknown }).value);
  }

  return typeof value === "string" ? value : "";
}

function linkId(value: unknown): number | null {
  if (Array.isArray(value) && value[0] && typeof value[0] === "object" && "id" in value[0]) {
    return Number((value[0] as { id: number }).id);
  }

  return typeof value === "number" ? value : null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCard(row: BaserowRow): OntologyCard {
  return {
    id: row.id,
    card_id: String(row.card_id || ""),
    canonical_name: String(row.canonical_name || ""),
    thoth_name: String(row.thoth_name || ""),
    rws_name: String(row.rws_name || ""),
    arcana: selectValue(row.arcana),
    number: cleanNumber(row.number),
    suit: selectValue(row.suit),
    rank: selectValue(row.rank),
    thoth_title: String(row.thoth_title || ""),
    short_meaning: String(row.short_meaning || ""),
    dashboard_notes: String(row.dashboard_notes || "")
  };
}

function normalizeCorrespondenceType(row: BaserowRow): CorrespondenceType {
  return {
    id: row.id,
    type_id: String(row.type_id || ""),
    display_name: String(row.display_name || ""),
    layer: selectValue(row.layer)
  };
}

function normalizeCorrespondence(row: BaserowRow): Correspondence {
  return {
    id: row.id,
    correspondence_id: String(row.correspondence_id || ""),
    type: linkId(row.type),
    display_name: String(row.display_name || ""),
    value: String(row.value || ""),
    description: String(row.description || ""),
    notes: String(row.notes || "")
  };
}

function normalizeCardCorrespondence(row: BaserowRow): CardCorrespondence {
  return {
    id: row.id,
    card: linkId(row.card),
    correspondence: linkId(row.correspondence),
    system: selectValue(row.system),
    weight: cleanNumber(row.weight) || 1,
    is_primary: Boolean(row.is_primary),
    is_new_aeon_override: Boolean(row.is_new_aeon_override),
    certainty: selectValue(row.certainty),
    source_reference: String(row.source_reference || ""),
    review_status: selectValue(row.review_status),
    notes: String(row.notes || "")
  };
}
