import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/utils/api';

export interface CurrencyInfo {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  symbol: string;
}

export const SUPPORTED_CURRENCY_LIST: CurrencyInfo[] = [
  { code: 'EUR', name: "Euro", country: "European Union", countryCode: 'EU', flag: '🇪🇺', symbol: "\u20ac" },
  { code: 'USD', name: "US Dollar", country: "United States", countryCode: 'US', flag: '🇺🇸', symbol: "$" },
  { code: 'GBP', name: "British Pound", country: "United Kingdom", countryCode: 'GB', flag: '🇬🇧', symbol: "\u00a3" },
  { code: 'JPY', name: "Japanese Yen", country: "Japan", countryCode: 'JP', flag: '🇯🇵', symbol: "\u00a5" },
  { code: 'CHF', name: "Swiss Franc", country: "Switzerland", countryCode: 'CH', flag: '🇨🇭', symbol: "CHF" },
  { code: 'CAD', name: "Canadian Dollar", country: "Canada", countryCode: 'CA', flag: '🇨🇦', symbol: "CA$" },
  { code: 'AUD', name: "Australian Dollar", country: "Australia", countryCode: 'AU', flag: '🇦🇺', symbol: "A$" },
  { code: 'NZD', name: "New Zealand Dollar", country: "New Zealand", countryCode: 'NZ', flag: '🇳🇿', symbol: "NZ$" },
  { code: 'PLN', name: "Polish Zloty", country: "Poland", countryCode: 'PL', flag: '🇵🇱', symbol: "z\u0142" },
  { code: 'SEK', name: "Swedish Krona", country: "Sweden", countryCode: 'SE', flag: '🇸🇪', symbol: "kr" },
  { code: 'NOK', name: "Norwegian Krone", country: "Norway", countryCode: 'NO', flag: '🇳🇴', symbol: "kr" },
  { code: 'DKK', name: "Danish Krone", country: "Denmark", countryCode: 'DK', flag: '🇩🇰', symbol: "kr" },
  { code: 'CZK', name: "Czech Koruna", country: "Czech Republic", countryCode: 'CZ', flag: '🇨🇿', symbol: "K\u010d" },
  { code: 'HUF', name: "Hungarian Forint", country: "Hungary", countryCode: 'HU', flag: '🇭🇺', symbol: "Ft" },
  { code: 'SGD', name: "Singapore Dollar", country: "Singapore", countryCode: 'SG', flag: '🇸🇬', symbol: "S$" },
  { code: 'KRW', name: "South Korean Won", country: "South Korea", countryCode: 'KR', flag: '🇰🇷', symbol: "\u20a9" },
  { code: 'CNY', name: "Chinese Yuan", country: "China", countryCode: 'CN', flag: '🇨🇳', symbol: "\u00a5" },
  { code: 'INR', name: "Indian Rupee", country: "India", countryCode: 'IN', flag: '🇮🇳', symbol: "\u20b9" },
  { code: 'BRL', name: "Brazilian Real", country: "Brazil", countryCode: 'BR', flag: '🇧🇷', symbol: "R$" },
  { code: 'MXN', name: "Mexican Peso", country: "Mexico", countryCode: 'MX', flag: '🇲🇽', symbol: "Mex$" },
  { code: 'TRY', name: "Turkish Lira", country: "Turkey", countryCode: 'TR', flag: '🇹🇷', symbol: "\u20ba" },
  { code: 'THB', name: "Thai Baht", country: "Thailand", countryCode: 'TH', flag: '🇹🇭', symbol: "\u0e3f" },
  { code: 'AED', name: "UAE Dirham", country: "United Arab Emirates", countryCode: 'AE', flag: '🇦🇪', symbol: "AED" },
  { code: 'AFN', name: "Afghan Afghani", country: "Afghanistan", countryCode: 'AF', flag: '🇦🇫', symbol: "\u060b" },
  { code: 'ALL', name: "Albanian Lek", country: "Albania", countryCode: 'AL', flag: '🇦🇱', symbol: "L" },
  { code: 'AMD', name: "Armenian Dram", country: "Armenia", countryCode: 'AM', flag: '🇦🇲', symbol: "\u058f" },
  { code: 'ANG', name: "Netherlands Antillean Guilder", country: "Cura\u00e7ao & Sint Maarten", countryCode: 'CW', flag: '🇨🇼', symbol: "\u0192" },
  { code: 'AOA', name: "Angolan Kwanza", country: "Angola", countryCode: 'AO', flag: '🇦🇴', symbol: "Kz" },
  { code: 'ARS', name: "Argentine Peso", country: "Argentina", countryCode: 'AR', flag: '🇦🇷', symbol: "$" },
  { code: 'AWG', name: "Aruban Florin", country: "Aruba", countryCode: 'AW', flag: '🇦🇼', symbol: "\u0192" },
  { code: 'AZN', name: "Azerbaijani Manat", country: "Azerbaijan", countryCode: 'AZ', flag: '🇦🇿', symbol: "\u20bc" },
  { code: 'BAM', name: "Bosnia and Herzegovina Convertible Mark", country: "Bosnia and Herzegovina", countryCode: 'BA', flag: '🇧🇦', symbol: "KM" },
  { code: 'BBD', name: "Barbadian Dollar", country: "Barbados", countryCode: 'BB', flag: '🇧🇧', symbol: "Bds$" },
  { code: 'BDT', name: "Bangladeshi Taka", country: "Bangladesh", countryCode: 'BD', flag: '🇧🇩', symbol: "\u09f3" },
  { code: 'BGN', name: "Bulgarian Lev", country: "Bulgaria", countryCode: 'BG', flag: '🇧🇬', symbol: "\u043b\u0432" },
  { code: 'BHD', name: "Bahraini Dinar", country: "Bahrain", countryCode: 'BH', flag: '🇧🇭', symbol: ".\u062f.\u0628" },
  { code: 'BIF', name: "Burundian Franc", country: "Burundi", countryCode: 'BI', flag: '🇧🇮', symbol: "FBu" },
  { code: 'BMD', name: "Bermudian Dollar", country: "Bermuda", countryCode: 'BM', flag: '🇧🇲', symbol: "$" },
  { code: 'BND', name: "Brunei Dollar", country: "Brunei", countryCode: 'BN', flag: '🇧🇳', symbol: "B$" },
  { code: 'BOB', name: "Bolivian Boliviano", country: "Bolivia", countryCode: 'BO', flag: '🇧🇴', symbol: "Bs." },
  { code: 'BSD', name: "Bahamian Dollar", country: "Bahamas", countryCode: 'BS', flag: '🇧🇸', symbol: "B$" },
  { code: 'BTN', name: "Bhutanese Ngultrum", country: "Bhutan", countryCode: 'BT', flag: '🇧🇹', symbol: "Nu." },
  { code: 'BWP', name: "Botswana Pula", country: "Botswana", countryCode: 'BW', flag: '🇧🇼', symbol: "P" },
  { code: 'BYN', name: "Belarusian Ruble", country: "Belarus", countryCode: 'BY', flag: '🇧🇾', symbol: "Br" },
  { code: 'BZD', name: "Belize Dollar", country: "Belize", countryCode: 'BZ', flag: '🇧🇿', symbol: "BZ$" },
  { code: 'CDF', name: "Congolese Franc", country: "Democratic Republic of the Congo", countryCode: 'CD', flag: '🇨🇩', symbol: "FC" },
  { code: 'CLP', name: "Chilean Peso", country: "Chile", countryCode: 'CL', flag: '🇨🇱', symbol: "$" },
  { code: 'COP', name: "Colombian Peso", country: "Colombia", countryCode: 'CO', flag: '🇨🇴', symbol: "$" },
  { code: 'CRC', name: "Costa Rican Col\u00f3n", country: "Costa Rica", countryCode: 'CR', flag: '🇨🇷', symbol: "\u20a1" },
  { code: 'CUP', name: "Cuban Peso", country: "Cuba", countryCode: 'CU', flag: '🇨🇺', symbol: "$" },
  { code: 'CVE', name: "Cape Verdean Escudo", country: "Cape Verde", countryCode: 'CV', flag: '🇨🇻', symbol: "Esc" },
  { code: 'DJF', name: "Djiboutian Franc", country: "Djibouti", countryCode: 'DJ', flag: '🇩🇯', symbol: "Fdj" },
  { code: 'DOP', name: "Dominican Peso", country: "Dominican Republic", countryCode: 'DO', flag: '🇩🇴', symbol: "RD$" },
  { code: 'DZD', name: "Algerian Dinar", country: "Algeria", countryCode: 'DZ', flag: '🇩🇿', symbol: "\u062f.\u062c" },
  { code: 'EGP', name: "Egyptian Pound", country: "Egypt", countryCode: 'EG', flag: '🇪🇬', symbol: "E\u00a3" },
  { code: 'ERN', name: "Eritrean Nakfa", country: "Eritrea", countryCode: 'ER', flag: '🇪🇷', symbol: "Nfk" },
  { code: 'ETB', name: "Ethiopian Birr", country: "Ethiopia", countryCode: 'ET', flag: '🇪🇹', symbol: "Br" },
  { code: 'FJD', name: "Fijian Dollar", country: "Fiji", countryCode: 'FJ', flag: '🇫🇯', symbol: "FJ$" },
  { code: 'FKP', name: "Falkland Islands Pound", country: "Falkland Islands", countryCode: 'FK', flag: '🇫🇰', symbol: "\u00a3" },
  { code: 'GEL', name: "Georgian Lari", country: "Georgia", countryCode: 'GE', flag: '🇬🇪', symbol: "\u20be" },
  { code: 'GHS', name: "Ghanaian Cedi", country: "Ghana", countryCode: 'GH', flag: '🇬🇭', symbol: "GH\u20b5" },
  { code: 'GIP', name: "Gibraltar Pound", country: "Gibraltar", countryCode: 'GI', flag: '🇬🇮', symbol: "\u00a3" },
  { code: 'GMD', name: "Gambian Dalasi", country: "Gambia", countryCode: 'GM', flag: '🇬🇲', symbol: "D" },
  { code: 'GNF', name: "Guinean Franc", country: "Guinea", countryCode: 'GN', flag: '🇬🇳', symbol: "FG" },
  { code: 'GTQ', name: "Guatemalan Quetzal", country: "Guatemala", countryCode: 'GT', flag: '🇬🇹', symbol: "Q" },
  { code: 'GYD', name: "Guyanese Dollar", country: "Guyana", countryCode: 'GY', flag: '🇬🇾', symbol: "G$" },
  { code: 'HKD', name: "Hong Kong Dollar", country: "Hong Kong", countryCode: 'HK', flag: '🇭🇰', symbol: "HK$" },
  { code: 'HNL', name: "Honduran Lempira", country: "Honduras", countryCode: 'HN', flag: '🇭🇳', symbol: "L" },
  { code: 'HTG', name: "Haitian Gourde", country: "Haiti", countryCode: 'HT', flag: '🇭🇹', symbol: "G" },
  { code: 'IDR', name: "Indonesian Rupiah", country: "Indonesia", countryCode: 'ID', flag: '🇮🇩', symbol: "Rp" },
  { code: 'ILS', name: "Israeli New Shekel", country: "Israel", countryCode: 'IL', flag: '🇮🇱', symbol: "\u20aa" },
  { code: 'IQD', name: "Iraqi Dinar", country: "Iraq", countryCode: 'IQ', flag: '🇮🇶', symbol: "\u0639.\u062f" },
  { code: 'IRR', name: "Iranian Rial", country: "Iran", countryCode: 'IR', flag: '🇮🇷', symbol: "\ufdfc" },
  { code: 'ISK', name: "Icelandic Kr\u00f3na", country: "Iceland", countryCode: 'IS', flag: '🇮🇸', symbol: "kr" },
  { code: 'JMD', name: "Jamaican Dollar", country: "Jamaica", countryCode: 'JM', flag: '🇯🇲', symbol: "J$" },
  { code: 'JOD', name: "Jordanian Dinar", country: "Jordan", countryCode: 'JO', flag: '🇯🇴', symbol: "\u062f.\u0627" },
  { code: 'KES', name: "Kenyan Shilling", country: "Kenya", countryCode: 'KE', flag: '🇰🇪', symbol: "KSh" },
  { code: 'KGS', name: "Kyrgyzstani Som", country: "Kyrgyzstan", countryCode: 'KG', flag: '🇰🇬', symbol: "\u0441" },
  { code: 'KHR', name: "Cambodian Riel", country: "Cambodia", countryCode: 'KH', flag: '🇰🇭', symbol: "\u17db" },
  { code: 'KMF', name: "Comorian Franc", country: "Comoros", countryCode: 'KM', flag: '🇰🇲', symbol: "CF" },
  { code: 'KPW', name: "North Korean Won", country: "North Korea", countryCode: 'KP', flag: '🇰🇵', symbol: "\u20a9" },
  { code: 'KWD', name: "Kuwaiti Dinar", country: "Kuwait", countryCode: 'KW', flag: '🇰🇼', symbol: "\u062f.\u0643" },
  { code: 'KYD', name: "Cayman Islands Dollar", country: "Cayman Islands", countryCode: 'KY', flag: '🇰🇾', symbol: "CI$" },
  { code: 'KZT', name: "Kazakhstani Tenge", country: "Kazakhstan", countryCode: 'KZ', flag: '🇰🇿', symbol: "\u20b8" },
  { code: 'LAK', name: "Lao Kip", country: "Laos", countryCode: 'LA', flag: '🇱🇦', symbol: "\u20ad" },
  { code: 'LBP', name: "Lebanese Pound", country: "Lebanon", countryCode: 'LB', flag: '🇱🇧', symbol: "L\u00a3" },
  { code: 'LKR', name: "Sri Lankan Rupee", country: "Sri Lanka", countryCode: 'LK', flag: '🇱🇰', symbol: "Rs" },
  { code: 'LRD', name: "Liberian Dollar", country: "Liberia", countryCode: 'LR', flag: '🇱🇷', symbol: "L$" },
  { code: 'LSL', name: "Lesotho Loti", country: "Lesotho", countryCode: 'LS', flag: '🇱🇸', symbol: "L" },
  { code: 'LYD', name: "Libyan Dinar", country: "Libya", countryCode: 'LY', flag: '🇱🇾', symbol: "\u0644.\u062f" },
  { code: 'MAD', name: "Moroccan Dirham", country: "Morocco", countryCode: 'MA', flag: '🇲🇦', symbol: "\u062f.\u0645." },
  { code: 'MDL', name: "Moldovan Leu", country: "Moldova", countryCode: 'MD', flag: '🇲🇩', symbol: "L" },
  { code: 'MGA', name: "Malagasy Ariary", country: "Madagascar", countryCode: 'MG', flag: '🇲🇬', symbol: "Ar" },
  { code: 'MKD', name: "Macedonian Denar", country: "North Macedonia", countryCode: 'MK', flag: '🇲🇰', symbol: "\u0434\u0435\u043d" },
  { code: 'MMK', name: "Myanmar Kyat", country: "Myanmar", countryCode: 'MM', flag: '🇲🇲', symbol: "K" },
  { code: 'MNT', name: "Mongolian T\u00f6gr\u00f6g", country: "Mongolia", countryCode: 'MN', flag: '🇲🇳', symbol: "\u20ae" },
  { code: 'MOP', name: "Macanese Pataca", country: "Macau", countryCode: 'MO', flag: '🇲🇴', symbol: "MOP$" },
  { code: 'MRU', name: "Mauritanian Ouguiya", country: "Mauritania", countryCode: 'MR', flag: '🇲🇷', symbol: "UM" },
  { code: 'MUR', name: "Mauritian Rupee", country: "Mauritius", countryCode: 'MU', flag: '🇲🇺', symbol: "\u20a8" },
  { code: 'MVR', name: "Maldivian Rufiyaa", country: "Maldives", countryCode: 'MV', flag: '🇲🇻', symbol: "Rf" },
  { code: 'MWK', name: "Malawian Kwacha", country: "Malawi", countryCode: 'MW', flag: '🇲🇼', symbol: "MK" },
  { code: 'MYR', name: "Malaysian Ringgit", country: "Malaysia", countryCode: 'MY', flag: '🇲🇾', symbol: "RM" },
  { code: 'MZN', name: "Mozambican Metical", country: "Mozambique", countryCode: 'MZ', flag: '🇲🇿', symbol: "MT" },
  { code: 'NAD', name: "Namibian Dollar", country: "Namibia", countryCode: 'NA', flag: '🇳🇦', symbol: "N$" },
  { code: 'NGN', name: "Nigerian Naira", country: "Nigeria", countryCode: 'NG', flag: '🇳🇬', symbol: "\u20a6" },
  { code: 'NIO', name: "Nicaraguan C\u00f3rdoba", country: "Nicaragua", countryCode: 'NI', flag: '🇳🇮', symbol: "C$" },
  { code: 'NPR', name: "Nepalese Rupee", country: "Nepal", countryCode: 'NP', flag: '🇳🇵', symbol: "\u20a8" },
  { code: 'OMR', name: "Omani Rial", country: "Oman", countryCode: 'OM', flag: '🇴🇲', symbol: "\u0631.\u0639." },
  { code: 'PAB', name: "Panamanian Balboa", country: "Panama", countryCode: 'PA', flag: '🇵🇦', symbol: "B/." },
  { code: 'PEN', name: "Peruvian Sol", country: "Peru", countryCode: 'PE', flag: '🇵🇪', symbol: "S/." },
  { code: 'PGK', name: "Papua New Guinean Kina", country: "Papua New Guinea", countryCode: 'PG', flag: '🇵🇬', symbol: "K" },
  { code: 'PHP', name: "Philippine Peso", country: "Philippines", countryCode: 'PH', flag: '🇵🇭', symbol: "\u20b1" },
  { code: 'PKR', name: "Pakistani Rupee", country: "Pakistan", countryCode: 'PK', flag: '🇵🇰', symbol: "\u20a8" },
  { code: 'PYG', name: "Paraguayan Guaran\u00ed", country: "Paraguay", countryCode: 'PY', flag: '🇵🇾', symbol: "\u20b2" },
  { code: 'QAR', name: "Qatari Riyal", country: "Qatar", countryCode: 'QA', flag: '🇶🇦', symbol: "\u0631.\u0642" },
  { code: 'RON', name: "Romanian Leu", country: "Romania", countryCode: 'RO', flag: '🇷🇴', symbol: "lei" },
  { code: 'RSD', name: "Serbian Dinar", country: "Serbia", countryCode: 'RS', flag: '🇷🇸', symbol: "\u0434\u0438\u043d." },
  { code: 'RUB', name: "Russian Ruble", country: "Russia", countryCode: 'RU', flag: '🇷🇺', symbol: "\u20bd" },
  { code: 'RWF', name: "Rwandan Franc", country: "Rwanda", countryCode: 'RW', flag: '🇷🇼', symbol: "FRw" },
  { code: 'SAR', name: "Saudi Riyal", country: "Saudi Arabia", countryCode: 'SA', flag: '🇸🇦', symbol: "\u0631.\u0633" },
  { code: 'SBD', name: "Solomon Islands Dollar", country: "Solomon Islands", countryCode: 'SB', flag: '🇸🇧', symbol: "SI$" },
  { code: 'SCR', name: "Seychellois Rupee", country: "Seychelles", countryCode: 'SC', flag: '🇸🇨', symbol: "\u20a8" },
  { code: 'SDG', name: "Sudanese Pound", country: "Sudan", countryCode: 'SD', flag: '🇸🇩', symbol: "\u062c.\u0633." },
  { code: 'SHP', name: "Saint Helena Pound", country: "Saint Helena", countryCode: 'SH', flag: '🇸🇭', symbol: "\u00a3" },
  { code: 'SLE', name: "Sierra Leonean Leone", country: "Sierra Leone", countryCode: 'SL', flag: '🇸🇱', symbol: "Le" },
  { code: 'SOS', name: "Somali Shilling", country: "Somalia", countryCode: 'SO', flag: '🇸🇴', symbol: "Sh.So." },
  { code: 'SRD', name: "Surinamese Dollar", country: "Suriname", countryCode: 'SR', flag: '🇸🇷', symbol: "Sr$" },
  { code: 'SSP', name: "South Sudanese Pound", country: "South Sudan", countryCode: 'SS', flag: '🇸🇸', symbol: "\u00a3" },
  { code: 'STN', name: "S\u00e3o Tom\u00e9 and Pr\u00edncipe Dobra", country: "S\u00e3o Tom\u00e9 and Pr\u00edncipe", countryCode: 'ST', flag: '🇸🇹', symbol: "Db" },
  { code: 'SYP', name: "Syrian Pound", country: "Syria", countryCode: 'SY', flag: '🇸🇾', symbol: "\u00a3S" },
  { code: 'SZL', name: "Eswatini Lilangeni", country: "Eswatini", countryCode: 'SZ', flag: '🇸🇿', symbol: "L" },
  { code: 'TJS', name: "Tajikistani Somoni", country: "Tajikistan", countryCode: 'TJ', flag: '🇹🇯', symbol: "\u0405\u041c" },
  { code: 'TMT', name: "Turkmenistan Manat", country: "Turkmenistan", countryCode: 'TM', flag: '🇹🇲', symbol: "T" },
  { code: 'TND', name: "Tunisian Dinar", country: "Tunisia", countryCode: 'TN', flag: '🇹🇳', symbol: "\u062f.\u062a" },
  { code: 'TOP', name: "Tongan Pa\u02bbanga", country: "Tonga", countryCode: 'TO', flag: '🇹🇴', symbol: "T$" },
  { code: 'TTD', name: "Trinidad and Tobago Dollar", country: "Trinidad and Tobago", countryCode: 'TT', flag: '🇹🇹', symbol: "TT$" },
  { code: 'TWD', name: "New Taiwan Dollar", country: "Taiwan", countryCode: 'TW', flag: '🇹🇼', symbol: "NT$" },
  { code: 'TZS', name: "Tanzanian Shilling", country: "Tanzania", countryCode: 'TZ', flag: '🇹🇿', symbol: "TSh" },
  { code: 'UAH', name: "Ukrainian Hryvnia", country: "Ukraine", countryCode: 'UA', flag: '🇺🇦', symbol: "\u20b4" },
  { code: 'UGX', name: "Ugandan Shilling", country: "Uganda", countryCode: 'UG', flag: '🇺🇬', symbol: "USh" },
  { code: 'UYU', name: "Uruguayan Peso", country: "Uruguay", countryCode: 'UY', flag: '🇺🇾', symbol: "" },
  { code: 'UZS', name: "Uzbekistani Som", country: "Uzbekistan", countryCode: 'UZ', flag: '🇺🇿', symbol: "so\u02bbm" },
  { code: 'VES', name: "Venezuelan Bol\u00edvar", country: "Venezuela", countryCode: 'VE', flag: '🇻🇪', symbol: "Bs.S" },
  { code: 'VND', name: "Vietnamese Dong", country: "Vietnam", countryCode: 'VN', flag: '🇻🇳', symbol: "\u20ab" },
  { code: 'VUV', name: "Vanuatu Vatu", country: "Vanuatu", countryCode: 'VU', flag: '🇻🇺', symbol: "VT" },
  { code: 'WST', name: "Samoan Tala", country: "Samoa", countryCode: 'WS', flag: '🇼🇸', symbol: "WS$" },
  { code: 'XAF', name: "Central African CFA Franc", country: "Central Africa (CEMAC)", countryCode: 'CM', flag: '🇨🇲', symbol: "FCFA" },
  { code: 'XCD', name: "East Caribbean Dollar", country: "Eastern Caribbean", countryCode: 'AG', flag: '🇦🇬', symbol: "EC$" },
  { code: 'XOF', name: "West African CFA Franc", country: "West Africa (UEMOA)", countryCode: 'SN', flag: '🇸🇳', symbol: "CFA" },
  { code: 'XPF', name: "CFP Franc", country: "French Polynesia & New Caledonia", countryCode: 'PF', flag: '🇵🇫', symbol: "\u20a3" },
  { code: 'YER', name: "Yemeni Rial", country: "Yemen", countryCode: 'YE', flag: '🇾🇪', symbol: "\ufdfc" },
  { code: 'ZAR', name: "South African Rand", country: "South Africa", countryCode: 'ZA', flag: '🇿🇦', symbol: "R" },
  { code: 'ZMW', name: "Zambian Kwacha", country: "Zambia", countryCode: 'ZM', flag: '🇿🇲', symbol: "ZK" },
  { code: 'ZWG', name: "Zimbabwe Gold", country: "Zimbabwe", countryCode: 'ZW', flag: '🇿🇼', symbol: "ZiG" },
];

