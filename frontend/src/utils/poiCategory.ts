export type PoiCategoryType =
  | 'museum'
  | 'restaurant'
  | 'cafe'
  | 'bus_stop'
  | 'transit'
  | 'hotel'
  | 'bar'
  | 'landmark'
  | 'park'
  | 'attraction'
  | 'flight'
  | 'airport'
  | 'shopping'
  | 'general';

export interface CategoryMeta {
  type: PoiCategoryType;
  label: string;
  bg: string;
  color: string;
  borderColor: string;
}

const CATEGORY_DEFINITIONS: Record<PoiCategoryType, { label: string; bg: string; color: string; borderColor: string }> = {
  museum: {
    label: 'MUSEUM',
    bg: 'rgba(99, 102, 241, 0.08)',
    color: '#4F46E5',
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  restaurant: {
    label: 'RESTAURANT',
    bg: 'rgba(217, 119, 6, 0.08)',
    color: '#D97706',
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  cafe: {
    label: 'CAFÉ',
    bg: 'rgba(180, 83, 9, 0.08)',
    color: '#B45309',
    borderColor: 'rgba(180, 83, 9, 0.25)',
  },
  bus_stop: {
    label: 'BUS STOP',
    bg: 'rgba(13, 148, 136, 0.08)',
    color: '#0D9488',
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  transit: {
    label: 'TRANSIT',
    bg: 'rgba(8, 145, 178, 0.08)',
    color: '#0891B2',
    borderColor: 'rgba(8, 145, 178, 0.25)',
  },
  hotel: {
    label: 'HOTEL',
    bg: 'rgba(30, 58, 138, 0.08)',
    color: '#1E3A8A',
    borderColor: 'rgba(30, 58, 138, 0.25)',
  },
  bar: {
    label: 'BAR / PUB',
    bg: 'rgba(225, 29, 72, 0.08)',
    color: '#E11D48',
    borderColor: 'rgba(225, 29, 72, 0.25)',
  },
  landmark: {
    label: 'LANDMARK',
    bg: 'rgba(124, 58, 237, 0.08)',
    color: '#7C3AED',
    borderColor: 'rgba(124, 58, 237, 0.25)',
  },
  park: {
    label: 'PARK / NATURE',
    bg: 'rgba(22, 101, 52, 0.08)',
    color: '#166534',
    borderColor: 'rgba(22, 101, 52, 0.25)',
  },
  attraction: {
    label: 'ATTRACTION',
    bg: 'rgba(2, 132, 199, 0.08)',
    color: '#0284C7',
    borderColor: 'rgba(2, 132, 199, 0.25)',
  },
  flight: {
    label: 'FLIGHT',
    bg: 'rgba(79, 70, 229, 0.08)',
    color: '#4338CA',
    borderColor: 'rgba(79, 70, 229, 0.25)',
  },
  airport: {
    label: 'AIRPORT',
    bg: 'rgba(14, 116, 144, 0.08)',
    color: '#0E7490',
    borderColor: 'rgba(14, 116, 144, 0.25)',
  },
  shopping: {
    label: 'SHOPPING',
    bg: 'rgba(192, 38, 211, 0.08)',
    color: '#C026D3',
    borderColor: 'rgba(192, 38, 211, 0.25)',
  },
  general: {
    label: 'WAYPOINT',
    bg: 'rgba(100, 116, 139, 0.08)',
    color: '#64748B',
    borderColor: 'rgba(100, 116, 139, 0.25)',
  },
};

export function classifyPoiCategory(category?: string, name?: string): CategoryMeta {
  const normCat = (category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, ' ');

  const normName = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // 1. Explicit Category matching
  if (normCat.includes('museum') || normCat.includes('gallery') || normCat.includes('exhibition')) {
    return { type: 'museum', ...CATEGORY_DEFINITIONS.museum };
  }
  if (normCat.includes('bus stop') || normCat.includes('bus station') || normCat === 'bus') {
    return { type: 'bus_stop', ...CATEGORY_DEFINITIONS.bus_stop };
  }
  if (
    normCat.includes('metro') ||
    normCat.includes('subway') ||
    normCat.includes('train') ||
    normCat.includes('station') ||
    normCat.includes('transit') ||
    normCat.includes('tram')
  ) {
    return { type: 'transit', ...CATEGORY_DEFINITIONS.transit };
  }
  if (normCat.includes('cafe') || normCat.includes('bakery') || normCat.includes('coffee')) {
    return { type: 'cafe', ...CATEGORY_DEFINITIONS.cafe };
  }
  if (normCat.includes('restaurant') || normCat.includes('bistro') || normCat.includes('dining') || normCat.includes('food')) {
    return { type: 'restaurant', ...CATEGORY_DEFINITIONS.restaurant };
  }
  if (normCat.includes('bar') || normCat.includes('pub') || normCat.includes('nightlife') || normCat.includes('club')) {
    return { type: 'bar', ...CATEGORY_DEFINITIONS.bar };
  }
  if (normCat.includes('hotel') || normCat.includes('hostel') || normCat.includes('lodging') || normCat.includes('resort')) {
    return { type: 'hotel', ...CATEGORY_DEFINITIONS.hotel };
  }
  if (normCat.includes('flight')) {
    return { type: 'flight', ...CATEGORY_DEFINITIONS.flight };
  }
  if (normCat.includes('airport')) {
    return { type: 'airport', ...CATEGORY_DEFINITIONS.airport };
  }
  if (
    normCat.includes('landmark') ||
    normCat.includes('monument') ||
    normCat.includes('historic') ||
    normCat.includes('castle') ||
    normCat.includes('ruins') ||
    normCat.includes('cathedral') ||
    normCat.includes('church')
  ) {
    return { type: 'landmark', ...CATEGORY_DEFINITIONS.landmark };
  }
  if (normCat.includes('park') || normCat.includes('garden') || normCat.includes('nature') || normCat.includes('trail')) {
    return { type: 'park', ...CATEGORY_DEFINITIONS.park };
  }
  if (normCat.includes('shopping') || normCat.includes('shop') || normCat.includes('market') || normCat.includes('mall') || normCat.includes('store')) {
    return { type: 'shopping', ...CATEGORY_DEFINITIONS.shopping };
  }
  if (normCat.includes('attraction') || normCat.includes('sight') || normCat.includes('viewpoint')) {
    return { type: 'attraction', ...CATEGORY_DEFINITIONS.attraction };
  }

  // 2. Intelligent Name Heuristic Fallbacks (when category is missing or vague like "attraction")
  if (normName) {
    if (/\b(museum|musee|museo|gallery|galerie)\b/.test(normName)) {
      return { type: 'museum', ...CATEGORY_DEFINITIONS.museum };
    }
    if (/\b(bus stop|bus station|arret de bus|parada de autobus)\b/.test(normName)) {
      return { type: 'bus_stop', ...CATEGORY_DEFINITIONS.bus_stop };
    }
    if (/\b(metro|subway|gare|train station|estacion|transit)\b/.test(normName)) {
      return { type: 'transit', ...CATEGORY_DEFINITIONS.transit };
    }
    if (/\b(cafe|coffee|espresso|bakery|boulangerie|patisserie)\b/.test(normName)) {
      return { type: 'cafe', ...CATEGORY_DEFINITIONS.cafe };
    }
    if (/\b(restaurant|bistro|trattoria|osteria|pizzeria|brasserie)\b/.test(normName)) {
      return { type: 'restaurant', ...CATEGORY_DEFINITIONS.restaurant };
    }
    if (/\b(hotel|hostel|inn|resort|hyatt|hilton|marriott)\b/.test(normName)) {
      return { type: 'hotel', ...CATEGORY_DEFINITIONS.hotel };
    }
    if (/\b(airport|aeroport|aeropuerto|terminal)\b/.test(normName)) {
      return { type: 'airport', ...CATEGORY_DEFINITIONS.airport };
    }
    if (/\b(park|garden|jardin|parque)\b/.test(normName)) {
      return { type: 'park', ...CATEGORY_DEFINITIONS.park };
    }
    if (/\b(monument|cathedral|basilica|castle|chateau|tower|palace|arch)\b/.test(normName)) {
      return { type: 'landmark', ...CATEGORY_DEFINITIONS.landmark };
    }
    if (/\b(bar|pub|tavern|brewery)\b/.test(normName)) {
      return { type: 'bar', ...CATEGORY_DEFINITIONS.bar };
    }
  }

  // 3. If raw category was provided but didn't match standard buckets, format it nicely
  if (category && category.trim()) {
    const customLabel = category.replace(/[-_]/g, ' ').toUpperCase();
    return {
      type: 'general',
      label: customLabel,
      bg: CATEGORY_DEFINITIONS.general.bg,
      color: CATEGORY_DEFINITIONS.general.color,
      borderColor: CATEGORY_DEFINITIONS.general.borderColor,
    };
  }

  return { type: 'general', ...CATEGORY_DEFINITIONS.general };
}
