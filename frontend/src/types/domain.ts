export interface PoiLocation {
    latitude: number;
    longitude: number;
}

export interface PoiSchedule {
    open_time_mins: number;
    close_time_mins: number;
    recommended_duration_minutes?: number;
}

export interface PoiFinancials {
    estimated_cost: number;
}

export interface PoiScoring {
    google_rating?: number;
    reviews?: number;
}

export interface Poi {
    name: string;
    city: string;
    category: string;
    cost_eur: number;
    duration_mins: number;
    location: PoiLocation;
    schedule: PoiSchedule;
    financials: PoiFinancials;
    scoring?: PoiScoring;
}

export interface ScheduledPoi {
    poi: Poi;
    arrival_time_mins: number;
    departure_time_mins: number;
    arrival_time: string;
    departure_time: string;
    scheduled_start?: string;
    scheduled_end?: string;
    travel_time_mins_from_prev: number;
    cost_from_prev: number;
}

export interface DailyItinerary {
    day_index: number;
    path: ScheduledPoi[];
    total_cost: number;
    total_duration_mins: number;
    is_valid: boolean;
    constraint_violations: string[];
}

export interface FlightInfo {
    origin_iata: string;
    destination_iata: string;
    departure_time: string;
    arrival_time: string;
}

export interface DayOutput {
    day: number;
    itinerary: DailyItinerary;
    flight_info?: FlightInfo;
}

export interface OptimizationResult {
    metadata: {
        engine: string;
        version: string;
        nodes_evaluated: number;
    };
    travel_constraints: unknown;
    days: DayOutput[];
    total_trip_cost: number;
}
