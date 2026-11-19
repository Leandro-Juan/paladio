/**
 * Lightweight client-side language detection for deciding whether a POI
 * description is already in the user's active UI locale.
 */

const STOPWORDS: Record<string, Set<string>> = {
  en: new Set([
    'the', 'and', 'is', 'in', 'of', 'to', 'a', 'an', 'for', 'with',
    'located', 'known', 'from', 'by', 'on', 'that', 'this', 'it', 'its',
    'are', 'was', 'as', 'or', 'which', 'over', 'above', 'museum', 'building',
    'centre', 'center', 'notable', 'provides', 'serves', 'stay',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'es',
    'son', 'con', 'por', 'para', 'que', 'su', 'sus', 'al', 'se', 'ubicado',
    'situado', 'conocido', 'como', 'entre', 'sobre', 'museo', 'edificio',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'sont',
    'dans', 'pour', 'avec', 'sur', 'par', 'qui', 'que', 'au', 'aux', 'situé',
    'située', 'connu', 'célèbre', 'musée', 'bâtiment',
  ]),
  de: new Set([
    'der', 'die', 'das', 'ein', 'eine', 'und', 'ist', 'sind', 'in', 'im',
    'von', 'zu', 'mit', 'für', 'auf', 'des', 'dem', 'den', 'als', 'befindet',
    'liegt', 'bekannt', 'über', 'durch', 'sich',
  ]),
  it: new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'di', 'del', 'della',
    'delle', 'dei', 'e', 'è', 'sono', 'in', 'con', 'per', 'su', 'che', 'al',
    'alla', 'nel', 'nella', 'situato', 'noto', 'museo',
  ]),
  pt: new Set([
    'o', 'os', 'a', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em',
    'no', 'na', 'e', 'é', 'são', 'com', 'por', 'para', 'que', 'ao', 'à',
    'localizado', 'situado', 'conhecido', 'como', 'entre',
  ]),
};

export function baseLangCode(lang?: string | null): string {
  if (!lang) return 'en';
  return lang.trim().toLowerCase().split(/[-_]/)[0] || 'en';
}

export function detectTextLanguage(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();
  if (cleaned.length < 8) return null;

  let kana = 0;
  let han = 0;
  let hangul = 0;
  let arabic = 0;
  let thai = 0;
  let cyrillic = 0;
  let latin = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) {
      kana++;
    } else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) {
      han++;
    } else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) {
      hangul++;
    } else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) {
      arabic++;
    } else if (code >= 0x0e00 && code <= 0x0e7f) {
      thai++;
    } else if (code >= 0x0400 && code <= 0x04ff) {
      cyrillic++;
    } else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 0x00c0 && code <= 0x024f)) {
      latin++;
    }
  }

  const totalAlpha = kana + han + hangul + arabic + thai + cyrillic + latin;
  if (totalAlpha < 6) return null;

  if ((kana + han) / totalAlpha >= 0.35) return kana > 0 ? 'ja' : 'zh';
  if (hangul / totalAlpha >= 0.35) return 'ko';
  if (arabic / totalAlpha >= 0.35) return 'ar';
  if (thai / totalAlpha >= 0.35) return 'th';
  if (cyrillic / totalAlpha >= 0.35) return 'ru';
  if (latin / totalAlpha < 0.5) return null;

  const tokens = cleaned.toLowerCase().match(/[a-z\u00c0-\u00ff]+/g) ?? [];
  if (tokens.length < 4) return null;

  const scores: Record<string, number> = { en: 0, es: 0, fr: 0, de: 0, it: 0, pt: 0 };
  for (const tok of tokens) {
    for (const [lang, set] of Object.entries(STOPWORDS)) {
      if (set.has(tok)) scores[lang] += 1;
    }
  }

  if (/[ñÑ¿¡]/.test(cleaned)) scores.es += 2.5;
  if (/[ßäöüÄÖÜ]/.test(cleaned)) scores.de += 2.5;
  if (/[ãõÃÕ]/.test(cleaned)) scores.pt += 2.5;
  if (cleaned.toLowerCase().includes('œ')) scores.fr += 2.5;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = ranked[0];
  const secondScore = ranked[1][1];

  if (topScore < 2.0 || topScore - secondScore < 1.0) return null;
  return topLang;
}

/**
 * Returns true only when we are confident the description is already in the user's locale.
 */
export function isDescriptionInLocale(
  text: string | null | undefined,
  userLocale: string,
  explicitLang?: string | null
): boolean {
  const targetBase = baseLangCode(userLocale);
  if (explicitLang) {
    return baseLangCode(explicitLang) === targetBase;
  }
  const detected = detectTextLanguage(text);
  if (!detected) return false;
  return baseLangCode(detected) === targetBase;
}
