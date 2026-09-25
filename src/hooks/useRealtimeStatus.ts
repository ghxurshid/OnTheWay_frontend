import { useEffect, useState } from 'react';
import { USE_MOCKS } from '@/api/client';
import { presenceClient } from '@/services/realtime';
import type { HubStatus } from '@/services/realtime/hubConnection';

/** Health of the live (presence) connection, for the "Live" indicator and
    the offline notice. Demo mode has no hub and is always "connected". */
export function useRealtimeStatus(): HubStatus {
  const [status, setStatus] = useState<HubStatus>(() => (USE_MOCKS ? 'connected' : presenceClient.status()));
  useEffect(() => (USE_MOCKS ? undefined : presenceClient.onStatus(setStatus)), []);
  return status;
}
