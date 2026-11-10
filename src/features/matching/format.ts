/* Small text/look helpers shared by the map chrome and the board cards (kept
   out of the component files so those export components only). */

import { T } from '@/constants/theme';
import { t } from '@/i18n';
import type { Walker } from '@/models';
import type { Visibility } from './MapUI';

/** Tone + label of a visibility state (the top bar pill and the visibility sheet). */
export function visibilityLook(v: Visibility): { tone: string; label: string } {
  if (v === 'busy') return { tone: T.red, label: t('status.busy') };
  if (v === 'visible') return { tone: T.green, label: t('status.visible') };
  return { tone: T.muted, label: t('status.hidden') };
}

/** "3 free seats · 12 trips" — what a board row says about the person and the car. */
export function walkerFacts(w: Pick<Walker, 'type' | 'seats' | 'trips'>): string {
  return [
    w.type === 'driver' && w.seats ? t('popup.seatsFree', { n: w.seats }) : null,
    w.trips ? t('userPopup.tripsCount', { n: w.trips }) : null,
  ].filter(Boolean).join(' · ');
}
