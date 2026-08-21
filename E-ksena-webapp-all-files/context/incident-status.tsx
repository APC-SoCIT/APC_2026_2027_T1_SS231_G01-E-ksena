import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { IncidentStatus } from '@/lib/incidents';

type StatusMap = Record<string, IncidentStatus>;

type IncidentStatusContextValue = {
  getStatus: (id: string) => IncidentStatus | undefined;
  setStatus: (id: string, status: IncidentStatus) => void;
};

const IncidentStatusContext = createContext<IncidentStatusContextValue | null>(null);

export function IncidentStatusProvider({ children }: { children: ReactNode }) {
  const [statusMap, setStatusMap] = useState<StatusMap>({});

  const getStatus = useCallback(
    (id: string) => statusMap[id],
    [statusMap]
  );

  const setStatus = useCallback((id: string, status: IncidentStatus) => {
    setStatusMap((prev) => ({ ...prev, [id]: status }));
  }, []);

  return (
    <IncidentStatusContext.Provider value={{ getStatus, setStatus }}>
      {children}
    </IncidentStatusContext.Provider>
  );
}

export function useIncidentStatus(): IncidentStatusContextValue {
  const ctx = useContext(IncidentStatusContext);
  if (!ctx) {
    throw new Error('useIncidentStatus must be used within IncidentStatusProvider');
  }
  return ctx;
}