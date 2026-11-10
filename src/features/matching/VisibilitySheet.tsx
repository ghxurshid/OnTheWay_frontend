import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { MapSheet } from '@/components/ui/MapSheet';
import { useBackHandler } from '@/hooks/useBackHandler';
import type { PartyType } from '@/models';
import type { Visibility } from './MapUI';
import { visibilityLook } from './format';

interface VisibilitySheetProps {
  mode: PartyType;
  visibility: Visibility;
  freeMode: boolean;
  routeActive: boolean;
  banded: boolean;
  canBand: boolean;
  onToggleFreeMode: () => void;
  onToggleBanded: () => void;
  onAddRoute: () => void;
  onClose: () => void;
}

/** "Who can see you?" — the current discoverability state, what it means and
    the switches that change it (Available driver, Full). */
export function VisibilitySheet({ mode, visibility, freeMode, routeActive, banded, canBand,
  onToggleFreeMode, onToggleBanded, onAddRoute, onClose }: VisibilitySheetProps) {
  useBackHandler(onClose);
  const { tone, label } = visibilityLook(visibility);
  const body = visibility === 'busy' ? t('status.busyBody')
    : visibility === 'visible' ? (freeMode && !routeActive ? t('status.visibleFree') : t('status.visibleRoute'))
      : mode === 'driver' ? t('status.hiddenDriver') : t('status.hiddenPassenger');
  const hidden = visibility === 'hidden-driver' || visibility === 'hidden-passenger';
  return (
    <MapSheet title={t('status.title')} onClose={onClose}>
      <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px',
        borderRadius: 16, background: `${tone}14`, border: `1px solid ${tone}40`, marginBottom: 14 }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: tone, marginTop: 4, flexShrink: 0,
          boxShadow: `0 0 0 4px ${tone}25` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{label}</div>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{body}</div>
        </div>
      </div>
      {hidden && !routeActive && (
        <button onClick={() => { onClose(); onAddRoute(); }} style={{ width: '100%', minHeight: 48, borderRadius: 14,
          border: 'none', background: T.teal, color: '#04201e', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'DM Sans,sans-serif', marginBottom: 14 }}>{t('status.addRoute')}</button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ToggleRow label={t('drawer.freeMode')} sub={mode === 'driver' ? t('drawer.freeModeSub') : t('drawer.freeModePassenger')}
          checked={mode === 'driver' && freeMode} disabled={mode !== 'driver'} onToggle={onToggleFreeMode}
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="9" r="2.4" stroke={T.teal} strokeWidth="1.6" /><path d="M10 11.4v3M4.5 9a5.5 5.5 0 0111 0" stroke={T.teal} strokeWidth="1.6" strokeLinecap="round" /></svg>} />
        <ToggleRow label={t('drawer.busy')} sub={!canBand ? t('drawer.busyNoTrip') : (banded ? t('drawer.busyOn') : t('drawer.busyOff'))}
          checked={canBand && banded} disabled={!canBand} accent={T.red} onToggle={onToggleBanded}
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke={T.red} strokeWidth="1.6" opacity=".45" /><path d="M5.4 5.4l9.2 9.2" stroke={T.red} strokeWidth="1.7" strokeLinecap="round" /></svg>} />
      </div>
    </MapSheet>
  );
}
