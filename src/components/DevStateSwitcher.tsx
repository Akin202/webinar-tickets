import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Wrench,
  RotateCcw,
  QrCode,
  CreditCard,
  Ticket as TicketIcon,
} from 'lucide-react';
import { PurchaseState, TicketStatus, CheckInResult } from '@/types/ticketing';
import { mockOrders, mockTickets } from '@/lib/mock-data';

export interface DevStateSwitcherProps {
  forcedPurchaseState?: PurchaseState;
  onSelectPurchaseState: (state?: PurchaseState) => void;
  forcedTicketStatus?: TicketStatus;
  onSelectTicketStatus: (status?: TicketStatus) => void;
  forcedScanResult?: CheckInResult;
  onSelectScanResult: (result?: CheckInResult) => void;
}

export const DevStateSwitcher: React.FC<DevStateSwitcherProps> = ({
  forcedPurchaseState,
  onSelectPurchaseState,
  forcedTicketStatus,
  onSelectTicketStatus,
  forcedScanResult,
  onSelectScanResult,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isCheckout = location.pathname.startsWith('/checkout');
  const isTicket = location.pathname.startsWith('/ticket');
  const isScan = location.pathname.startsWith('/scan');
  const isAdmin = location.pathname.startsWith('/admin');

  const purchaseStates: { label: string; state: PurchaseState }[] = [
    { label: 'Idle (Standard Form)', state: { status: 'idle' } },
    { label: 'Validating (Submitting)', state: { status: 'validating' } },
    {
      label: 'Redirecting (Paystack Interstitial)',
      state: { status: 'redirecting', authorizationUrl: '#' },
    },
    { label: 'Confirming (Payment Interstitial)', state: { status: 'confirming' } },
    {
      label: 'Success (Order Confirmed)',
      state: {
        status: 'success',
        order: mockOrders[0],
        tickets: mockTickets.filter((t) => t.orderId === mockOrders[0].id),
      },
    },
    { label: 'Sold Out (Capacity Reached)', state: { status: 'sold_out' } },
    { label: 'Sales Closed (Ended)', state: { status: 'sales_closed' } },
    {
      label: 'Error (Payment Failed)',
      state: {
        status: 'error',
        message: 'The bank declined the card transaction. Please try again.',
      },
    },
  ];

  const ticketStatuses: { label: string; status: TicketStatus }[] = [
    { label: 'Valid (Admit One)', status: 'valid' },
    { label: 'Checked In / Admitted', status: 'checked_in' },
    { label: 'Void / Cancelled', status: 'void' },
  ];

  const scanResults: { label: string; result: CheckInResult }[] = [
    {
      label: 'Admitted (Green)',
      result: {
        kind: 'admitted',
        ticket: mockTickets[0],
        admittedCount: 143,
      },
    },
    {
      label: 'Already Scanned (Red)',
      result: {
        kind: 'already_used',
        ticket: mockTickets[1],
        firstScannedAt: '2026-08-25T23:45:00Z',
        firstScannedBy: 'Gate Door Lead (Emeka)',
      },
    },
    {
      label: 'Not Found (Dark Red)',
      result: {
        kind: 'not_found',
        scannedCode: 'UNRECOGNIZED-FAKE-QR-88912',
      },
    },
    {
      label: 'Voided (Red)',
      result: {
        kind: 'voided',
        ticket: { ...mockTickets[2], status: 'void' },
      },
    },
    {
      label: 'Unpaid (Amber)',
      result: {
        kind: 'unpaid',
        ticket: mockTickets[3] || mockTickets[0],
      },
    },
  ];

  const hasActiveOverride =
    forcedPurchaseState !== undefined ||
    forcedTicketStatus !== undefined ||
    forcedScanResult !== undefined;

  return (
    <aside aria-label="Dev Switcher" className="fixed bottom-4 right-4 z-50">
      {/* Floating Toggle Button */}
      {!isOpen ? (
        <button
          type="button"
          id="dev-switcher-toggle"
          onClick={() => setIsOpen(true)}
          className={`min-h-[44px] px-3.5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 border ${
            hasActiveOverride
              ? 'bg-amber-500 text-black border-amber-400 animate-bounce'
              : 'bg-[#111319] text-white border-slate-700 hover:border-emerald-500'
          }`}
        >
          <Wrench className="w-4 h-4 text-emerald-400" />
          <span>Dev Switcher</span>
          {hasActiveOverride && (
            <span className="w-2 h-2 rounded-full bg-black" />
          )}
        </button>
      ) : (
        /* Expanded Drawer */
        <div
          id="dev-switcher-panel"
          className="w-80 sm:w-96 rounded-2xl bg-[#0f1219] border border-slate-700 shadow-2xl p-4 text-white space-y-3.5 max-h-[85vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  State Harness
                </h4>
                <p className="text-[10px] text-slate-400">Test every branch & edge case</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {hasActiveOverride && (
                <button
                  type="button"
                  title="Reset all forced states"
                  onClick={() => {
                    onSelectPurchaseState(undefined);
                    onSelectTicketStatus(undefined);
                    onSelectScanResult(undefined);
                  }}
                  className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">Reset</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Route Jumps */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                navigate('/checkout');
                setIsOpen(false);
              }}
              className={`p-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all ${
                isCheckout ? 'bg-emerald-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Checkout</span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigate('/ticket/ENG26-TX-882194');
                setIsOpen(false);
              }}
              className={`p-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all ${
                isTicket ? 'bg-emerald-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <TicketIcon className="w-3.5 h-3.5" />
              <span>Ticket</span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigate('/scan');
                setIsOpen(false);
              }}
              className={`p-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all ${
                isScan ? 'bg-emerald-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scanner</span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigate('/admin');
                setIsOpen(false);
              }}
              className={`p-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all ${
                isAdmin ? 'bg-emerald-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span>Admin</span>
            </button>
          </div>

          {/* Section 1: Checkout & Paystack States */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              1. Checkout / Purchase States
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {purchaseStates.map((item, idx) => {
                const isActive = forcedPurchaseState?.status === item.state.status;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectPurchaseState(item.state);
                      if (!isCheckout) navigate('/checkout');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-semibold text-left transition-all border ${
                      isActive
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Ticket Card Statuses */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              2. Issued Ticket Card Status
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {ticketStatuses.map((item, idx) => {
                const isActive = forcedTicketStatus === item.status;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectTicketStatus(item.status);
                      if (!isTicket) navigate('/ticket/ENG26-TX-882194');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-semibold text-center transition-all border ${
                      isActive
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Door Scanner Overlays */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              3. Door Scanner Gate Scenarios
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {scanResults.map((item, idx) => {
                const isActive = forcedScanResult?.kind === item.result.kind;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectScanResult(item.result);
                      if (!isScan) navigate('/scan');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-semibold text-left transition-all border ${
                      isActive
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
