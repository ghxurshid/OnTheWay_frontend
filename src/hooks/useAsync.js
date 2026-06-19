import { useState, useEffect, useCallback } from 'react';

/**
 * Run an async loader and expose { data, loading, error, reload }.
 * `loader` should be stable (wrap in useCallback) or listed in `deps`.
 * Guards against setting state after unmount.
 */
export function useAsync(loader, deps = [], initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(loader)
      .then((res) => { if (alive) { setData(res); setLoading(false); } })
      .catch((err) => { if (alive) { setError(err); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);

  return { data, loading, error, reload: run };
}
