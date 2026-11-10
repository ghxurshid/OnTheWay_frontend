import { useEffect, useState } from 'react';
import { T, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAgreement } from '@/hooks/useAgreement';
import { SaveStar } from '@/features/saved/SaveStar';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { reverseGeocode } from '@/services/geocodingService';
import { labelArea } from '@/utils/placeName';
import type { LatLng } from '@/models';
import type { MapPerson } from './types';

interface UserPopupProps {
  user: MapPerson;
  onClose: () => void;
  onCall: () => void;
  onChat: () => void;
  /** Offer to ride together. */
  onRide: () => void;
  /** Save this user as a contact (real users only). */
  onAddContact?: () => void;
  onReport: () => void;
  onBlock: () => void;
  /** Trust signals. */
  verified?: boolean;
  isContact?: boolean;
  ridesWithYou?: number;
}

// Area names of route ends, cached per point (popups reopen often).
const areaCache = new Map<string, string>();
async function areaOf(p: LatLng): Promise<string> {
  const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const hit = areaCache.get(key);
  if (hit) return hit;
  const label = await reverseGeocode(p);
  const area = labelArea(label).replace(/\s*\([^)]*$/, '').trim() || label;
  areaCache.set(key, area);
  return area;
}

/** Bottom-sheet card of a person on the map: where they are heading, their
    car and free seats, how well the route matches, trust signals — and the
    next step (ride together; call / chat; save; report / block). */
export function UserPopup({ user, onClose, onCall, onChat, onRide, onAddContact, onReport, onBlock, verified, isContact, ridesWithYou }: UserPopupProps) {
  useBackHandler(onClose);
  const agreement = useAgreement();
  const [route, setRoute] = useState<{ from: string; to: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const isDriver = user.type === 'driver';
  const color = user.color || partyColor(user.type);
  const offered = !!agreement && String(agreement.peer.id) === String(user.id);

  useEffect(() => {
    let alive = true;
    setRoute(null);
    if (user.startLatlng && user.destLatlng) {
      Promise.all([areaOf(user.startLatlng), areaOf(user.destLatlng)])
        .then(([from, to]) => { if (alive) setRoute({ from, to }); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps -- one lookup per person

  const stats: [string, string | undefined, string][] = [
    [t('userPopup.distance'), user.dist, T.text],
    [t('userPopup.arrival'), user.eta, T.text],
    ...(user.match != null ? [[t('userPopup.match'), `${user.match}%`, T.green] as [string, string, string]] : []),
    ...(isDriver && user.seats ? [[t('form.seats'), String(user.seats), T.amber] as [string, string, string]] : []),
  ];
  const badge = (text: string, tone: string) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: tone, background: `${tone}1a`, borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap' }}>{text}</span>
  );
  const iconBtn = (label: string, glyph: string, onClick: () => void) => (
    <button onClick={onClick} aria-label={label} title={label} style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0,
      border: `1px solid ${T.border}`, background: T.surface2, cursor: 'pointer', fontSize: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{glyph}</button>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{ background: T.surface, borderRadius: '24px 24px 0 0', pointerEvents: 'auto', position: 'relative',
        animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)', padding: '14px 18px calc(20px + env(safe-area-inset-bottom,0px))',
        borderTop: `1px solid ${T.border}`, maxHeight: 'calc(100% - 12px - env(safe-area-inset-top,0px))', overflowY: 'auto' }} role="dialog" aria-label={user.name}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 58, height: 58, borderRadius: isDriver ? 17 : 29, background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2.5px solid #fff' }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{user.initials}</span>
            </div>
            <span aria-hidden="true" style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
              background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}` }}>
              <RoleGlyph type={user.type} size={14} color={color} />
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{user.name}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
              <span>⭐ {user.rating}</span>
              <span>{t('userPopup.tripsCount', { n: user.trips })}</span>
              <span style={{ color: user.offline ? T.muted : T.green }}>● {user.offline ? t('common.offline') : t('common.online')}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {badge(isDriver ? t('common.driver') : t('common.passenger'), color)}
              {verified && badge(`✓ ${t('popup.verified')}`, T.teal)}
              {isContact && badge(t('popup.yourContact'), T.purple)}
              {!!ridesWithYou && badge(t('popup.ridesWithYou', { n: ridesWithYou }), T.green)}
            </div>
          </div>
          <button onClick={() => setMenu((m) => !m)} aria-label={t('popup.more')} aria-expanded={menu} style={{ width: 44, height: 44, borderRadius: 12,
            flexShrink: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 18 }}>⋯</button>
        </div>

        {menu && (
          <div role="menu" style={{ position: 'absolute', right: 18, top: 78, zIndex: 2, minWidth: 200, background: T.glassSolid,
            border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6, animation: 'fadeDown .18s ease both' }}>
            {[{ label: `⚠️ ${t('popup.report')}`, run: onReport, tone: T.text }, { label: `🚫 ${t('popup.block')}`, run: onBlock, tone: T.red }].map((it) => (
              <button key={it.label} role="menuitem" onClick={() => { setMenu(false); it.run(); }} style={{ width: '100%', minHeight: 44, padding: '0 12px',
                borderRadius: 10, border: 'none', background: 'transparent', color: it.tone, fontSize: 14, fontWeight: 600, textAlign: 'left',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{it.label}</button>
            ))}
          </div>
        )}

        {/* Where they are heading + their car */}
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: T.bg, border: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: .5 }}>{t('popup.going')}</div>
          <div style={{ fontSize: 14.5, color: T.text, fontWeight: 600, lineHeight: 1.35 }}>
            {route ? `${route.from} → ${route.to}` : (user.startLatlng ? t('popup.loadingRoute') : t('popup.onTheWayNow'))}
          </div>
          {isDriver && user.vehicle && <div style={{ fontSize: 13, color: T.muted }}>🚗 {user.vehicle}</div>}
          {user.note && <div style={{ fontSize: 13, color: T.muted, whiteSpace: 'pre-line' }}>{user.note}</div>}
        </div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: `repeat(${stats.length},minmax(0,1fr))`, gap: 8 }}>
          {stats.map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 12, background: T.surface2 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onRide} disabled={offered} style={{ flex: 1, minHeight: 52, borderRadius: 14, border: 'none',
            background: offered ? T.surface2 : T.green, color: offered ? T.muted : '#fff', fontSize: 15.5, fontWeight: 700,
            cursor: offered ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: offered ? 'none' : `0 6px 20px ${T.green}45`, fontFamily: 'DM Sans,sans-serif' }}>
            🤝 {offered ? t('call.offerPending') : t('popup.rideTogether')}
          </button>
          {iconBtn(t('common.call'), '📞', onCall)}
          {iconBtn(t('common.chat'), '💬', onChat)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <SaveStar place={{ id: 'partner-' + user.id, type: 'partner', label: user.name, sub: user.sub,
            initials: user.initials, userId: String(user.id), partyType: user.type }} />
          {onAddContact && !isContact && (
            <button onClick={onAddContact} style={{ flex: 1, minHeight: 44, borderRadius: 12,
              border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>👥 {t('contacts.add')}</button>
          )}
          <div style={{ flex: onAddContact && !isContact ? 0 : 1 }} />
          <button onClick={onClose} style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: `1px solid ${T.border}`,
            background: 'transparent', color: T.muted, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
