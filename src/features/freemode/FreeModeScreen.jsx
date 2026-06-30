import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { freeModeApi } from '@/api/freeModeApi';

/** Resolve the device's current position as { latitude, longitude }. */
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

/**
 * Free Mode: a driver makes themselves available without a destination (sharing
 * only their live location), and anyone can list nearby Free Mode drivers ranked
 * by distance. Location permission is requested only when an action needs it.
 */
export function FreeModeScreen({ onClose }) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nearby, setNearby] = useState(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      if (active) {
        await freeModeApi.stop();
        setActive(false);
      } else {
        const pos = await currentPosition();
        await freeModeApi.start({ latitude: pos.latitude, longitude: pos.longitude, address: null });
        setActive(true);
      }
    } catch (e) {
      setError(e?.message === 'no-geo' ? t('freeMode.noGeo') : (e?.message || t('common.error')));
    } finally { setBusy(false); }
  }

  async function findNearby() {
    setBusy(true); setError(null);
    try {
      const pos = await currentPosition();
      const rows = await freeModeApi.nearby(pos.latitude, pos.longitude);
      setNearby(rows);
    } catch (e) {
      setError(e?.message === 'no-geo' ? t('freeMode.noGeo') : (e?.message || t('common.error')));
    } finally { setBusy(false); }
  }

  return (
    <FullScreenPanel title={t('freeMode.title')} accent={T.amber} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 28px' }}>
        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 18 }}>
          {t('freeMode.intro')}
        </div>

        {/* Availability toggle */}
        <div style={{ background: active ? `linear-gradient(135deg,${T.teal}22,${T.teal}08)` : T.surface2,
          borderRadius: 16, padding: '16px', border: `1px solid ${active ? T.teal + '40' : T.border}`,
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: active ? T.tealDim : T.bg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 22 }}>🚗</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{t('freeMode.availability')}</div>
            <div style={{ fontSize: 12, color: active ? T.teal : T.muted }}>
              {active ? t('freeMode.on') : t('freeMode.off')}
            </div>
          </div>
          <button onClick={toggle} disabled={busy} style={{ padding: '10px 18px', borderRadius: 12, border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13.5, fontWeight: 600,
            background: active ? T.surface2 : `linear-gradient(135deg,${T.teal},#0e9e97)`,
            color: active ? T.text : 'white', border: active ? `1px solid ${T.border}` : 'none' }}>
            {busy ? '…' : (active ? t('freeMode.stop') : t('freeMode.start'))}
          </button>
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 14, textAlign: 'center' }}>{error}</div>
        )}

        {/* Nearby free-mode drivers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: .6 }}>
            {t('freeMode.nearby')}
          </div>
          <button onClick={findNearby} disabled={busy} style={{ fontSize: 12, color: T.teal, background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
            {t('freeMode.refresh')}
          </button>
        </div>

        {nearby == null ? (
          <div style={{ fontSize: 12.5, color: T.muted, textAlign: 'center', padding: '16px 0' }}>
            {t('freeMode.tapRefresh')}
          </div>
        ) : nearby.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.muted, textAlign: 'center', padding: '16px 0' }}>
            {t('freeMode.none')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearby.map((d) => (
              <div key={d.driverId} style={{ background: T.surface2, borderRadius: 13, padding: '12px 14px',
                border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.driverName}</div>
                  <div style={{ fontSize: 11.5, color: T.muted }}>
                    {d.vehicle || t('common.driver')}{d.rating ? ` · ⭐ ${d.rating.toFixed(1)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.teal, whiteSpace: 'nowrap' }}>
                  {d.distanceKm} km
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FullScreenPanel>
  );
}
