import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data with loading/error state. `reload()` refetches; stale responses are ignored. */
export function useApi(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn()
      .then((data) => {
        if (id === seq.current) setState({ data, error: null, loading: false });
        return data;
      })
      .catch((error) => {
        if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
