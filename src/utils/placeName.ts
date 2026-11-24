/* ════════════════════════════════════════════════════════════════
   PLACE NAMES — make geocoder labels read naturally in the UI language.
   The geocoder is asked in the UI language only: in Uzbekistan OSM's default
   `name` is already Uzbek (Latin) and `name:ru` / `name:en` usually exist, so
   uz gets "Kichik Halqa yo'li, Chilonzor Tumani", en "Small Ring Road,
   Chilanzar district", ru "Малая кольцевая дорога, Чиланзарский район" — all
   kept exactly as given.
   Last resort, for the rare place known only by a Cyrillic name: in the
   Latin-script UI languages (uz, en) it is transliterated and its street-type
   word translated and moved to where the language puts it:
     uz: "Восита Вахидова улица" → "Vosita Vaxidova koʻchasi"
     en: "Восита Вахидова улица" → "Vosita Vakhidova Street"
   Russian UI keeps the original.
   ════════════════════════════════════════════════════════════════ */

import { i18nStore } from '@/i18n';

const CYR = /[\u0400-\u04FF]/;

const UZ_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
const EN_MAP: Record<string, string> = {
  ...UZ_MAP, х: 'kh', ж: 'zh', ц: 'ts', щ: 'shch', ъ: '', ў: 'o', қ: 'q', ғ: 'gh',
};
/** An abbreviation keeps "ц" as "ts" in Uzbek too: ЦУМ → TsUM, not "SUM". */
const UZ_ACRONYM_MAP: Record<string, string> = { ...UZ_MAP, ц: 'ts' };

// Street-type words: [Russian/Uzbek-Cyrillic forms] → uz / en word.
const TYPES: Array<{ re: RegExp; uz: string; en: string; area?: boolean }> = [
  { re: /^(улица|ул\.?|кўчаси|кучаси)$/i, uz: 'koʻchasi', en: 'Street' },
  { re: /^(проспект|пр-т|просп\.?)$/i, uz: 'shoh koʻchasi', en: 'Avenue' },
  { re: /^(переулок|пер\.?)$/i, uz: 'tor koʻchasi', en: 'Lane' },
  { re: /^(проезд)$/i, uz: 'oʻtish yoʻli', en: 'Passage' },
  { re: /^(тупик)$/i, uz: 'berk koʻcha', en: 'Dead end' },
  { re: /^(площадь|майдони)$/i, uz: 'maydoni', en: 'Square' },
  { re: /^(махалля|махалла|маҳалла|маҳалласи|мфй)$/i, uz: 'mahallasi', en: 'Mahalla' },
  { re: /^(район|тумани)$/i, uz: 'tumani', en: 'District', area: true },
  { re: /^(массив|мавзеси)$/i, uz: 'massivi', en: 'Estate' },
  { re: /^(квартал|мавзе)$/i, uz: 'mavzesi', en: 'Block' },
  { re: /^(шоссе)$/i, uz: 'shossesi', en: 'Highway' },
];

/** A Russian place adjective before "район" ("Чиназский"): the ending to drop.
    A "й" before it goes only after "и" (Сергелийский → Sergeli, Яккасарайский →
    Yakkasaray). No lookbehind: older iOS WebViews cannot parse it. */
const ADJECTIVE_END = /[сц]к(ий|ая|ое|ого|ом)$/i;
const dropAdjectiveEnd = (word: string): string => word.replace(ADJECTIVE_END, '').replace(/ий$/i, 'и');

/** An abbreviation: Cyrillic capitals only ("ЦУМ", "Ц-1"). */
const isAcronym = (word: string): boolean => CYR.test(word) && word === word.toUpperCase();

function translit(word: string, map: Record<string, string>): string {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const lower = ch.toLowerCase();
    let r = map[lower];
    if (r == null) { out += ch; continue; }
    // Initial / post-vowel "е" reads "ye" (Елена → Yelena).
    if (lower === 'е' && (i === 0 || /[аеёиоуыэюяўaeiou\s-]/i.test(word[i - 1]))) r = 'ye';
    out += ch !== lower && r ? r[0].toUpperCase() + r.slice(1) : r;
  }
  return out;
}

/** One comma-separated Cyrillic segment of a geocoder label, transliterated. A
    place adjective before "район" loses its ending (Чиназский район → Chinaz tumani). */
