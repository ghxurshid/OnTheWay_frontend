import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { isTranslationOf, t } from '@/i18n';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { usePrefs } from '@/hooks/usePrefs';
import { vehicleLine } from '@/services/prefsStore';
import type { VehicleInfo } from '@/services/prefsStore';
import { loadMyProfile, saveVehicle } from '@/services/profileService';
import { useProfileIdentity } from '@/hooks/useProfileIdentity';
import { haptic } from '@/services/telegram';
import { initialsOf } from '@/utils/avatar';
import { errorMessage } from '@/utils/errors';
import { confirmAction } from '@/services/confirm';
import type { PartyType } from '@/models';

const COLORS = ['colorWhite', 'colorBlack', 'colorSilver', 'colorGrey', 'colorBlue', 'colorRed', 'colorGreen', 'colorBeige'];
const SEAT_CHOICES = [1, 2, 3, 4];

/** Profile: who I am (Telegram name/photo, rating) and — for driving — my car,
    so a passenger can recognise it on the card and on arrival. The car lives
    on the server: the form opens with the local copy and takes the server's as
    soon as it arrives (unless the user already started editing). */
export function ProfileScreen({ mode, onClose }: { mode: PartyType; onClose: () => void }) {
  const prefs = usePrefs();
  const { name, photo, username } = useProfileIdentity();
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null);
  const [model, setModel] = useState(prefs.vehicle?.model || '');
  const [color, setColor] = useState(prefs.vehicle?.color || '');
  const [plate, setPlate] = useState(prefs.vehicle?.plate || '');
  const [seats, setSeats] = useState(prefs.vehicle?.seats || 3);
  // A bigger car (saved elsewhere, the server allows up to 8) keeps its own chip.
  const [bigCarSeats, setBigCarSeats] = useState(prefs.vehicle?.seats || 0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not `busy`: taps in the same frame all see the stale state.
  const savingRef = useRef(false);
  const editedRef = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fill = useCallback((v: VehicleInfo | null) => {
    setModel(v?.model || ''); setColor(v?.color || ''); setPlate(v?.plate || ''); setSeats(v?.seats || 3);
    setBigCarSeats(v?.seats || 0);
  }, []);
  const edit = <V,>(set: (v: V) => void) => (v: V) => { editedRef.current = true; setError(null); set(v); };

  useEffect(() => {
    let alive = true;
    loadMyProfile().then((me) => {
      if (!alive) return;
      if (me.ratingCount) setRating({ avg: me.ratingAverage, count: me.ratingCount });
      if (!editedRef.current) fill(me.vehicle);
    }).catch(() => { /* offline: the form keeps the local copy */ });
    return () => { alive = false; };
  }, [fill]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const valid = model.trim().length >= 2 && plate.trim().length >= 4;

  // Back to passenger: the car goes from the server (and this device's copy).
  const removeCar = async () => {
    if (savingRef.current) return;
    const ok = await confirmAction({ title: t('profile.removeCarTitle'), body: t('profile.removeCarBody'),
      confirmLabel: t('profile.removeCar'), cancelLabel: t('common.cancel'), danger: true });
    if (!ok || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await saveVehicle(null);
      editedRef.current = false;
      fill(null);
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(errorMessage(e, 'errors.saveFailed'));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const save = async () => {
    if (!valid || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const vehicle = await saveVehicle({ model: model.trim(), color: color.trim(), plate: plate.trim().toUpperCase(), seats });
      editedRef.current = false;
      fill(vehicle);
      haptic('success');
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      haptic('error');
      setError(errorMessage(e, 'errors.saveFailed'));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
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
        <input id="pf-model" value={model} onChange={(e) => edit(setModel)(e.target.value)} placeholder="Chevrolet Cobalt" style={input} />

        <span style={label}>{t('profile.color')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLORS.map((k) => {
            const v = t(`profile.${k}`);
            const on = isTranslationOf(`profile.${k}`, color); // saved in any language
            return (
              <button key={k} onClick={() => edit(setColor)(v)} aria-pressed={on} style={{ minHeight: 38, padding: '0 14px', borderRadius: 19,
                border: `1.5px solid ${on ? T.teal : T.border}`, background: on ? T.tealDim : 'transparent', color: on ? T.teal : T.text,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{v}</button>
            );
          })}
        </div>

        <label htmlFor="pf-plate" style={label}>{t('profile.plate')}</label>
        <input id="pf-plate" value={plate} onChange={(e) => edit(setPlate)(e.target.value.toUpperCase())} placeholder="01 A 777 BB"
          style={{ ...input, letterSpacing: 1, fontWeight: 600 }} />

        <span style={label}>{t('profile.seats')}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(bigCarSeats > 4 ? [...SEAT_CHOICES, bigCarSeats] : SEAT_CHOICES).map((n) => (
            <button key={n} onClick={() => edit(setSeats)(n)} aria-pressed={seats === n} style={{ flex: 1, minHeight: 44, borderRadius: 12,
              border: `1.5px solid ${seats === n ? T.teal : T.border}`, background: seats === n ? T.tealDim : 'transparent',
              color: seats === n ? T.teal : T.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{n}</button>
          ))}
        </div>

        {valid && (
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 12, background: T.bg, border: `1px dashed ${T.border}`, fontSize: 13.5, color: T.text }}>
            {t('profile.preview')}: <b>{vehicleLine({ model, color, plate: plate.toUpperCase(), seats })}</b> · {t('popup.seatsFree', { n: seats })}
          </div>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 12.5, color: T.red, marginTop: 14, textAlign: 'center' }}>{error}</div>
        )}

        <button onClick={save} disabled={!valid || busy} style={{ width: '100%', minHeight: 50, marginTop: 18, borderRadius: 14, border: 'none',
          background: valid && !busy ? TEAL_GRADIENT : T.surface2, color: valid && !busy ? '#fff' : T.muted, fontSize: 15, fontWeight: 700,
          cursor: valid && !busy ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans,sans-serif' }}>
          {busy ? t('common.saving') : saved ? `✓ ${t('common.saved')}` : t('common.save')}
        </button>

        {prefs.vehicle && (
          <button onClick={removeCar} disabled={busy} style={{ width: '100%', minHeight: 46, marginTop: 10, borderRadius: 14,
            border: `1px solid ${T.red}55`, background: `${T.red}12`, color: T.red, fontSize: 14, fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('profile.removeCar')}</button>
        )}
      </div>
    </FullScreenPanel>
  );
}
