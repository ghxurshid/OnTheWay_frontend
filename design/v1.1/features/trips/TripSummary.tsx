import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { MapSheet } from '@/components/ui/MapSheet';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useMainButton } from '@/hooks/useMainButton';
import type { AgreementPeer } from '@/services/agreementStore';

/** Rough saving of a shared ride: half of a typical Tashkent taxi fare
    (~2 000 so'm/km), rounded — shown as an estimate, never as a price. */
export const estimateSaving = (km: number): number => Math.max(0, Math.round((km * 1000) / 500) * 500);

interface TripSummaryProps {
  distanceKm: number;
  durationMin: number;
  partner: AgreementPeer | null;
  onRate: (stars: number, tags: string[]) => void;
  onAddContact?: () => void;
  onAgain: () => void;
  onDone: () => void;
}

const TAGS = ['tagOnTime', 'tagPolite', 'tagClean', 'tagSafe', 'tagEasy'];

/** End of a trip: what it was (distance, time, saving), a rating for the
    companion (stars + quick tags) and the next step (save contact, same route). */
export function TripSummary({ distanceKm, durationMin, partner, onRate, onAddContact, onAgain, onDone }: TripSummaryProps) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const finish = () => { if (partner && stars > 0) onRate(stars, tags); onDone(); };
  useBackHandler(finish);
  const native = useMainButton(t('summary.done'), finish);
  const saving = estimateSaving(distanceKm).toLocaleString('ru-RU').replace(/,/g, ' ');
  const toggleTag = (k: string) => setTags((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));

  return (
    <MapSheet title={t('summary.title')} onClose={finish} zIndex={30} maxHeight="86%">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {[
          [t('common.km', { n: distanceKm.toFixed(1) }), t('userPopup.distance')],
          [t('common.minutes', { n: Math.max(1, Math.round(durationMin)) }), t('summary.time')],
          [`~${saving}`, t('dashboard.som')],
        ].map(([v, l]) => (
          <div key={l} style={{ padding: '12px 8px', borderRadius: 14, background: T.surface2, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{t('summary.savedNote')}</div>

      {partner && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t('summary.rate', { name: partner.name.split(' ')[0] })}</div>
          <div role="radiogroup" aria-label={t('summary.rate', { name: partner.name })} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,48px))', gap: 6, marginTop: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} ★`} onClick={() => setStars(n)}
                style={{ width: '100%', height: 48, borderRadius: 14, padding: 0, border: `1px solid ${n <= stars ? T.amber : T.border}`,
                  background: n <= stars ? T.amberDim : T.surface2, color: n <= stars ? T.amber : T.muted, fontSize: 24, cursor: 'pointer' }}>★</button>
            ))}
          </div>
          {stars > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, animation: 'fadeUp .2s ease both' }}>
              {TAGS.map((k) => {
                const on = tags.includes(k);
                return (
                  <button key={k} onClick={() => toggleTag(k)} aria-pressed={on} style={{ minHeight: 38, padding: '0 14px', borderRadius: 19,
                    border: `1.5px solid ${on ? T.teal : T.border}`, background: on ? T.tealDim : 'transparent', color: on ? T.teal : T.text,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t(`summary.${k}`)}</button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
        {partner && onAddContact && (
          <button onClick={onAddContact} style={{ minHeight: 46, borderRadius: 13, border: `1px solid ${T.border}`, background: T.surface2,
            color: T.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>👥 {t('contacts.add')}</button>
        )}
        <button onClick={() => { if (partner && stars > 0) onRate(stars, tags); onAgain(); }} style={{ minHeight: 46, borderRadius: 13,
          border: `1px solid ${T.teal}55`, background: T.tealDim, color: T.teal, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'DM Sans,sans-serif' }}>↻ {t('summary.again')}</button>
        {!native && (
          <button onClick={finish} style={{ minHeight: 50, borderRadius: 14, border: 'none', background: T.teal, color: '#04201e',
            fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('summary.done')}</button>
        )}
      </div>
    </MapSheet>
  );
}