function localizeSegment(seg: string, lang: 'uz' | 'en'): string {
  const map = lang === 'uz' ? UZ_MAP : EN_MAP;
  const acronymMap = lang === 'uz' ? UZ_ACRONYM_MAP : EN_MAP;
  const words = seg.trim().split(/\s+/);
  let typeWord = '';
  let area = false;
  const rest: string[] = [];
  for (const w of words) {
    const hit = typeWord ? null : TYPES.find((tp) => tp.re.test(w));
    if (hit) { typeWord = hit[lang]; area = !!hit.area; }
    else rest.push(w);
  }
  const name = rest.map((w) => (isAcronym(w) ? translit(w, acronymMap)
    : translit(area && ADJECTIVE_END.test(w) ? dropAdjectiveEnd(w) : w, map))).join(' ');
  return typeWord ? `${name} ${typeWord}`.trim() : name;
}

/** A geocoder label in the active UI language (no-op for Russian or Latin text). */
export function localizePlace(label: string): string {
  const lang = i18nStore.mode;
  if (lang === 'ru' || !CYR.test(label)) return label;
  return label.split(',').map((seg) => (CYR.test(seg) ? localizeSegment(seg, lang) : seg.trim()))
    .filter(Boolean).join(', ');
}

/** Nominatim `address` details (only the parts the short label uses). */
export interface AddressParts {
  road?: string; pedestrian?: string; house_number?: string;
  neighbourhood?: string; suburb?: string; city_district?: string; district?: string; quarter?: string;
  residential?: string; locality?: string; village?: string; town?: string; city?: string; county?: string;
}

type AreaKey = keyof Omit<AddressParts, 'road' | 'pedestrian' | 'house_number'>;

/** The area that orients a street or a named place: the wider ones first. */
const WIDE_AREAS: AreaKey[] = ['suburb', 'city_district', 'district', 'quarter', 'neighbourhood', 'residential', 'locality', 'village', 'town', 'city', 'county'];
/** The area that identifies a building without a street: the nearest first. In
    Tashkent's numbered blocks "13/1" exists in every block of a suburb, so
    "Чиланзар, 13/1" would name several different buildings. */
const NEAR_AREAS: AreaKey[] = ['locality', 'residential', 'neighbourhood', 'quarter', 'suburb', 'city_district', 'district', 'village', 'town', 'city', 'county'];

/** A building number on its own ("12", "13/1", "7а"), not a name ("5-мавзе"). */
const HOUSE_NUMBER = /^\d+(?:[/-]\d+)*[a-zа-яё]?$/i;

const sameName = (a: string | null | undefined, b: string): boolean => !!a && localizePlace(a) === localizePlace(b);

const areaOf = (a: AddressParts, order: AreaKey[], except?: string): string | undefined =>
  order.map((k) => a[k]).find((v) => v && !(except && sameName(v, except)));

/** "Street 12, District", or "Area, 13/1" for a building with no street — short
    enough for one line. */
export function shortAddress(a: AddressParts | null | undefined): string | null {
  if (!a) return null;
  const street = a.road || a.pedestrian;
  if (!street && a.house_number) {
    const near = areaOf(a, NEAR_AREAS);
    return near ? localizePlace(`${near}, ${a.house_number}`) : null;
  }
  const area = areaOf(a, WIDE_AREAS);
  // The street is localized on its own, so a number never lands inside it
  // ("Vosita Vaxidova koʻchasi 12", not "… 12 koʻchasi").
  const first = street ? (a.house_number ? `${localizePlace(street)} ${a.house_number}` : street) : null;
  const parts = [first, area].filter((p): p is string => !!p);
  return parts.length ? localizePlace(parts.join(', ')) : null;
}

/** The place's own name, when the display name starts with one (a station, a
    shop, a village) and not with its road or building number. */
function ownName(displayName: string | null | undefined, a: AddressParts): string | null {
  const first = (displayName || '').split(',')[0].trim();
  if (!first || HOUSE_NUMBER.test(first)) return null;
  return sameName(a.road, first) || sameName(a.pedestrian, first) || sameName(a.house_number, first) ? null : first;
}

/** The label a place goes by — a picked suggestion and a map pick alike. A named
    place keeps the name the user saw ("Amir Temur, Mirzo-Ulugbek District");
    anything else is its short address. Null when the details cannot say (the
    caller then falls back to the display name). */
export function shortPlaceName(displayName: string | null | undefined, a: AddressParts | null | undefined): string | null {
  if (!a) return null;
  const name = ownName(displayName, a);
  if (!name) return shortAddress(a);
  const area = areaOf(a, WIDE_AREAS, name);
  return area ? localizePlace(`${name}, ${area}`) : null;
}

/** The area part of a short label: "Street 12, District" → "District",
    "Area, 13/1" → "Area". */
export function labelArea(label: string): string {
  const parts = label.split(',').map((p) => p.trim()).filter((p) => p && !HOUSE_NUMBER.test(p));
  return parts[parts.length - 1] || label;
}
