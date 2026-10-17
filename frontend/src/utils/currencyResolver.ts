export interface CurrencyInfo {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  symbol: string;
}

export const SUPPORTED_CURRENCY_LIST: CurrencyInfo[] = [
  { code: 'EUR', name: 'Euro', country: 'European Union', countryCode: 'EU', flag: '🇪🇺', symbol: '€' },
  { code: 'USD', name: 'US Dollar', country: 'United States', countryCode: 'US', flag: '🇺🇸', symbol: '$' },
  { code: 'GBP', name: 'British Pound', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧', symbol: '£' },
  { code: 'PLN', name: 'Polish Zloty', country: 'Poland', countryCode: 'PL', flag: '🇵🇱', symbol: 'zł' },
  { code: 'CHF', name: 'Swiss Franc', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', symbol: 'CHF' },
  { code: 'NOK', name: 'Norwegian Krone', country: 'Norway', countryCode: 'NO', flag: '🇳🇴', symbol: 'kr' },
  { code: 'SEK', name: 'Swedish Krona', country: 'Sweden', countryCode: 'SE', flag: '🇸🇪', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', country: 'Denmark', countryCode: 'DK', flag: '🇩🇰', symbol: 'kr' },
  { code: 'JPY', name: 'Japanese Yen', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', country: 'Canada', countryCode: 'CA', flag: '🇨🇦', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', country: 'Australia', countryCode: 'AU', flag: '🇦🇺', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', country: 'New Zealand', countryCode: 'NZ', flag: '🇳🇿', symbol: 'NZ$' },
  { code: 'SGD', name: 'Singapore Dollar', country: 'Singapore', countryCode: 'SG', flag: '🇸🇬', symbol: 'S$' },
  { code: 'KRW', name: 'South Korean Won', country: 'South Korea', countryCode: 'KR', flag: '🇰🇷', symbol: '₩' },
  { code: 'CNY', name: 'Chinese Yuan', country: 'China', countryCode: 'CN', flag: '🇨🇳', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', country: 'India', countryCode: 'IN', flag: '🇮🇳', symbol: '₹' },
  { code: 'BRL', name: 'Brazilian Real', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', country: 'Mexico', countryCode: 'MX', flag: '🇲🇽', symbol: 'Mex$' },
  { code: 'TRY', name: 'Turkish Lira', country: 'Turkey', countryCode: 'TR', flag: '🇹🇷', symbol: '₺' },
  { code: 'THB', name: 'Thai Baht', country: 'Thailand', countryCode: 'TH', flag: '🇹🇭', symbol: '฿' },
  { code: 'CZK', name: 'Czech Koruna', country: 'Czech Republic', countryCode: 'CZ', flag: '🇨🇿', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', country: 'Hungary', countryCode: 'HU', flag: '🇭🇺', symbol: 'Ft' },
  { code: 'AED', name: 'UAE Dirham', country: 'United Arab Emirates', countryCode: 'AE', flag: '🇦🇪', symbol: 'AED' },
];

export const DESTINATION_TO_COUNTRY: Record<string, { country: string; code: string; currency: string; flag: string; symbol: string }> = {
  madrid: { country: 'Spain', code: 'ES', currency: 'EUR', flag: '🇪🇸', symbol: '€' },
  barcelona: { country: 'Spain', code: 'ES', currency: 'EUR', flag: '🇪🇸', symbol: '€' },
  seville: { country: 'Spain', code: 'ES', currency: 'EUR', flag: '🇪🇸', symbol: '€' },
  sevilla: { country: 'Spain', code: 'ES', currency: 'EUR', flag: '🇪🇸', symbol: '€' },
  valencia: { country: 'Spain', code: 'ES', currency: 'EUR', flag: '🇪🇸', symbol: '€' },
  paris: { country: 'France', code: 'FR', currency: 'EUR', flag: '🇫🇷', symbol: '€' },
  nice: { country: 'France', code: 'FR', currency: 'EUR', flag: '🇫🇷', symbol: '€' },
  lyon: { country: 'France', code: 'FR', currency: 'EUR', flag: '🇫🇷', symbol: '€' },
  rome: { country: 'Italy', code: 'IT', currency: 'EUR', flag: '🇮🇹', symbol: '€' },
  milan: { country: 'Italy', code: 'IT', currency: 'EUR', flag: '🇮🇹', symbol: '€' },
  florence: { country: 'Italy', code: 'IT', currency: 'EUR', flag: '🇮🇹', symbol: '€' },
  venice: { country: 'Italy', code: 'IT', currency: 'EUR', flag: '🇮🇹', symbol: '€' },
  berlin: { country: 'Germany', code: 'DE', currency: 'EUR', flag: '🇩🇪', symbol: '€' },
  munich: { country: 'Germany', code: 'DE', currency: 'EUR', flag: '🇩🇪', symbol: '€' },
  amsterdam: { country: 'Netherlands', code: 'NL', currency: 'EUR', flag: '🇳🇱', symbol: '€' },
  london: { country: 'United Kingdom', code: 'GB', currency: 'GBP', flag: '🇬🇧', symbol: '£' },
  edinburgh: { country: 'United Kingdom', code: 'GB', currency: 'GBP', flag: '🇬🇧', symbol: '£' },
  dublin: { country: 'Ireland', code: 'IE', currency: 'EUR', flag: '🇮🇪', symbol: '€' },
  lisbon: { country: 'Portugal', code: 'PT', currency: 'EUR', flag: '🇵🇹', symbol: '€' },
  porto: { country: 'Portugal', code: 'PT', currency: 'EUR', flag: '🇵🇹', symbol: '€' },
  vienna: { country: 'Austria', code: 'AT', currency: 'EUR', flag: '🇦🇹', symbol: '€' },
  brussels: { country: 'Belgium', code: 'BE', currency: 'EUR', flag: '🇧🇪', symbol: '€' },
  zurich: { country: 'Switzerland', code: 'CH', currency: 'CHF', flag: '🇨🇭', symbol: 'CHF' },
  geneva: { country: 'Switzerland', code: 'CH', currency: 'CHF', flag: '🇨🇭', symbol: 'CHF' },
  oslo: { country: 'Norway', code: 'NO', currency: 'NOK', flag: '🇳🇴', symbol: 'kr' },
  stockholm: { country: 'Sweden', code: 'SE', currency: 'SEK', flag: '🇸🇪', symbol: 'kr' },
  copenhagen: { country: 'Denmark', code: 'DK', currency: 'DKK', flag: '🇩🇰', symbol: 'kr' },
  warsaw: { country: 'Poland', code: 'PL', currency: 'PLN', flag: '🇵🇱', symbol: 'zł' },
  krakow: { country: 'Poland', code: 'PL', currency: 'PLN', flag: '🇵🇱', symbol: 'zł' },
  prague: { country: 'Czech Republic', code: 'CZ', currency: 'CZK', flag: '🇨🇿', symbol: 'Kč' },
  budapest: { country: 'Hungary', code: 'HU', currency: 'HUF', flag: '🇭🇺', symbol: 'Ft' },
  athens: { country: 'Greece', code: 'GR', currency: 'EUR', flag: '🇬🇷', symbol: '€' },
  tokyo: { country: 'Japan', code: 'JP', currency: 'JPY', flag: '🇯🇵', symbol: '¥' },
  kyoto: { country: 'Japan', code: 'JP', currency: 'JPY', flag: '🇯🇵', symbol: '¥' },
  osaka: { country: 'Japan', code: 'JP', currency: 'JPY', flag: '🇯🇵', symbol: '¥' },
  'new york': { country: 'United States', code: 'US', currency: 'USD', flag: '🇺🇸', symbol: '$' },
  'san francisco': { country: 'United States', code: 'US', currency: 'USD', flag: '🇺🇸', symbol: '$' },
  'los angeles': { country: 'United States', code: 'US', currency: 'USD', flag: '🇺🇸', symbol: '$' },
  toronto: { country: 'Canada', code: 'CA', currency: 'CAD', flag: '🇨🇦', symbol: 'CA$' },
  sydney: { country: 'Australia', code: 'AU', currency: 'AUD', flag: '🇦🇺', symbol: 'A$' },
  singapore: { country: 'Singapore', code: 'SG', currency: 'SGD', flag: '🇸🇬', symbol: 'S$' },
  seoul: { country: 'South Korea', code: 'KR', currency: 'KRW', flag: '🇰🇷', symbol: '₩' },
  bangkok: { country: 'Thailand', code: 'TH', currency: 'THB', flag: '🇹🇭', symbol: '฿' },
  dubai: { country: 'United Arab Emirates', code: 'AE', currency: 'AED', flag: '🇦🇪', symbol: 'AED' },
  istanbul: { country: 'Turkey', code: 'TR', currency: 'TRY', flag: '🇹🇷', symbol: '₺' },
};

export function getCurrencyInfo(code?: string): CurrencyInfo {
  const c = (code || 'EUR').toUpperCase();
  const found = SUPPORTED_CURRENCY_LIST.find((item) => item.code === c);
  if (found) return found;
  return {
    code: c,
    name: c,
    country: c,
    countryCode: c.slice(0, 2),
    flag: '',
    symbol: c,
  };
}

export function resolveDestinationCurrency(destination?: string): {
  country: string;
  countryCode: string;
  currency: string;
  symbol: string;
  flag: string;
} {
  if (!destination) {
    return { country: 'Destination', countryCode: 'EU', currency: 'EUR', symbol: '€', flag: '🇪🇺' };
  }
  const clean = destination.trim().toLowerCase();
  if (DESTINATION_TO_COUNTRY[clean]) {
    const item = DESTINATION_TO_COUNTRY[clean];
    return {
      country: item.country,
      countryCode: item.code,
      currency: item.currency,
      symbol: item.symbol,
      flag: item.flag,
    };
  }

  // Check partial word match
  for (const [key, value] of Object.entries(DESTINATION_TO_COUNTRY)) {
    if (clean.includes(key) || key.includes(clean)) {
      return {
        country: value.country,
        countryCode: value.code,
        currency: value.currency,
        symbol: value.symbol,
        flag: value.flag,
      };
    }
  }

  // Check supported currency list
  const asCurrency = SUPPORTED_CURRENCY_LIST.find(
    (c) => c.country.toLowerCase() === clean || c.code.toLowerCase() === clean
  );
  if (asCurrency) {
    return {
      country: asCurrency.country,
      countryCode: asCurrency.countryCode,
      currency: asCurrency.code,
      symbol: asCurrency.symbol,
      flag: asCurrency.flag,
    };
  }

  return { country: destination, countryCode: 'EU', currency: 'EUR', symbol: '€', flag: '🇪🇺' };
}

const FX_CACHE_PREFIX = 'paladio_fx_rate_';
const FX_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

export async function fetchLiveExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<{ rate: number; isLive: boolean; date?: string }> {
  const from = fromCurrency.toUpperCase().trim();
  const to = toCurrency.toUpperCase().trim();

  if (from === to) {
    return { rate: 1.0, isLive: true };
  }

  const cacheKey = `${FX_CACHE_PREFIX}${from}_${to}`;

  // 1. Check local storage cache
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < FX_TTL_MS && typeof parsed.rate === 'number') {
        return { rate: parsed.rate, isLive: false, date: parsed.date };
      }
    }
  } catch {
    // continue
  }

  // 2. Fetch live via local backend API first (100% self-hosted & resilient)
  try {
    const res = await fetch(`/api/currency/rates?base=${from}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates && typeof data.rates[to] === 'number') {
        const rate = data.rates[to];
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ rate, timestamp: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
          );
        } catch {
          // ignore
        }
        return { rate, isLive: true, date: 'Live' };
      }
    }
  } catch {
    // try direct frankfurter fallback
  }

  // 3. Fallback to direct Frankfurter API
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.rates && typeof data.rates[to] === 'number') {
        const rate = data.rates[to];
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ rate, timestamp: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
          );
        } catch {
          // ignore
        }
        return { rate, isLive: true, date: 'Live' };
      }
    }
  } catch {
    // fallback
  }

  // 4. Stored expired cache fallback
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.rate === 'number') {
        return { rate: parsed.rate, isLive: false, date: 'Cached' };
      }
    }
  } catch {
    // continue
  }

  const fromBase = BASELINE_EUR_RATES[from] || 1.0;
  const toBase = BASELINE_EUR_RATES[to] || 1.0;
  return { rate: toBase / fromBase, isLive: false, date: 'Baseline' };
}

export const BASELINE_EUR_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  JPY: 162.5,
  CAD: 1.48,
  CHF: 0.97,
  AUD: 1.64,
  CNY: 7.82,
  INR: 90.5,
  BRL: 5.92,
  MXN: 21.6,
  SEK: 11.4,
  NOK: 11.6,
  DKK: 7.46,
  NZD: 1.78,
  SGD: 1.45,
  KRW: 1480.0,
  PLN: 4.30,
  TRY: 37.5,
  THB: 39.2,
  AED: 4.00,
  CZK: 25.2,
  HUF: 395.0,
};

let _cachedEurRates: Record<string, number> | null = null;
let _cachedEurRatesTimestamp = 0;

export async function fetchEurRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (_cachedEurRates && now - _cachedEurRatesTimestamp < FX_TTL_MS) {
    return _cachedEurRates;
  }

  // 1. Check local storage
  const cacheKey = `${FX_CACHE_PREFIX}ALL_EUR`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (now - parsed.timestamp < FX_TTL_MS && parsed.rates) {
        _cachedEurRates = parsed.rates;
        _cachedEurRatesTimestamp = parsed.timestamp;
        return parsed.rates;
      }
    }
  } catch {
    // continue
  }

  // 2. Try backend API
  try {
    const res = await fetch('/api/currency/rates?base=EUR', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const rates = { ...BASELINE_EUR_RATES, ...data.rates, EUR: 1.0 };
        _cachedEurRates = rates;
        _cachedEurRatesTimestamp = now;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ rates, timestamp: now }));
        } catch {}
        return rates;
      }
    }
  } catch {}

  // 3. Fallback to Frankfurter
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const rates = { ...BASELINE_EUR_RATES, ...data.rates, EUR: 1.0 };
        _cachedEurRates = rates;
        _cachedEurRatesTimestamp = now;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ rates, timestamp: now }));
        } catch {}
        return rates;
      }
    }
  } catch {}

  _cachedEurRates = BASELINE_EUR_RATES;
  _cachedEurRatesTimestamp = now;
  return BASELINE_EUR_RATES;
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> = BASELINE_EUR_RATES
): number {
  if (isNaN(amount) || amount === 0) return 0;
  const from = (fromCurrency || 'EUR').toUpperCase().trim();
  const to = (toCurrency || 'EUR').toUpperCase().trim();
  if (from === to) return amount;

  const fromRate = rates[from] || BASELINE_EUR_RATES[from] || 1.0;
  const toRate = rates[to] || BASELINE_EUR_RATES[to] || 1.0;

  // Amount in EUR
  const eurAmount = from === 'EUR' ? amount : amount / fromRate;
  // EUR to target
  return to === 'EUR' ? eurAmount : eurAmount * toRate;
}

export function formatCurrencyAmount(amount: number, currency: string = 'EUR'): string {
  const cur = (currency || 'EUR').toUpperCase().trim();
  const info = getCurrencyInfo(cur);
  const formattedNumber = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${info.symbol}${formattedNumber}`;
}
