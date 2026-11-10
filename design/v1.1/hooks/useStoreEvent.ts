import { useEffect, useState } from 'react';

/** Re-reads a localStorage-backed store whenever it announces `event` (see
    utils/storage `notifyStoreChange`), so components stay in sync with it. */
export function useStoreEvent<T>(event: string, read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(event, sync);
    return () => window.removeEventListener(event, sync);
  }, [event]); // eslint-disable-line react-hooks/exhaustive-deps -- `read` is a stable store accessor
  return value;
}
