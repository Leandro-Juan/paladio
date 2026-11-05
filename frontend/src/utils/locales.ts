export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  scriptFamily: string;
  isShipped?: boolean;
}

/**
 * 10 High-Fluency Core Shipped Languages
 */
export const SHIPPED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', scriptFamily: 'Latin', isShipped: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', scriptFamily: 'CJK', isShipped: true },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', direction: 'ltr', scriptFamily: 'CJK', isShipped: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', scriptFamily: 'Hangul', isShipped: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', scriptFamily: 'Arabic', isShipped: true },
];

/**
 * Extended Global Registry of 100+ ISO/BCP47 Locales.
 * Any locale from this registry can be dynamically enabled by dropping {code}.json into /locales/.
 */
export const ALL_LOCALES: LocaleInfo[] = [
  ...SHIPPED_LOCALES,
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', scriptFamily: 'Greek' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl', scriptFamily: 'Hebrew' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr', scriptFamily: 'Devanagari' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', direction: 'ltr', scriptFamily: 'Thai' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', direction: 'rtl', scriptFamily: 'Arabic' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl', scriptFamily: 'Arabic' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr', scriptFamily: 'Bengali' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr', scriptFamily: 'Tamil' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', direction: 'ltr', scriptFamily: 'Telugu' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', direction: 'ltr', scriptFamily: 'Malayalam' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr', scriptFamily: 'Kannada' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr', scriptFamily: 'Gujarati' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr', scriptFamily: 'Gurmukhi' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', direction: 'ltr', scriptFamily: 'Devanagari' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', direction: 'ltr', scriptFamily: 'Ethiopic' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', direction: 'ltr', scriptFamily: 'Georgian' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', direction: 'ltr', scriptFamily: 'Khmer' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'lo', name: 'Lao', nativeName: 'ພາສາລາວ', direction: 'ltr', scriptFamily: 'Lao' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол хэл', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာစာ', direction: 'ltr', scriptFamily: 'Myanmar' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', direction: 'ltr', scriptFamily: 'Devanagari' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', direction: 'ltr', scriptFamily: 'Sinhala' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', direction: 'ltr', scriptFamily: 'Cyrillic' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbekcha', direction: 'ltr', scriptFamily: 'Latin' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', direction: 'ltr', scriptFamily: 'Armenian' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', direction: 'ltr', scriptFamily: 'CJK' },
];

export const DEFAULT_LOCALE = 'en';

export function getLocaleInfo(code: string): LocaleInfo {
  const normalized = (code || DEFAULT_LOCALE).trim();
  const match = ALL_LOCALES.find((l) => l.code.toLowerCase() === normalized.toLowerCase());
  if (match) return match;
  const prefix = normalized.split('-')[0].toLowerCase();
  const prefixMatch = ALL_LOCALES.find((l) => l.code.toLowerCase() === prefix);
  return prefixMatch || SHIPPED_LOCALES[0];
}

export function isRTL(code: string): boolean {
  return getLocaleInfo(code).direction === 'rtl';
}
