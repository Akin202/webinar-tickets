'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { PurchaseState, TicketStatus, CheckInResult } from '@/types/ticketing';
import dynamic from 'next/dynamic';

/**
 * Loaded through a dead-code-eliminable branch rather than a static import.
 * A plain `IS_DEV && <DevStateSwitcher />` keeps the static import alive in
 * the module graph, so the switcher (and the mock fixtures it pulls in)
 * shipped to production. Inlining the NODE_ENV comparison lets the bundler
 * prove the import() unreachable and drop it entirely.
 */
const DevStateSwitcher = dynamic(
  () => import('@/components/DevStateSwitcher').then((m) => m.DevStateSwitcher),
  { ssr: false }
);

/**
 * Replaces the state the old Vite App.tsx lifted above <Routes>. App Router
 * has no shared component parent across routes, so the forced-state plumbing
 * for the dev switcher lives in a context mounted from the root layout.
 *
 * DEV ONLY. In production the provider renders its children untouched and the
 * default no-op context keeps `useDevState()` safe to call from any page.
 */
interface DevStateContextValue {
  forcedPurchaseState?: PurchaseState;
  setForcedPurchaseState: (state?: PurchaseState) => void;
  forcedTicketStatus?: TicketStatus;
  setForcedTicketStatus: (status?: TicketStatus) => void;
  forcedScanResult?: CheckInResult;
  setForcedScanResult: (result?: CheckInResult) => void;
}

const noop = () => {};

const DevStateContext = createContext<DevStateContextValue>({
  setForcedPurchaseState: noop,
  setForcedTicketStatus: noop,
  setForcedScanResult: noop,
});

export const useDevState = () => useContext(DevStateContext);

export const DevStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [forcedPurchaseState, setForcedPurchaseState] = useState<PurchaseState | undefined>();
  const [forcedTicketStatus, setForcedTicketStatus] = useState<TicketStatus | undefined>();
  const [forcedScanResult, setForcedScanResult] = useState<CheckInResult | undefined>();

  const value = useMemo(
    () => ({
      forcedPurchaseState,
      setForcedPurchaseState,
      forcedTicketStatus,
      setForcedTicketStatus,
      forcedScanResult,
      setForcedScanResult,
    }),
    [forcedPurchaseState, forcedTicketStatus, forcedScanResult]
  );

  if (process.env.NODE_ENV === 'production' || !DevStateSwitcher) {
    return <>{children}</>;
  }

  return (
    <DevStateContext.Provider value={value}>
      {children}
      <DevStateSwitcher
        forcedPurchaseState={forcedPurchaseState}
        onSelectPurchaseState={setForcedPurchaseState}
        forcedTicketStatus={forcedTicketStatus}
        onSelectTicketStatus={setForcedTicketStatus}
        forcedScanResult={forcedScanResult}
        onSelectScanResult={setForcedScanResult}
      />
    </DevStateContext.Provider>
  );
};
