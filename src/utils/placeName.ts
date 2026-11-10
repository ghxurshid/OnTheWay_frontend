/* ════════════════════════════════════════════════════════════════
   PLACE NAMES — make geocoder labels read naturally in the UI language.
   OSM rarely has Uzbek names for Tashkent streets, so the geocoder falls back
   to the Russian Cyrillic name ("Восита Вахидова улица"). For the Latin-script
   UI languages (uz, en) such names are transliterated and the street-type
   word is translated and moved to where the language puts it:
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

// Street-type words: [Russian/Uzbek-Cyrillic forms] → uz / en word.
const TYPES: Array<{ re: RegExp; uz: string; en: string }> = [
  { re: /^(улица|ул\.?|кўчаси|кучаси)$/i, uz: 'koʻchasi', en: 'Street' },
  { re: /^(проспект|пр-т|просп\.?|шоҳ кўчаси)$/i, uz: 'shoh koʻchasi', en: 'Avenue' },
  { re: /^(переулок|пер\.?|тор кўчаси)$/i, uz: 'tor koʻchasi', en: 'Lane' },
  { re: /^(проезд)$/i, uz: 'oʻtish yoʻli', en: 'Passage' },
  { re: /^(тупик|берк кўча)$/i, uz: 'berk koʻcha', en: 'Dead end' },
  { re: /^(площадь|майдони)$/i, uz: 'maydoni', en: 'Square' },
  { re: /^(махалля|махалла|маҳалла|маҳалласи|мфй)$/i, uz: 'mahallasi', en: 'Mahalla' },
  { re: /^(район|тумани)$/i, uz: 'tumani', en: 'District' },
  { re: /^(массив|мавзеси)$/i, uz: 'massivi', en: 'Estate' },
  { re: /^(квартал|мавзе)$/i, uz: 'mavzesi', en: 'Block' },
  { re: /^(шоссе)$/i, uz: 'shossesi', en: 'Highway' },
];

// Tashkent's districts: OSM names them with a Russian adjective ("Юнусабадский
// район"); transliterating that gives "Yunusabadskiy tumani". Their own names:
const DISTRICTS: Array<{ re: RegExp; uz: string; en: string }> = [
  { re: /^бектемирск/i, uz: 'Bektemir', en: 'Bektemir' },
  { re: /^чиланзарск/i, uz: 'Chilonzor', en: 'Chilonzor' },
  { re: /^мирабадск/i, uz: 'Mirobod', en: 'Mirobod' },
  { re: /^мирзо-?улугбекск/i, uz: 'Mirzo Ulugʻbek', en: 'Mirzo Ulugbek' },
  { re: /^алмазарск/i, uz: 'Olmazor', en: 'Olmazor' },
  { re: /^сергелийск/i, uz: 'Sergeli', en: 'Sergeli' },
  { re: /^шайхантахурск/i, uz: 'Shayxontohur', en: 'Shaykhontohur' },
  { re: /^учтепинск/i, uz: 'Uchtepa', en: 'Uchtepa' },
  { re: /^яккасарайск/i, uz: 'Yakkasaroy', en: 'Yakkasaroy' },
  { re: /^яшнабадск/i, uz: 'Yashnobod', en: 'Yashnobod' },
  { re: /^юнусабадск/i, uz: 'Yunusobod', en: 'Yunusobod' },
  { re: /^янгиха[её]тск/i, uz: 'Yangihayot', en: 'Yangihayot' },
];
/** A Russian place adjective ("Чиназский", "Сергелийский"): the ending to drop. */
const ADJECTIVE_END = /й?[сц]к(ий|ая|ое|ого|ом)$/i;

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

/** One comma-separated segment of a geocoder label, localized. A known
    district adjective becomes the district's own name; any other place
    adjective before "район" loses its ending (Чиназский район → Chinaz tumani). */
function localizeSegment(seg: string, lang: 'uz' | 'en'): string {
  const map = lang === 'uz' ? UZ_MAP : EN_MAP;
  const words = seg.trim().split(/\s+/);
  let typeWord = '';
  let district = false;
  const rest: string[] = [];
  for (const w of words) {
    const hit = typeWord ? null : TYPES.find((tp) => tp.re.test(w));
    if (hit) { typeWord = hit[lang]; district = hit.en === 'District'; }
    else rest.push(w);
  }
  const name = rest.map((w) => {
    const known = DISTRICTS.find((d) => d.re.test(w));
    if (known) return known[lang];
    return translit(district && ADJECTIVE_END.test(w) ? w.replace(ADJECTIVE_END, '') : w, map);
  }).join(' ');
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
  const first = street ? (a.house_number ? `${street} ${a.house_number}` : street) : null;
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
