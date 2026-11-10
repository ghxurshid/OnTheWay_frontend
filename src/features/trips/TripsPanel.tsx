import { useState } from 'react';
import { t } from '@/i18n';
import { Segmented } from '@/components/ui/Segmented';
import { HistoryPanel } from '@/features/history/HistoryPanel';
import { MyTripsList } from './MyTripsScreen';

/** "My trips" in the bottom bar: what I published (planned), what I rode
    (history) and the numbers (statistics) — one place instead of three. */
export function TripsPanel({ onChanged }: { onChanged?: (openCount: number) => void }) {
  const [tab, setTab] = useState('planned');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Segmented value={tab} onChange={setTab} pad={10} style={{ margin: '12px 16px 0', flexShrink: 0 }}
        options={[{ id: 'planned', label: t('trips.tabPlanned') }, { id: 'history', label: t('trips.tabHistory') },
          { id: 'stats', label: t('trips.tabStats') }]} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'planned' && <MyTripsList onChanged={onChanged} />}
        {tab === 'history' && <HistoryPanel view="history" />}
        {tab === 'stats' && <HistoryPanel view="dashboard" />}
      </div>
    </div>
  );
}
