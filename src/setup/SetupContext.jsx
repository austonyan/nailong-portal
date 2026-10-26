import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const SetupContext = createContext(null);

// First-run setup state, fetched once at boot. `required` drives the global
// route gate: while true every route except /setup is redirected there.
export function SetupProvider({ children }) {
  const [state, setState] = useState({ loading: true, required: false, completedAt: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/setup/status');
      const next = {
        loading: false,
        required: !!data.required,
        completedAt: data.completedAt ?? null,
      };
      setState(next);
      return next;
    } catch {
      // A status failure must not brick the portal: fall back to the normal
      // auth screens, which surface their own network errors.
      setState({ loading: false, required: false, completedAt: null });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useSetup() {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used within SetupProvider');
  return ctx;
}