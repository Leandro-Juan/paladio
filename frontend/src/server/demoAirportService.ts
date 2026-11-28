import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface DemoAirportInfo {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  distance_km: number | null;
}

export interface DemoLocationResult {
  city: string;
  country: string;
  country_name: string;
  airport_name: string;
  airport_iata: string;
  airport_icao: string;
  distance_km: number | null;
  display_name: string;
  display_airport: string;
  latitude: number | null;
  longitude: number | null;
}

interface GeoCity {
  name: string;
  normName: string;
  countryCode: string;
  population: number;
  latitude: number;
  longitude: number;
}

interface RawLocationsPayload {
  airports: Array<[string, string, string, string, string, number, number, number | null]>;
  countries: Record<string, [string, string, string]>;
  cities: Array<[string, string, number, number, number, string[]?]>;
}

interface AirportIndex {
  byIata: Map<string, DemoAirportInfo>;
  byIcao: Map<string, DemoAirportInfo>;
  byName: Map<string, DemoAirportInfo>;
  commercialAirports: DemoAirportInfo[];
  cityToAirports: Map<string, DemoAirportInfo[]>;
  countryLookup: Map<string, string>;
  countryIsoToName: Map<string, string>;
  capitalsLookup: Map<string, string>;
  gcIndex: Map<string, GeoCity[]>;
  canonicalCities: GeoCity[];
  cityCache: Map<string, DemoAirportInfo | null>;
}

const MAJOR_HUB_QUERY_KEYWORDS = new Set([
  'heathrow',
  'gatwick',
  'schiphol',
  'barajas',
  'haneda',
  'narita',
  'fiumicino',
  'ciampino',
]);

const globalForAirports = globalThis as typeof globalThis & {
  __paladioDemoAirportIndex?: AirportIndex;
};

