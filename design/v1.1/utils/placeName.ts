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

/** One comma-separated segment of a geocoder label, localized. */
function localizeSegment(seg: string, lang: 'uz' | 'en'): string {
  const map = lang === 'uz' ? UZ_MAP : EN_MAP;
  const words = seg.trim().split(/\s+/);
  let typeWord = '';
  const rest: string[] = [];
  for (const w of words) {
    const hit = typeWord ? null : TYPES.find((tp) => tp.re.test(w));
    if (hit) typeWord = hit[lang];
    else rest.push(w);
  }
  const name = rest.map((w) => translit(w, map)).join(' ');
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
  neighbourhood?: string; suburb?: string; city_district?: string; quarter?: string; residential?: string;
}

/** "Street 12, District" from address details — short enough for one line. */
export function shortAddress(a: AddressParts | null | undefined): string | null {
  if (!a) return null;
  const street = a.road || a.pedestrian;
  const area = a.suburb || a.city_district || a.quarter || a.neighbourhood || a.residential;
  const first = street ? (a.house_number ? `${street} ${a.house_number}` : street) : null;
  const parts = [first, area].filter((p): p is string => !!p);
  return parts.length ? localizePlace(parts.join(', ')) : null;
}
