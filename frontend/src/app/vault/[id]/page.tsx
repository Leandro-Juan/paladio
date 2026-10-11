"use client";

import React from 'react';
import TripWorkspacePage from '@/app/trips/[id]/page';
import { TransitLeg, TransitRecommendation } from '@/types/domain';

export interface RouteItineraryData {
  metadata?: {
    engine?: string;
    version?: string;
    nodes_evaluated?: number;
    transit_upgraded?: boolean;
  };
  days?: Array<{
    day: number;
    flight_info?: {
      origin_iata?: string;
      destination_iata?: string;
      departure_time?: string;
      arrival_time?: string;
    };
    itinerary?: {
      day_index?: number;
      path?: Array<{
        poi?: {
          name?: string;
          city?: string;
          category?: string;
          cost_eur?: number;
          duration_mins?: number;
          location?: { latitude?: number; longitude?: number };
        };
        arrival_time?: string;
        scheduled_start?: string;
        departure_time?: string;
        transit_from_previous?: TransitLeg | null;
      }>;
      total_cost?: number;
      transit_recommendation?: TransitRecommendation | null;
    };
  }>;
  pois?: Array<{
    name?: string;
    lat?: number;
    lng?: number;
    location?: { latitude?: number; longitude?: number };
  }>;
  photos?: string[];
  tickets?: Array<{ title: string; subtitle: string }>;
  total_trip_cost?: number;
}

export default function VaultDetailPage(props: { params: Promise<{ id: string }> }) {
  // Delegate to the renovated Trip Workspace
  return <TripWorkspacePage {...props} />;
}
