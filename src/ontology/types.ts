export interface OntologyCard {
  id?: number;
  card_id: string;
  canonical_name: string;
  thoth_name: string;
  rws_name: string;
  arcana: string;
  number: number | null;
  suit: string;
  rank: string;
  thoth_title: string;
  short_meaning: string;
  dashboard_notes: string;
}

export interface CorrespondenceType {
  id?: number;
  type_id: string;
  display_name: string;
  layer: string;
}

export interface Correspondence {
  id?: number;
  correspondence_id: string;
  type: number | null;
  display_name: string;
  value: string;
  description: string;
  notes: string;
}

export interface CardCorrespondence {
  id?: number;
  card: number | null;
  correspondence: number | null;
  system: string;
  weight: number;
  is_primary: boolean;
  is_new_aeon_override: boolean;
  certainty: string;
  source_reference: string;
  review_status: string;
  notes: string;
}

export interface DrawCorrespondence {
  cardNumber: number;
  cardName: string;
  ontologyCardId: string | null;
  type: string;
  layer: string;
  displayName: string;
  value: string;
  description: string;
  system: string;
  certainty: string;
  reviewStatus: string;
  sourceReference: string;
}
