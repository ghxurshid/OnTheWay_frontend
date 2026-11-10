import { useEffect, useState } from 'react';
import { T, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { RoleGlyph } from '@/components/ui/MapSheet';
import { useAgreement } from '@/hooks/useAgreement';
import { haversineKm } from '@/utils/geo';
import type { AgreementPeer } from '@/services/agreementStore';
import type { LatLng, PartyType } from '@/models';

interface AgreedRideCardProps {
  mode: PartyType;
  userLoc: LatLng | null;
  /** Current position of a person on the map (moves while the card is up). */
  locate: (id: string) => LatLng | null | undefined;
  onCall: (peer: AgreementPeer) => void;
  onChat: (peer: AgreementPeer) => void;
  onArrived: () => void;
  onCancel: () => void;
}

/** The ride-together agreement on the map: waiting for an answer, then who is
    coming, how far away they are and the next step (call, chat, "I'm here"). */
export function AgreedRideCard({ mode, userLoc, locate, onCall, onChat, onArrived, onCancel }: AgreedRideCardProps) {
  const agreement = useAgreement();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!agreement) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, [agreement]);
  if (!agreement) return null;
  const { peer, status } = agreement;
  const first = peer.name.split(' ')[0];
  const color = partyColor(peer.type);

  if (status === 'pending') {
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 16,
        background: T.glass2, backdropFilter: 'blur(20px)', border: `1px solid ${T.amber}45`, pointerEvents: 'auto',
        boxShadow: '0 8px 28px rgba(0,0,0,.45)', animation: 'fadeUp .3s ease both' }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: T.amber, animation: 'pulse 1.1s ease infinite', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13.5, color: T.text, lineHeight: 1.4 }}>{t('agree.pending', { name: first })}</span>
        <button onClick={onCancel} aria-label={t('agree.cancel')} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
    );
  }

  const pos = locate(peer.id) || peer.latlng;
  const km = userLoc && pos ? haversineKm(userLoc, pos) : null;
  // The driver travels to the passenger: a passenger sees "coming to you".
  const headline = mode === 'passenger' ? t('agree.comingToYou', { name: first }) : t('agree.youGoTo', { name: first });
  const iconBtn = (label: string, glyph: string, onClick: () => void) => (
    <button onClick={onClick} aria-label={label} title={label} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      border: `1px solid ${T.border}`, background: T.surface2, cursor: 'pointer', fontSize: 17,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{glyph}</button>
  );

  return (
    <div role="region" aria-label={t('agree.agreedTitle')} style={{ padding: '12px 14px', borderRadius: 18, pointerEvents: 'auto',
      background: T.glass2, backdropFilter: 'blur(20px)', border: `1px solid ${T.green}45`,
      boxShadow: '0 8px 28px rgba(0,0,0,.5)', animation: 'fadeUp .3s ease both', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: peer.type === 'driver' ? 13 : 22, background: color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
          <RoleGlyph type={peer.type} size={20} color="#fff" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.green }}>{t('agree.agreedTitle')}</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{headline}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>
            {[peer.vehicle, km != null ? t('agree.away', { km: km.toFixed(1), min: Math.max(1, Math.round(km / 0.4)) }) : null]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      {status === 'arrived' ? (
        <div role="status" style={{ fontSize: 13, color: T.green, lineHeight: 1.4 }}>✓ {t('agree.arrivedSent', { name: first })}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {iconBtn(t('common.call'), '📞', () => onCall(peer))}
        {iconBtn(t('common.chat'), '💬', () => onChat(peer))}
        {status !== 'arrived' && (
          <button onClick={onArrived} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 'none', background: T.green,
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('agree.arrivedBtn')}</button>
        )}
        {status === 'arrived' && <div style={{ flex: 1 }} />}
        {iconBtn(t('agree.cancel'), '✕', onCancel)}
      </div>
    </div>
  );
}