function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toTitleCase(text: string): string {
  return text.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371.0;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadRawLocationsPayload(): RawLocationsPayload {
  const candidates = [
    path.join(process.cwd(), 'src', 'server', 'demo-locations.json.gz'),
    path.join(process.cwd(), 'frontend', 'src', 'server', 'demo-locations.json.gz'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const gz = fs.readFileSync(filePath);
      const jsonStr = zlib.gunzipSync(gz).toString('utf8');
      return JSON.parse(jsonStr) as RawLocationsPayload;
    }
  }
  throw new Error('Demo locations dataset unavailable at src/server/demo-locations.json.gz.');
}

function buildAirportIndex(): AirportIndex {
  const raw = loadRawLocationsPayload();

  const byIata = new Map<string, DemoAirportInfo>();
  const byIcao = new Map<string, DemoAirportInfo>();
  const byName = new Map<string, DemoAirportInfo>();
  const commercialAirports: DemoAirportInfo[] = [];
  const cityToAirports = new Map<string, DemoAirportInfo[]>();

  for (const row of raw.airports) {
    const [iata, icao, name, city, country, latitude, longitude, elevation] = row;
    const info: DemoAirportInfo = {
      iata,
      icao,
      name,
      city,
      country,
      latitude,
      longitude,
      elevation,
      distance_km: null,
    };
    byIata.set(iata, info);
    if (icao) byIcao.set(icao.toUpperCase(), info);

    const normApName = normalizeName(name);
    if (normApName) byName.set(normApName, info);

    commercialAirports.push(info);

    if (city) {
      const normCity = normalizeName(city);
      const list = cityToAirports.get(normCity);
      if (list) list.push(info);
      else cityToAirports.set(normCity, [info]);
    }
  }

  for (const apList of cityToAirports.values()) {
    apList.sort((a, b) => {
      const aIntl = /international|intercontinental/i.test(a.name) ? 0 : 1;
      const bIntl = /international|intercontinental/i.test(b.name) ? 0 : 1;
      if (aIntl !== bIntl) return aIntl - bIntl;
      const aHasAp = /airport/i.test(a.name) ? 0 : 1;
      const bHasAp = /airport/i.test(b.name) ? 0 : 1;
      if (aHasAp !== bHasAp) return aHasAp - bHasAp;
      return (b.elevation ?? 0) - (a.elevation ?? 0);
    });
  }

  const countryLookup = new Map<string, string>();
  const countryIsoToName = new Map<string, string>();
  const capitalsLookup = new Map<string, string>();

  for (const [iso2, [cName, iso3, capital]] of Object.entries(raw.countries)) {
    countryLookup.set(normalizeName(cName), iso2);
    countryLookup.set(iso2.toLowerCase(), iso2);
    if (iso3) countryLookup.set(iso3.toLowerCase(), iso2);
    if (capital) capitalsLookup.set(normalizeName(capital), iso2);
    countryIsoToName.set(iso2, cName || iso2);
  }
  countryLookup.set('uk', 'GB');
  countryLookup.set('usa', 'US');

  const gcIndex = new Map<string, GeoCity[]>();
  const canonicalCities: GeoCity[] = [];

  for (const row of raw.cities) {
    const [name, countryCode, population, latitude, longitude, alts] = row;
    const normName = normalizeName(name);
    const cityObj: GeoCity = {
      name,
      normName,
      countryCode,
      population,
      latitude,
      longitude,
    };
    canonicalCities.push(cityObj);
    if (normName) {
      const existing = gcIndex.get(normName);
      if (existing) existing.push(cityObj);
      else gcIndex.set(normName, [cityObj]);
    }
    if (Array.isArray(alts)) {
      for (const alt of alts) {
        const normAlt = normalizeName(alt);
        if (normAlt && normAlt.length > 1) {
          const existingAlt = gcIndex.get(normAlt);
          if (existingAlt) existingAlt.push(cityObj);
          else gcIndex.set(normAlt, [cityObj]);
        }
      }
    }
  }

  return {
    byIata,
    byIcao,
    byName,
    commercialAirports,
    cityToAirports,
    countryLookup,
    countryIsoToName,
    capitalsLookup,
    gcIndex,
    canonicalCities,
    cityCache: new Map(),
  };
}

function getIndex(): AirportIndex {
  if (!globalForAirports.__paladioDemoAirportIndex) {
    globalForAirports.__paladioDemoAirportIndex = buildAirportIndex();
  }
  return globalForAirports.__paladioDemoAirportIndex;
}

function getAirportByName(index: AirportIndex, airportName: string): DemoAirportInfo | null {
  const trimmed = airportName.trim();
  if (!trimmed) return null;
  const norm = normalizeName(trimmed);
  const direct = index.byName.get(norm);
  if (direct) return direct;

  const wordRegex = new RegExp(`\\b${escapeRegExp(norm)}\\b`);
  let matches = index.commercialAirports.filter((ap) => wordRegex.test(normalizeName(ap.name)));

  if (matches.length === 0) {
    const tokens = norm
      .split(/\s+/)
      .filter((t) => t && t !== 'airport' && t !== 'international');
    if (tokens.length > 0) {
      matches = index.commercialAirports.filter((ap) => {
        const apWords = new Set(normalizeName(ap.name).split(/\s+/));
        return tokens.every((tok) => apWords.has(tok));
      });
    }
  }

  if (matches.length === 0) {
    matches = index.commercialAirports.filter((ap) => normalizeName(ap.name).includes(norm));
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    const aIntl = a.name.toLowerCase().includes('international') ? 0 : 1;
    const bIntl = b.name.toLowerCase().includes('international') ? 0 : 1;
    return aIntl - bIntl;
  });
  return matches[0];
}

function findNearestAirports(
  index: AirportIndex,
  lat: number,
  lon: number,
  k: number
): Array<{ ap: DemoAirportInfo; distKm: number }> {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const top: Array<{ ap: DemoAirportInfo; approxSq: number }> = [];

  for (const ap of index.commercialAirports) {
    const dLat = ap.latitude - lat;
    const dLon = (ap.longitude - lon) * cosLat;
    const approxSq = dLat * dLat + dLon * dLon;

    if (top.length < k) {
      top.push({ ap, approxSq });
      if (top.length === k) {
        top.sort((a, b) => a.approxSq - b.approxSq);
      }
    } else if (approxSq < top[k - 1].approxSq) {
      top[k - 1] = { ap, approxSq };
      top.sort((a, b) => a.approxSq - b.approxSq);
    }
  }

  return top.map(({ ap }) => ({
    ap,
    distKm: haversineDistanceKm(lat, lon, ap.latitude, ap.longitude),
  }));
}

