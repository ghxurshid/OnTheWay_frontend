import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { usePrefs } from '@/hooks/usePrefs';
import { prefsStore, vehicleLine } from '@/services/prefsStore';
import { currentUserName } from '@/services/authService';
import { telegramUser, haptic } from '@/services/telegram';
import { userApi } from '@/api/userApi';
import { initialsOf } from '@/utils/avatar';
import type { PartyType } from '@/models';

const COLORS = ['colorWhite', 'colorBlack', 'colorSilver', 'colorGrey', 'colorBlue', 'colorRed', 'colorGreen', 'colorBeige'];

/** The signed-in user's display name and photo (Telegram first). */
export function useProfileIdentity(): { name: string; photo: string | null; username: string | null } {
  const tg = telegramUser();
  const tgName = [tg?.first_name, tg?.last_name].filter(Boolean).join(' ');
  return { name: currentUserName() || tgName || t('common.user'), photo: tg?.photo_url || null, username: tg?.username || null };
}

/** Profile: who I am (Telegram name/photo, rating) and — for driving — my car,
    so a passenger can recognise it on the card and on arrival. */
export function ProfileScreen({ mode, onClose }: { mode: PartyType; onClose: () => void }) {
  const prefs = usePrefs();
  const { name, photo, username } = useProfileIdentity();
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null);
  const [model, setModel] = useState(prefs.vehicle?.model || '');
  const [color, setColor] = useState(prefs.vehicle?.color || '');
  const [plate, setPlate] = useState(prefs.vehicle?.plate || '');
  const [seats, setSeats] = useState(prefs.vehicle?.seats || 3);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (userApi.me() as Promise<{ ratingAverage?: number; ratingCount?: number } | null>).then((me) => {
      if (alive && me && me.ratingCount) setRating({ avg: me.ratingAverage || 0, count: me.ratingCount });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const valid = model.trim().length >= 2 && plate.trim().length >= 4;
  const save = async () => {
    if (!valid || savingRef.current) return;
    savingRef.current = true;
    const vehicle = { model: model.trim(), color: color.trim(), plate: plate.trim().toUpperCase(), seats };
    prefsStore.patch({ vehicle });
    try { await userApi.updateVehicle(vehicleLine(vehicle)); } catch { /* kept locally; synced next time */ }
    savingRef.current = false;
    haptic('success');
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const input: CSSProperties = { width: '100%', minHeight: 46, padding: '0 14px', borderRadius: 12, border: `1.5px solid ${T.border}`,
    background: T.bg, color: T.text, fontSize: 15, fontFamily: 'DM Sans,sans-serif', outline: 'none' };
  const label: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: T.muted, margin: '14px 0 6px', display: 'block' };

  return (
    <FullScreenPanel title={t('profile.title')} accent={T.teal} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 14, borderRadius: 18, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, overflow: 'hidden', flexShrink: 0, background: TEAL_GRADIENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700 }}>
            {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, overflowWrap: 'anywhere' }}>{name}</div>
            {username && <div style={{ fontSize: 13, color: T.muted }}>@{username}</div>}
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: mode === 'driver' ? T.amber : T.teal, fontWeight: 600 }}>
                <RoleGlyph type={mode} size={15} color={mode === 'driver' ? T.amber : T.teal} />
                {mode === 'driver' ? t('common.driver') : t('common.passenger')}
              </span>
              <span>{rating ? `⭐ ${rating.avg.toFixed(1)} · ${t('profile.ratings', { n: rating.count })}` : t('profile.noRating')}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22, fontSize: 15, fontWeight: 700, color: T.text }}>🚗 {t('profile.vehicle')}</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>
          {mode === 'driver' ? t('profile.vehicleWhy') : t('profile.vehiclePassenger')}
        </div>

        <label htmlFor="pf-model" style={label}>{t('profile.model')}</label>
        <input id="pf-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Chevrolet Cobalt" style={input} />

        <span style={label}>{t('profile.color')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLORS.map((k) => {
            const v = t(`profile.${k}`);
            const on = color === v;
            return (
              <button key={k} onClick={() => setColor(v)} aria-pressed={on} style={{ minHeight: 38, padding: '0 14px', borderRadius: 19,
                border: `1.5px solid ${on ? T.teal : T.border}`, background: on ? T.tealDim : 'transparent', color: on ? T.teal : T.text,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{v}</button>
            );
          })}
        </div>

        <label htmlFor="pf-plate" style={label}>{t('profile.plate')}</label>
        <input id="pf-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="01 A 777 BB"
          style={{ ...input, letterSpacing: 1, fontWeight: 600 }} />

        <span style={label}>{t('profile.seats')}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => setSeats(n)} aria-pressed={seats === n} style={{ flex: 1, minHeight: 44, borderRadius: 12,
              border: `1.5px solid ${seats === n ? T.teal : T.border}`, background: seats === n ? T.tealDim : 'transparent',
              color: seats === n ? T.teal : T.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{n}</button>
          ))}
        </div>

        {valid && (
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 12, background: T.bg, border: `1px dashed ${T.border}`, fontSize: 13.5, color: T.text }}>
            {t('profile.preview')}: <b>{vehicleLine({ model, color, plate: plate.toUpperCase(), seats })}</b> · {t('popup.seatsFree', { n: seats })}
          </div>
        )}

        <button onClick={save} disabled={!valid} style={{ width: '100%', minHeight: 50, marginTop: 18, borderRadius: 14, border: 'none',
          background: valid ? TEAL_GRADIENT : T.surface2, color: valid ? '#fff' : T.muted, fontSize: 15, fontWeight: 700,
          cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans,sans-serif' }}>
          {saved ? `✓ ${t('common.saved')}` : t('common.save')}
        </button>
      </div>
    </FullScreenPanel>
  );
}
