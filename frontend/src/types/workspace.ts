import type { PoiTransitInfo } from './domain';

export interface PlaceItem {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  day?: number;
  durationMins?: number;
  costEur?: number;
  similarity?: number;
  matchType?: string;
  description?: string;
}

export interface PoiApiItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  duration_mins: number;
  cost_eur: number;
  similarity: number;
  iconicity_score?: number;
  match_type?: string;
  description?: string;
  rating?: number;
  scoring?: { rating?: number; reviews?: number };
  photo_url?: string;
  thumbnail_url?: string;
  transit_info?: PoiTransitInfo | null;
}