export function resolveDemoAirportForCity(
  cityName: string | null | undefined,
  countryCode?: string | null
): DemoAirportInfo | null {
  if (!cityName || !cityName.trim()) return null;

  const index = getIndex();
  let cleanQuery = cityName.trim();
  let targetCountry = countryCode ? countryCode.toUpperCase().trim() : null;

  if (cleanQuery.includes(',') && !targetCountry) {
    const parts = cleanQuery.split(',');
    cleanQuery = parts[0].trim();
    const hint = normalizeName(parts[parts.length - 1].trim());
    const foundCountry = index.countryLookup.get(hint);
    if (foundCountry) targetCountry = foundCountry;
  }

  const norm = normalizeName(cleanQuery);
  const cacheKey = `${norm}::${targetCountry || ''}`;
  if (index.cityCache.has(cacheKey)) {
    return index.cityCache.get(cacheKey) ?? null;
  }

  const cleanUpper = cleanQuery.toUpperCase();
  if (cleanUpper.length === 3 && index.byIata.has(cleanUpper)) {
    const direct = index.byIata.get(cleanUpper) ?? null;
    index.cityCache.set(cacheKey, direct);
    return direct;
  }
  if (cleanUpper.length === 4 && index.byIcao.has(cleanUpper)) {
    const direct = index.byIcao.get(cleanUpper) ?? null;
    index.cityCache.set(cacheKey, direct);
    return direct;
  }

  const gcMatches = index.gcIndex.get(norm);
  if (gcMatches && gcMatches.length > 0) {
    let candidates = gcMatches;
    if (targetCountry) {
      const countryFiltered = candidates.filter((c) => c.countryCode === targetCountry);
      if (countryFiltered.length > 0) candidates = countryFiltered;
    }

    let bestCity = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
      const isCanonical = c.normName === norm;
      const isCapital = c.countryCode === index.capitalsLookup.get(norm);
      const score =
        isCanonical && isCapital
          ? c.population * 1000
          : isCanonical
            ? c.population
            : c.population * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestCity = c;
      }
    }

    const nearest = findNearestAirports(index, bestCity.latitude, bestCity.longitude, 10);
    let bestResolved: DemoAirportInfo | null = null;
    let bestApScore = Number.POSITIVE_INFINITY;

    for (const { ap, distKm } of nearest) {
      const sameCountry = ap.country === bestCity.countryCode;
      const isIntl = /international|intercontinental/i.test(ap.name);
      const apCityNorm = normalizeName(ap.city);
      const nameMatchesCity = Boolean(
        apCityNorm && (apCityNorm === norm || apCityNorm === bestCity.normName)
      );

      const countryPenalty = sameCountry ? 0 : 50;
      const intlBonus = isIntl && distKm < 100 ? -15 : 0;
      const cityMatchBonus = nameMatchesCity ? -20 : 0;
      const totalScore = distKm + countryPenalty + intlBonus + cityMatchBonus;

      if (totalScore < bestApScore) {
        bestApScore = totalScore;
        bestResolved = {
          ...ap,
          distance_km: Math.round(distKm * 10) / 10,
        };
      }
    }

    if (bestResolved) {
      index.cityCache.set(cacheKey, bestResolved);
      return bestResolved;
    }
  }

  const cityDirect = index.cityToAirports.get(norm);
  if (cityDirect && cityDirect.length > 0) {
    index.cityCache.set(cacheKey, cityDirect[0]);
    return cityDirect[0];
  }

  const byApName = getAirportByName(index, cleanQuery);
  index.cityCache.set(cacheKey, byApName);
  return byApName;
}