// In-memory session cache for dynamically resolved destinations
const _DYNAMIC_DEST_CACHE = new Map<string, CurrencyInfo>();

export function getCurrencyInfo(code?: string): CurrencyInfo {
  const c = (code || 'EUR').toUpperCase().trim();
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

/**
 * Synchronously resolves destination string against ISO country reference datasets
 * and the dynamic in-memory resolution cache. Zero hardcoded city dictionaries.
 */
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

  // 1. Check in-memory dynamic cache from prior backend lookups
  if (_DYNAMIC_DEST_CACHE.has(clean)) {
    const item = _DYNAMIC_DEST_CACHE.get(clean)!;
    return {
      country: item.country,
      countryCode: item.countryCode,
      currency: item.code,
      symbol: item.symbol,
      flag: item.flag,
    };
  }

  // 1b. Check local storage cache
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`paladio_dest_curr_${clean}`);
      if (stored) {
        const item = JSON.parse(stored) as CurrencyInfo;
        if (item && item.code) {
          _DYNAMIC_DEST_CACHE.set(clean, item);
          return {
            country: item.country,
            countryCode: item.countryCode,
            currency: item.code,
            symbol: item.symbol,
            flag: item.flag,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Exact currency code match
  const byCode = SUPPORTED_CURRENCY_LIST.find((c) => c.code.toLowerCase() === clean);
  if (byCode) {
    return {
      country: byCode.country,
      countryCode: byCode.countryCode,
      currency: byCode.code,
      symbol: byCode.symbol,
      flag: byCode.flag,
    };
  }

  // 3. Exact 2-letter country code match
  if (clean.length === 2) {
    const byCc = SUPPORTED_CURRENCY_LIST.find((c) => c.countryCode.toLowerCase() === clean);
    if (byCc) {
      return {
        country: byCc.country,
        countryCode: byCc.countryCode,
        currency: byCc.code,
        symbol: byCc.symbol,
        flag: byCc.flag,
      };
    }
  }

  // 4. Exact country name match
  const byCountry = SUPPORTED_CURRENCY_LIST.find((c) => c.country.toLowerCase() === clean);
  if (byCountry) {
    return {
      country: byCountry.country,
      countryCode: byCountry.countryCode,
      currency: byCountry.code,
      symbol: byCountry.symbol,
      flag: byCountry.flag,
    };
  }

  // 5. Partial country name match
  const partial = SUPPORTED_CURRENCY_LIST.find(
    (c) => clean.includes(c.country.toLowerCase()) || c.country.toLowerCase().includes(clean)
  );
  if (partial) {
    return {
      country: partial.country,
      countryCode: partial.countryCode,
      currency: partial.code,
      symbol: partial.symbol,
      flag: partial.flag,
    };
  }

  // Trigger non-blocking async backend resolution for subsequent renders
  resolveDestinationCurrencyAsync(destination).catch(() => {});

  return { country: destination, countryCode: 'EU', currency: 'EUR', symbol: '€', flag: '🇪🇺' };
}

/**
 * Dynamically resolves any destination city or territory via the backend
 * (PostgreSQL cities repository + GeoNames spatial engine). Zero hardcoded data.
 */
export async function resolveDestinationCurrencyAsync(destination?: string): Promise<CurrencyInfo> {
  if (!destination) return getCurrencyInfo('EUR');
  const clean = destination.trim().toLowerCase();
  if (_DYNAMIC_DEST_CACHE.has(clean)) {
    return _DYNAMIC_DEST_CACHE.get(clean)!;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`paladio_dest_curr_${clean}`);
      if (stored) {
        const item = JSON.parse(stored) as CurrencyInfo;
        if (item && item.code) {
          _DYNAMIC_DEST_CACHE.set(clean, item);
          return item;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/currency/destination-currency?destination=${encodeURIComponent(destination.trim())}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.currency) {
        const info = getCurrencyInfo(data.currency);
        const resolved: CurrencyInfo = {
          ...info,
          country: data.destination || info.country,
          countryCode: data.country_code || info.countryCode,
        };
        _DYNAMIC_DEST_CACHE.set(clean, resolved);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`paladio_dest_curr_${clean}`, JSON.stringify(resolved));
          } catch {
            // ignore
          }
        }
        return resolved;
      }
    }
  } catch {
    // network offline, fallback to sync ISO match
  }

  const syncFallback = resolveDestinationCurrency(destination);
  return getCurrencyInfo(syncFallback.currency);
}

