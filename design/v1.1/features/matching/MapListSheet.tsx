import { useEffect, useState } from 'react';
import { T, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { MapSheet, RoleGlyph } from '@/components/ui/MapSheet';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useStoreEvent } from '@/hooks/useStoreEvent';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import type { PartyType } from '@/models';
import { byMatchThenDistance } from './types';
import type { MapPerson } from './types';

interface MapListSheetProps {
  mode: PartyType;
  /** Snapshot of the people on the map (re-read while the list is open). */
  read: () => MapPerson[];
  onOpen: (id: string) => void;
  onSeeBoard: () => void;
  onClose: () => void;
}

/** The map's people as a list — best match first, then nearest. */
export function MapListSheet({ mode, read, onOpen, onSeeBoard, onClose }: MapListSheetProps) {
  useBackHandler(onClose);
  const blocked = useStoreEvent(BLOCK_EVENT, blockStore.list);
  const [people, setPeople] = useState<MapPerson[]>(() => read());
  useEffect(() => {
    const id = setInterval(() => setPeople(read()), 1500);
    return () => clearInterval(id);
  }, [read]);
  const list = people.filter((p) => !blocked.includes(String(p.id))).sort(byMatchThenDistance);
  return (
    <MapSheet title={mode === 'driver' ? t('mapx.listTitlePassengers') : t('mapx.listTitleDrivers')}
      sub={t('mapx.listSorted')} onClose={onClose}>
      {list.length === 0 ? (
        <div style={{ padding: '28px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 14.5, color: T.muted }}>{t('mapx.listEmpty')}</div>
          <button onClick={() => { onClose(); onSeeBoard(); }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12,
            border: `1px solid ${T.teal}55`, background: T.tealDim, color: T.teal, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{t('mapx.seeBoard')}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((p) => {
            const color = p.color || partyColor(p.type);
            return (
              <button key={p.id} onClick={() => { onClose(); onOpen(p.id); }} style={{ display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', minHeight: 64, padding: '10px 12px', borderRadius: 15, border: `1px solid ${T.border}`,
                background: T.surface2, cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans,sans-serif' }}>
                <span style={{ width: 42, height: 42, borderRadius: p.type === 'driver' ? 12 : 21, background: color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                  <RoleGlyph type={p.type} size={19} color="#fff" />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 12.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[p.vehicle || (p.type === 'driver' ? t('common.driver') : t('common.passenger')),
                      p.type === 'driver' && p.seats ? t('popup.seatsFree', { n: p.seats }) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  {p.match != null && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.green, background: `${T.green}1c`, borderRadius: 7, padding: '2px 7px' }}>{p.match}%</span>
                  )}
                  <span style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{p.dist}</span>
                  <span style={{ fontSize: 11.5, color: T.muted }}>{p.eta}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </MapSheet>
  );
}