export function searchDemoLocations(query: string | null | undefined, limit = 8): DemoLocationResult[] {
  if (!query || !query.trim()) return [];

  const index = getIndex();
  const safeLimit = Math.max(1, Math.min(20, limit));
  const rawQuery = query.trim();
  const normQuery = normalizeName(rawQuery);
  const cleanUpper = rawQuery.toUpperCase();

  const results: DemoLocationResult[] = [];
  const seenKeys = new Set<string>();
  const seenIatas = new Set<string>();

  // 1. Direct IATA / ICAO code match
  if (cleanUpper.length === 3 || cleanUpper.length === 4) {
    const apDirect = index.byIata.get(cleanUpper) ?? index.byIcao.get(cleanUpper);
    if (apDirect) {
      const cityName = apDirect.city ? toTitleCase(apDirect.city) : apDirect.name;
      const countryName = index.countryIsoToName.get(apDirect.country) ?? apDirect.country;
      const key = `${cityName.toLowerCase()}::${apDirect.iata}`;
      seenKeys.add(key);
      seenIatas.add(apDirect.iata);
      results.push({
        city: cityName,
        country: apDirect.country,
        country_name: countryName,
        airport_name: apDirect.name,
        airport_iata: apDirect.iata,
        airport_icao: apDirect.icao,
        distance_km: 0.0,
        display_name: `${cityName}, ${countryName}`,
        display_airport: `${apDirect.name} (${apDirect.iata})`,
        latitude: apDirect.latitude,
        longitude: apDirect.longitude,
      });
    }
  }

  // 2. Direct airport name match
  const isKnownCityQuery = index.gcIndex.has(normQuery) || index.cityToAirports.has(normQuery);
  const apByName = getAirportByName(index, rawQuery);
  let secondaryApCandidate: { key: string; item: DemoLocationResult } | null = null;

  if (apByName) {
    const cityName = apByName.city ? toTitleCase(apByName.city) : apByName.name;
    const countryName = index.countryIsoToName.get(apByName.country) ?? apByName.country;
    const normAp = normalizeName(apByName.name);
    const key = `${cityName.toLowerCase()}::${apByName.iata}`;
    const item: DemoLocationResult = {
      city: cityName,
      country: apByName.country,
      country_name: countryName,
      airport_name: apByName.name,
      airport_iata: apByName.iata,
      airport_icao: apByName.icao,
      distance_km: 0.0,
      display_name: `${cityName}, ${countryName}`,
      display_airport: `${apByName.name} (${apByName.iata})`,
      latitude: apByName.latitude,
      longitude: apByName.longitude,
    };

    if (
      (!isKnownCityQuery && normAp.startsWith(normQuery)) ||
      MAJOR_HUB_QUERY_KEYWORDS.has(normQuery)
    ) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        seenIatas.add(apByName.iata);
        results.push(item);
      }
    } else {
      secondaryApCandidate = { key, item };
    }
  }

  // 2.5 Multi-airport city lookup (e.g. Paris -> CDG/ORY, London -> LHR/LGW)
  const directCityAps = index.cityToAirports.get(normQuery);
  if (directCityAps && directCityAps.length > 0) {
    const cityGcMatches = index.gcIndex.get(normQuery) ?? [];
    const apCityMap = new Map<string, { city: GeoCity | null; distKm: number }>();

    for (const ap of directCityAps) {
      const countryCities = cityGcMatches.filter((c) => c.countryCode === ap.country);
      if (countryCities.length === 0) {
        apCityMap.set(ap.iata, { city: null, distKm: 9999 });
        continue;
      }
      let bestC = countryCities[0];
      let bestDist = haversineDistanceKm(ap.latitude, ap.longitude, bestC.latitude, bestC.longitude);
      for (let i = 1; i < countryCities.length; i++) {
        const c = countryCities[i];
        const d = haversineDistanceKm(ap.latitude, ap.longitude, c.latitude, c.longitude);
        if (d < bestDist || (d === bestDist && c.population > bestC.population)) {
          bestDist = d;
          bestC = c;
        }
      }
      apCityMap.set(ap.iata, { city: bestC, distKm: bestDist });
    }

    const capitalCc = index.capitalsLookup.get(normQuery);
    const sortedCityAps = [...directCityAps].sort((a, b) => {
      const aInfo = apCityMap.get(a.iata)!;
      const bInfo = apCityMap.get(b.iata)!;
      const aCap = capitalCc && a.country === capitalCc ? 0 : 1;
      const bCap = capitalCc && b.country === capitalCc ? 0 : 1;
      if (aCap !== bCap) return aCap - bCap;

      const popDiff = (bInfo.city?.population ?? 0) - (aInfo.city?.population ?? 0);
      if (popDiff !== 0) return popDiff;

      const aIntl = /international|intercontinental/i.test(a.name) ? 0 : 1;
      const bIntl = /international|intercontinental/i.test(b.name) ? 0 : 1;
      if (aIntl !== bIntl) return aIntl - bIntl;

      const aHasAp = /airport/i.test(a.name) ? 0 : 1;
      const bHasAp = /airport/i.test(b.name) ? 0 : 1;
      if (aHasAp !== bHasAp) return aHasAp - bHasAp;

      if (aInfo.distKm !== bInfo.distKm) return aInfo.distKm - bInfo.distKm;
      return (b.elevation ?? 0) - (a.elevation ?? 0);
    });

    for (const ap of sortedCityAps) {
      if (results.length >= safeLimit) break;
      if (seenIatas.has(ap.iata)) continue;
      const cityName = ap.city ? toTitleCase(ap.city) : toTitleCase(rawQuery);
      const countryName = index.countryIsoToName.get(ap.country) ?? ap.country;
      seenKeys.add(`${cityName.toLowerCase()}::${ap.iata}`);
      seenIatas.add(ap.iata);

      const matched = apCityMap.get(ap.iata)!;
      const useCityCoords = matched.city !== null && matched.distKm <= 150;
      results.push({
        city: cityName,
        country: ap.country,
        country_name: countryName,
        airport_name: ap.name,
        airport_iata: ap.iata,
        airport_icao: ap.icao,
        distance_km: 0.0,
        display_name: `${cityName}, ${countryName}`,
        display_airport: `${ap.name} (${ap.iata})`,
        latitude: useCityCoords ? matched.city!.latitude : ap.latitude,
        longitude: useCityCoords ? matched.city!.longitude : ap.longitude,
      });
    }
  }

  // 3. Dynamic search across world cities
  const candidateCities: GeoCity[] = [];
  for (const c of index.canonicalCities) {
    if (
      c.normName.startsWith(normQuery) ||
      (normQuery.length >= 3 && c.normName.includes(normQuery))
    ) {
      candidateCities.push(c);
    }
  }

  if (candidateCities.length < 15) {
    const altMatches = index.gcIndex.get(normQuery);
    if (altMatches) candidateCities.push(...altMatches);
  }

  const deduped = new Map<string, GeoCity>();
  for (const c of candidateCities) {
    const key = `${c.name.toLowerCase()}::${c.countryCode}`;
    const existing = deduped.get(key);
    if (!existing || c.population > existing.population) {
      deduped.set(key, c);
    }
  }

  const rankCity = (c: GeoCity): number => {
    const p = Math.max(c.population, 100);
    const pScore = Math.log10(p);
    const isCap = c.countryCode === index.capitalsLookup.get(c.normName) ? 1.3 : 1.0;
    if (c.normName === normQuery && p >= 50000) return pScore * 3.5 * isCap;
    if (c.normName === normQuery) return pScore * 1.5 * isCap;
    if (c.normName.startsWith(normQuery)) return pScore * 2.0 * isCap;
    return pScore * isCap;
  };

  const sortedCities = Array.from(deduped.values()).sort((a, b) => rankCity(b) - rankCity(a));

  for (const c of sortedCities) {
    if (results.length >= safeLimit) break;
    const ap = resolveDemoAirportForCity(c.name, c.countryCode);
    if (!ap || seenIatas.has(ap.iata)) continue;

    const key = `${c.name.toLowerCase()}::${ap.iata}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    seenIatas.add(ap.iata);

    const countryName = index.countryIsoToName.get(c.countryCode) ?? c.countryCode;
    results.push({
      city: c.name,
      country: c.countryCode,
      country_name: countryName,
      airport_name: ap.name,
      airport_iata: ap.iata,
      airport_icao: ap.icao,
      distance_km: ap.distance_km,
      display_name: `${c.name}, ${countryName}`,
      display_airport: `${ap.name} (${ap.iata})`,
      latitude: c.latitude,
      longitude: c.longitude,
    });
  }

  // 4. Secondary airport match & "City, Country" fallback
  if (secondaryApCandidate && results.length < safeLimit) {
    const { key, item } = secondaryApCandidate;
    if (!seenKeys.has(key) && !seenIatas.has(item.airport_iata)) {
      seenKeys.add(key);
      seenIatas.add(item.airport_iata);
      results.push(item);
    }
  }

  if (results.length === 0 && rawQuery.includes(',')) {
    const apFallback = resolveDemoAirportForCity(rawQuery);
    if (apFallback) {
      const cityName = apFallback.city
        ? toTitleCase(apFallback.city)
        : toTitleCase(rawQuery.split(',')[0].trim());
      const countryName = index.countryIsoToName.get(apFallback.country) ?? apFallback.country;
      results.push({
        city: cityName,
        country: apFallback.country,
        country_name: countryName,
        airport_name: apFallback.name,
        airport_iata: apFallback.iata,
        airport_icao: apFallback.icao,
        distance_km: apFallback.distance_km ?? 0.0,
        display_name: `${cityName}, ${countryName}`,
        display_airport: `${apFallback.name} (${apFallback.iata})`,
        latitude: apFallback.latitude,
        longitude: apFallback.longitude,
      });
    }
  }

  return results.slice(0, safeLimit);
}
