import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/utils/api';

// In-memory cache for fast synchronous lookup across renders and cards
const airportIataCache = new Map<string, string>();

/**
 * Dynamically resolves the commercial airport IATA code for a given city or location query
 * using Paladio's sovereign AirportService (/api/locations/search).
 * Zero hardcoded dictionaries or mappings.
 */
export async function resolveAirportIata(query?: string | null): Promise<string | null> {
  if (!query || !query.trim()) return null;
  const clean = query.trim();
  const normalized = clean.toLowerCase();

  // If already a 3-letter IATA code, return uppercase directly
  if (/^[a-zA-Z]{3}$/.test(clean)) {
    return clean.toUpperCase();
  }

  // Check in-memory cache
  if (airportIataCache.has(normalized)) {
    return airportIataCache.get(normalized) || null;
  }

  // Try sessionStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(`paladio_iata_${normalized}`);
      if (stored) {
        airportIataCache.set(normalized, stored);
        return stored;
      }
    } catch {
      // ignore storage errors
    }
  }

  try {
    const baseUrl = getApiBaseUrl();
    // 1. Try dedicated backend resolve-airport endpoint
    try {
      const resolveRes = await fetch(`${baseUrl}/locations/resolve-airport?city=${encodeURIComponent(clean)}`);
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        if (data?.iata) {
          const iata = String(data.iata).toUpperCase();
          airportIataCache.set(normalized, iata);
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(`paladio_iata_${normalized}`, iata);
            } catch {
              // ignore storage errors
            }
          }
          return iata;
        }
      }
    } catch {
      // Continue to search fallback
    }

    // 2. Fallback to locations/search
    const res = await fetch(`${baseUrl}/locations/search?q=${encodeURIComponent(clean)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0]?.airport_iata) {
        const iata = String(data[0].airport_iata).toUpperCase();
        airportIataCache.set(normalized, iata);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`paladio_iata_${normalized}`, iata);
          } catch {
            // ignore storage errors
          }
        }
        return iata;
      }
    }
  } catch (err) {
    console.warn(`[AirportResolver] Failed to resolve airport for "${clean}":`, err);
  }

  return null;
}

/**
 * React hook to dynamically resolve airport IATA code for a city/location.
 * Returns synchronous value if already cached, or updates asynchronously once resolved.
 */
export function useResolvedAirportIata(
  query?: string | null,
  initialIata?: string | null
): string | null {
  const clean = query?.trim() || null;
  const normalized = clean ? clean.toLowerCase() : null;

  const [resolved, setResolved] = useState<string | null>(() => {
    if (!normalized) return null;
    return airportIataCache.get(normalized) || null;
  });

  useEffect(() => {
    if (initialIata && initialIata.trim()) {
      return;
    }
    if (!clean) {
      return;
    }

    let isMounted = true;
    resolveAirportIata(clean).then((code) => {
      if (isMounted && code) {
        setResolved(code);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [clean, initialIata]);

  if (initialIata && initialIata.trim()) {
    return initialIata.trim().toUpperCase();
  }

  return resolved;
}
