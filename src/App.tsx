import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { EventPage } from '@/pages/EventPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { TicketPage } from '@/pages/TicketPage';
import { AdminPage } from '@/pages/AdminPage';
import { ScanPage } from '@/pages/ScanPage';
import { ScanLoginPage } from '@/pages/ScanLoginPage';
import { DevStateSwitcher } from '@/components/DevStateSwitcher';
import { PurchaseState, TicketStatus, CheckInResult } from '@/types/ticketing';
import { IS_DEV } from '@/lib/dev-mode';
import { BrandThemeStyle } from '@/lib/theme';

export default function App() {
  const [forcedPurchaseState, setForcedPurchaseState] = useState<PurchaseState | undefined>(
    undefined
  );
  const [forcedTicketStatus, setForcedTicketStatus] = useState<TicketStatus | undefined>(
    undefined
  );
  const [forcedScanResult, setForcedScanResult] = useState<CheckInResult | undefined>(
    undefined
  );

  return (
    <BrowserRouter>
      {/* Brand custom properties, derived from event.config.ts. */}
      <BrandThemeStyle />
      <Routes>
        <Route path="/" element={<EventPage />} />
        <Route
          path="/checkout"
          element={
            <CheckoutPage
              forcedState={forcedPurchaseState}
              onResetForcedState={() => setForcedPurchaseState(undefined)}
            />
          }
        />
        <Route
          path="/ticket"
          element={<TicketPage forcedStatus={forcedTicketStatus} />}
        />
        <Route
          path="/ticket/:reference"
          element={<TicketPage forcedStatus={forcedTicketStatus} />}
        />
        <Route path="/admin" element={<AdminPage />} />
        <Route
          path="/scan"
          element={
            <ScanPage
              forcedResult={forcedScanResult}
              onClearForcedResult={() => setForcedScanResult(undefined)}
            />
          }
        />
        <Route path="/scan/login" element={<ScanLoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Floating State Switcher for Visual QA / Design Evaluation.
          DEV ONLY — this must never reach a real buyer. It also keeps the
          mock fixtures out of the production bundle. */}
      {IS_DEV && (
        <DevStateSwitcher
          forcedPurchaseState={forcedPurchaseState}
          onSelectPurchaseState={setForcedPurchaseState}
          forcedTicketStatus={forcedTicketStatus}
          onSelectTicketStatus={setForcedTicketStatus}
          forcedScanResult={forcedScanResult}
          onSelectScanResult={setForcedScanResult}
        />
      )}
    </BrowserRouter>
  );
}