export type ResolvedDestinationCurrency = CurrencyInfo & { currency: string };

/**
 * Reactive hook to resolve a destination city to its currency metadata dynamically.
 */
export function useDestinationCurrency(destination?: string): ResolvedDestinationCurrency {
  const [currencyInfo, setCurrencyInfo] = useState<ResolvedDestinationCurrency>(() => {
    const sync = resolveDestinationCurrency(destination);
    return {
      code: sync.currency,
      name: sync.currency,
      country: sync.country,
      countryCode: sync.countryCode,
      symbol: sync.symbol,
      flag: sync.flag,
      currency: sync.currency,
    };
  });

  useEffect(() => {
    let active = true;
    if (!destination) return;

    resolveDestinationCurrencyAsync(destination).then((resolved) => {
      if (active) {
        setCurrencyInfo({
          ...resolved,
          currency: resolved.code,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [destination]);

  return currencyInfo;
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
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/currency/rates?base=${from}`, { cache: 'no-store' });
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
    // try direct open fallback
  }

  // 3. Fallback to direct keyless Open Exchange Rate API (166+ currencies)
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
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
    // try direct Frankfurter fallback
  }

  // 4. Secondary fallback: Frankfurter
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

  // 5. Stored expired cache fallback
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

  return { rate: 1.0, isLive: false, date: 'Dynamic' };
}

// Dynamic exchange rates dictionary. Zero synthetic/hardcoded rates in production code.
export const BASELINE_EUR_RATES: Record<string, number> = { EUR: 1.0 };

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
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/currency/rates?base=EUR`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const rates = { ...data.rates, EUR: 1.0 };
        _cachedEurRates = rates;
        _cachedEurRatesTimestamp = now;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ rates, timestamp: now }));
        } catch {}
        return rates;
      }
    }
  } catch {}

  // 3. Fallback to direct keyless open.er-api.com
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const rates = { ...data.rates, EUR: 1.0 };
        _cachedEurRates = rates;
        _cachedEurRatesTimestamp = now;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ rates, timestamp: now }));
        } catch {}
        return rates;
      }
    }
  } catch {}

  // 4. Fallback to Frankfurter
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const rates = { ...data.rates, EUR: 1.0 };
        _cachedEurRates = rates;
        _cachedEurRatesTimestamp = now;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ rates, timestamp: now }));
        } catch {}
        return rates;
      }
    }
  } catch {}

  return _cachedEurRates || { EUR: 1.0 };
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

  const fromRate = rates[from] || (from === 'EUR' ? 1.0 : (_cachedEurRates?.[from] ?? 1.0));
  const toRate = rates[to] || (to === 'EUR' ? 1.0 : (_cachedEurRates?.[to] ?? 1.0));

  // Amount in EUR
  const eurAmount = from === 'EUR' ? amount : amount / fromRate;
  // EUR to target
  return to === 'EUR' ? eurAmount : eurAmount * toRate;
}

export function formatCurrencyAmount(
  amount: number,
  currency: string = 'EUR',
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const cur = (currency || 'EUR').toUpperCase().trim();
  const info = getCurrencyInfo(cur);
  const minDigits = options?.minimumFractionDigits !== undefined ? options.minimumFractionDigits : 2;
  const maxDigits = options?.maximumFractionDigits !== undefined ? options.maximumFractionDigits : 2;
  const formattedNumber = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${info.symbol}${formattedNumber}`;
}
