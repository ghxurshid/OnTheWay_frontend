import { useState, useEffect, useRef, useId } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { geocode, placeLabel, suggestionToPlace } from '@/services/geocodingService';
import type { PlaceSuggestion } from '@/services/geocodingService';
import { InlineSpinner } from '@/components/ui/Spinner';
import { FIELD_LABEL } from './fieldStyles';
import type { Place } from '@/models';

interface LocationFieldProps {
  label: string;
  point: Place | null;
  placeholder?: string;
  accent?: string;
  onPick: () => void;
  onSelect: (place: Place | null) => void;
}

/** Address input with debounced geocode suggestions + "pick on map" button. */
export function LocationField({ label, point, placeholder, accent = T.teal, onPick, onSelect }: LocationFieldProps) {
  const [query, setQuery] = useState(point ? point.label : '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searchState, setSearchState] = useState<'idle' | 'empty' | 'failed'>('idle');
  const inputId = useId();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (point) { setQuery(point.label); setSuggestions([]); } }, [point]);

  const onChange = (val: string) => {
    setQuery(val);
    if (point) onSelect(null);
    if (debRef.current) clearTimeout(debRef.current);
    setSearchState('idle');
    if (val.trim().length < 3) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      try {
        const found = await geocode(val);
        setSuggestions(found);
        setSearchState(found.length ? 'idle' : 'empty');
      } catch {
        setSuggestions([]);
        setSearchState('failed');
      } finally {
        setSearching(false);
      }
    }, 600);
  };

  const pickSuggest = (s: PlaceSuggestion) => {
    const place = suggestionToPlace(s);
    setQuery(place.label); setSuggestions([]); setSearching(false); setFocused(false);
    onSelect(place);
  };

  const clear = () => { setQuery(''); setSuggestions([]); setSearching(false); onSelect(null); };

  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={inputId} style={{ ...FIELD_LABEL, display: 'block' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          width: 8, height: 8, borderRadius: 4, background: accent, zIndex: 1 }} />
        <input id={inputId} value={query}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={{ width: '100%', padding: '12px 76px 12px 28px', borderRadius: 12,
            background: T.bg, border: `1.5px solid ${point ? accent + '55' : (focused ? T.teal + '55' : T.border)}`,
            color: T.text, fontSize: 13, outline: 'none',
            fontFamily: 'DM Sans,sans-serif', transition: 'border-color .18s ease' }} />
        {query && (
          <button onClick={clear} aria-label={t('common.clear')} style={{ position: 'absolute', right: 42, top: '50%',
            transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: 6, border: 'none',
            background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✕</button>
        )}
        <button onClick={onPick} title={t('form.pickOnMap')} aria-label={t('form.pickOnMap')}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 28, borderRadius: 8, border: `1px solid ${accent}40`, cursor: 'pointer',
            background: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .15s ease' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5C5.2 1.5 3 3.7 3 6.5c0 3.5 5 8 5 8s5-4.5 5-8C13 3.7 10.8 1.5 8 1.5z" stroke={accent} strokeWidth="1.3" />
            <circle cx="8" cy="6.5" r="1.7" fill={accent} />
          </svg>
        </button>
      </div>

      {focused && searching && <InlineSpinner size={14} style={{ marginTop: 8, padding: '2px 2px' }} />}
      {!searching && searchState !== 'idle' && (
        <div role="status" style={{ marginTop: 8, fontSize: 12, color: searchState === 'failed' ? T.amber : T.muted }}>
          {searchState === 'failed' ? t('form.searchFailed') : t('form.noMatches')}
        </div>
      )}
      {focused && !searching && suggestions.length > 0 && (
        <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={() => pickSuggest(s)}
              style={{ width: '100%', padding: '10px 12px', background: i % 2 === 0 ? T.surface2 : T.bg,
                border: 'none', borderBottom: i < suggestions.length - 1 ? `1px solid ${T.border}` : 'none',
                display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'DM Sans,sans-serif' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M7 1.3C4.9 1.3 3.2 3 3.2 5.1c0 2.6 3.8 6 3.8 6s3.8-3.4 3.8-6C10.8 3 9.1 1.3 7 1.3z" stroke={T.muted} strokeWidth="1.2" />
                <circle cx="7" cy="5.1" r="1.3" fill={T.muted} />
              </svg>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {placeLabel(s.display_name, 3)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
