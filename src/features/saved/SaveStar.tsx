import { T } from '@/constants/theme';
import { useSaved } from '@/hooks/useSaved';
import { savedStore } from '@/services/savedStore';
import type { SavedItem } from '@/models';

interface SaveStarProps { place: SavedItem; size?: number }

/** Toggle star that saves/unsaves a place/route/partner. */
export function SaveStar({ place, size = 18 }: SaveStarProps) {
  const list = useSaved();
  const saved = list.some((p) => p.id === place.id);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); savedStore.toggle(place); }}
      title={saved ? 'Saqlangandan olib tashlash' : 'Saqlash'}
      style={{ width: size + 10, height: size + 10, borderRadius: 8, border: 'none',
        background: saved ? T.amberDim : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background .15s ease', padding: 0, fontFamily: 'DM Sans,sans-serif' }}>
      <svg width={size} height={size} viewBox="0 0 20 20"
        fill={saved ? T.amber : 'none'}
        stroke={saved ? T.amber : T.muted} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M10 2.5l2.4 4.85 5.35.78-3.87 3.78.91 5.34L10 14.7l-4.79 2.55.91-5.34L2.25 8.13l5.35-.78L10 2.5z" />
      </svg>
    </button>
  );
}
