'use client';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  PlusCircle,
  QrCode,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Send,
  Ban,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpDown,
  Lock,
  Unlock,
  Mail,
  DollarSign,
} from 'lucide-react';
import {
  getSalesSummary,
  listOrders,
  listTickets,
  voidTicket,
  issueComplimentaryTicket,
  exportOrdersCsv,
  setSalesOpen,
  resendTicketEmail,
  setTicketPrice,
  previewCampaignRecipients,
  sendCampaignTest,
  createEmailCampaign,
  listEmailCampaigns,
  processEmailCampaign,
} from '@/lib/data-access';
import {
  Order,
  OrderStatus,
  Ticket,
  SalesSummary,
  koboToNaira,
  normaliseNgPhone,
  formatPhoneForDisplay,
  EmailCampaign,
  EmailCampaignKind,
  EmailCampaignAudience,
} from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';

/**
 * Paystack's `channel` values, spelled out. An unmapped key renders raw
 * rather than being dropped — a channel we have not seen before is exactly
 * the thing worth noticing in reconciliation.
 */
const CHANNEL_LABELS: Record<string, string> = {
  card: 'Debit card',
  bank: 'Bank account',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  qr: 'QR',
  mobile_money: 'Mobile money',
  eft: 'EFT',
  unknown: 'Not recorded',
};

/** The four columns the table can order by. */
type SortableOrderKey = 'reference' | 'buyerName' | 'totalKobo' | 'createdAt';

/** Keystrokes settle for this long before the buyer list is queried. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * A sortable column heading.
 *
 * Was a bare `<th onClick>`: unreachable by keyboard, invisible to a screen
 * reader, and with no indication of which column was active or in which
 * direction. `aria-sort` on the cell plus a real button fixes all three.
 */
function SortHeader({
  label,
  columnKey,
  activeKey,
  direction,
  defaultDirection = 'asc',
  onSort,
  className = '',
}: {
  label: string;
  columnKey: SortableOrderKey;
  activeKey: SortableOrderKey;
  direction: 'asc' | 'desc';
  defaultDirection?: 'asc' | 'desc';
  onSort: (key: SortableOrderKey, direction: 'asc' | 'desc') => void;
  className?: string;
}) {
  const isActive = activeKey === columnKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-0 px-0 ${className}`}
    >
      <button
        type="button"
        onClick={() =>
          onSort(
            columnKey,
            isActive ? (direction === 'asc' ? 'desc' : 'asc') : defaultDirection
          )
        }
        className="w-full h-full py-2.5 px-3 flex items-center gap-1 text-left uppercase tracking-wider font-semibold hover:bg-gray-200/60"
      >
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${isActive ? 'text-gray-900' : 'text-gray-400'}`} />
        {isActive && (
          <span className="text-[9px] font-mono text-gray-600">
            {direction === 'asc' ? 'ASC' : 'DESC'}
          </span>
        )}
      </button>
    </th>
  );
}

export const AdminPage: React.FC = () => {
  // Stats & Dashboard state
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // Filters & Sorting
  // Two search values on purpose: `searchInput` is what the admin is typing,
  // `search` is what the server has been asked about. Bound together they
  // fired a query per keystroke against the full buyer list.
  const [searchInput, setSearchInput] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortableOrderKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Row Expansion State. Tickets arrive with loadData, so expanding a row
  // needs no fetch and therefore has no loading state of its own.
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);

  // Modal Dialogs
  const [isCompModalOpen, setIsCompModalOpen] = useState<boolean>(false);
  const [compName, setCompName] = useState<string>('');
  const [compPhone, setCompPhone] = useState<string>('');

  const [isCloseSalesModalOpen, setIsCloseSalesModalOpen] = useState<boolean>(false);
  const [salesToggleBusy, setSalesToggleBusy] = useState<boolean>(false);
  const [voidModalTicket, setVoidModalTicket] = useState<{ id: string; code: string } | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  /** Reference currently being emailed, so the button cannot be double-fired. */
  const [resendingRef, setResendingRef] = useState<string | null>(null);
  const [priceNaira, setPriceNaira] = useState('');
  const [pendingPriceKobo, setPendingPriceKobo] = useState<number | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [campaignKind, setCampaignKind] = useState<EmailCampaignKind>('essential');
  const [campaignAudience, setCampaignAudience] = useState<EmailCampaignAudience>('all_paid');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignCount, setCampaignCount] = useState<number | null>(null);
  const [campaignTestOnly, setCampaignTestOnly] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [previewMobile, setPreviewMobile] = useState(false);

  /**
   * Guards against out-of-order responses. Typing "ade" fires three queries;
   * if the one for "ad" lands after the one for "ade", the table shows
   * results for a string the admin is no longer looking at. Only the newest
   * request is allowed to write state.
   */
  const requestSeqRef = React.useRef(0);

  // Fetch summary and orders. Deliberately NOT keyed on sort — sorting is
  // applied to the page already in hand (see visibleOrders), so it must not
  // cost a round trip against the buyer list.
  const loadData = React.useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [sumData, ordersData, ticketsData] = await Promise.all([
        getSalesSummary(),
        listOrders({
          query: search,
          status: statusFilter === 'all' ? undefined : statusFilter,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        listTickets(),
      ]);
      if (seq !== requestSeqRef.current) return;
      setSummary(sumData);
      setOrders(ordersData.orders);
      setTotalCount(ordersData.total);
      setAllTickets(ticketsData);
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load admin records.');
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void listEmailCampaigns().then(setCampaigns).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void previewCampaignRecipients({ kind: campaignKind, audience: campaignAudience })
        .then((count) => { if (!cancelled) setCampaignCount(count); })
        .catch(() => { if (!cancelled) setCampaignCount(null); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [campaignKind, campaignAudience]);

  // Settle the keystrokes before querying. Every one of these requests reads
  // ~400 people's names, emails and phone numbers, and the export route is
  // not the only one worth being frugal with.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /**
   * The page in hand, ordered. Sorting a single page client-side is honest
   * about what it does: the header reorders the 50 rows on screen, it does
   * not re-rank the whole table. Server-side ordering would need a param
   * `listOrders` does not have, and its signature is a frozen contract.
   */
  const visibleOrders = React.useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...orders].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av ?? '').localeCompare(String(bv ?? '')) * factor;
    });
  }, [orders, sortBy, sortDir]);

  const handleSort = (key: SortableOrderKey, direction: 'asc' | 'desc') => {
    setSortBy(key);
    setSortDir(direction);
  };

  const triggerNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Toggle Row Expansion. `allTickets` is already loaded by loadData, so
  // expanding a row is pure UI — it used to re-download every ticket in the
  // event on each click, which on event night is a full manifest fetch per
  // curious tap.
  const handleToggleRow = (orderId: string) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
  };

  // Resend a buyer's ticket email. The toast reports what the server actually
  // did — this button used to claim success without sending anything, which
  // is the worst possible failure for a support action: the organiser tells
  // the buyer "I've resent it" and stops looking.
  const handleResend = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (resendingRef === order.reference) return;
    setResendingRef(order.reference);
    try {
      await resendTicketEmail(order.reference);
      triggerNotice(`Ticket link sent to ${order.buyerEmail}`);
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Could not send that email.');
    } finally {
      setResendingRef(null);
    }
  };

  // Void ticket handler
  // Closing sales stops ALL revenue, so it is confirmed; re-opening is not.
  const handleSetSalesOpen = async (open: boolean) => {
    setSalesToggleBusy(true);
    try {
      await setSalesOpen(open);
      triggerNotice(open ? 'Ticket sales re-opened.' : 'Ticket sales closed.');
      setIsCloseSalesModalOpen(false);
      await loadData();
    } catch {
      triggerNotice('Failed to change sales status.');
    } finally {
      setSalesToggleBusy(false);
    }
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalTicket || !voidReason.trim()) return;
    try {
      await voidTicket(voidModalTicket.id, voidReason);
      triggerNotice(`Ticket ${voidModalTicket.code} has been voided.`);
      setVoidModalTicket(null);
      setVoidReason('');
      loadData();
    } catch {
      triggerNotice('Failed to void ticket.');
    }
  };

  // Issue complimentary ticket handler
  const handleIssueComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;
    try {
      const ticket = await issueComplimentaryTicket({
        holderName: compName,
        holderPhone: compPhone.trim() ? normaliseNgPhone(compPhone) : null,
      });
      triggerNotice(`VIP Pass ${ticket.code} issued to ${ticket.holderName}`);
      setIsCompModalOpen(false);
      setCompName('');
      setCompPhone('');
      loadData();
    } catch {
      triggerNotice('Failed to issue complimentary ticket.');
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const csvData = await exportOrdersCsv();
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `signout_orders_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      triggerNotice('Failed to export CSV.');
    }
  };

  const requestPriceChange = () => {
    const value = Number(priceNaira);
    const kobo = Math.round(value * 100);
    if (!Number.isFinite(value) || kobo < 100 || kobo > 100_000_000 || Math.abs(value * 100 - kobo) > 0.001) {
      triggerNotice('Enter a price from ₦1 to ₦1,000,000 with at most two decimals.');
      return;
    }
    setPendingPriceKobo(kobo);
  };

  const confirmPriceChange = async () => {
    if (pendingPriceKobo === null) return;
    setPriceBusy(true);
    try {
      await setTicketPrice(pendingPriceKobo);
      triggerNotice(`Ticket price changed to ${koboToNaira(pendingPriceKobo)}.`);
      setPriceNaira(''); setPendingPriceKobo(null); await loadData();
    } catch (err) { triggerNotice(err instanceof Error ? err.message : 'Could not update price.'); }
    finally { setPriceBusy(false); }
  };

  const handleTestCampaign = async () => {
    setCampaignBusy(true);
    try {
      await sendCampaignTest({ kind: campaignKind, subject: campaignSubject, message: campaignMessage, email: testEmail });
      triggerNotice(`Test email sent to ${testEmail}.`);
    } catch (err) { triggerNotice(err instanceof Error ? err.message : 'Test email failed.'); }
    finally { setCampaignBusy(false); }
  };

  const handleSendCampaign = async () => {
    // Name the single address rather than a count, so a test send and a send to
    // the whole paid audience can never read the same in the confirm dialog.
    const confirmation = campaignTestOnly
      ? `Send this ${campaignKind} email to ${testEmail} ONLY? This is a real campaign, limited to one recipient.`
      : `Send this ${campaignKind} email to ${campaignCount ?? 0} unique recipients?`;
    if (!window.confirm(confirmation)) return;
    setCampaignBusy(true);
    try {
      let campaign = await createEmailCampaign({ kind: campaignKind, audience: campaignAudience,
        subject: campaignSubject, message: campaignMessage,
        testEmail: campaignTestOnly ? testEmail : undefined });
      // Each call drains at most 100 persisted recipients; continue until terminal.
      while (campaign.status === 'draft' || campaign.status === 'sending') {
        campaign = await processEmailCampaign(campaign.id);
      }
      setCampaigns(await listEmailCampaigns());
      // Keep the draft after a test send — the whole point is to check it and
      // then send the same copy for real. Only clear on the real send.
      if (!campaignTestOnly) { setCampaignSubject(''); setCampaignMessage(''); }
      triggerNotice(`Campaign finished: ${campaign.sentCount} sent, ${campaign.failedCount} failed.`);
    } catch (err) { triggerNotice(err instanceof Error ? err.message : 'Campaign send failed. Resume it from history.');
      void listEmailCampaigns().then(setCampaigns).catch(() => {}); }
    finally { setCampaignBusy(false); }
  };

  const retryCampaign = async (id: string) => {
    setCampaignBusy(true);
    try {
      let campaign = await processEmailCampaign(id, true);
      while (campaign.status === 'sending') campaign = await processEmailCampaign(id);
      setCampaigns(await listEmailCampaigns());
      triggerNotice(`Retry finished: ${campaign.sentCount} sent, ${campaign.failedCount} failed.`);
    } catch (err) { triggerNotice(err instanceof Error ? err.message : 'Could not resume campaign.'); }
    finally { setCampaignBusy(false); }
  };

  // Real counts from summary.byChannel. This block used to be four hardcoded
  // percentages that added to 100 and described nothing — the genuine
  // byChannel figures were fetched on the line above and thrown away, so the
  // dashboard invented a payment mix for an event that had sold no tickets.
  const channelTotal = Object.values(summary?.byChannel ?? {}).reduce((s, n) => s + n, 0);
  const channelBreakdown = Object.entries(summary?.byChannel ?? {})
    .map(([key, count]) => ({
      key,
      name: CHANNEL_LABELS[key] ?? key,
      count,
      percent: channelTotal > 0 ? Math.round((count / channelTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="min-h-screen bg-tool-surface text-tool-ink font-sans antialiased pb-16">
      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="fixed top-4 right-4 z-50 bg-tool-ink-muted text-white text-xs font-semibold px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Top Admin Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded border border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-xs font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Public Page</span>
            </Link>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">
                Ticketing Admin
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {eventConfig.event.name} • Gate & Orders Control Panel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="admin-issue-comp-btn"
              onClick={() => setIsCompModalOpen(true)}
              className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Issue VIP Ticket</span>
            </button>

            <button
              type="button"
              id="admin-export-csv-btn"
              onClick={handleExportCSV}
              className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>Export CSV</span>
            </button>

            <Link
              href="/scan"
              id="admin-open-scanner-btn"
              className="min-h-[36px] px-3 py-1.5 bg-tool-ink-deep hover:bg-tool-ink-muted text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Door Scanner</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* ========================================================
            1. STATS ROW (SalesSummary)
        ======================================================== */}
        <section aria-label="Sales Metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Tickets Sold
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-gray-900 mt-1">
              {summary ? summary.ticketsSold : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">
              {/* capacity 0 is reachable — an admin can set it while closing
                  sales — and 0/0 renders as "NaN% of capacity". */}
              {summary && summary.capacity > 0
                ? `${Math.round((summary.ticketsSold / summary.capacity) * 100)}% of cap`
                : '— of capacity'}
            </p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Remaining
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 mt-1">
              {summary ? summary.ticketsRemaining : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">Available</p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Checked In
            </span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-blue-700 mt-1">
              {summary ? summary.ticketsCheckedIn : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">
              {summary && summary.ticketsSold > 0
                ? Math.round((summary.ticketsCheckedIn / summary.ticketsSold) * 100)
                : 0}
              % turn-up
            </p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Gross Revenue
            </span>
            <div className="text-lg sm:text-xl font-bold font-mono text-gray-900 mt-1 truncate">
              {summary ? koboToNaira(summary.grossKobo) : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">Total collected</p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 sm:col-span-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Net Revenue
            </span>
            <div className="text-lg sm:text-xl font-bold font-mono text-gray-900 mt-1 truncate">
              {summary ? koboToNaira(summary.netKobo) : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">
              After fees &amp; charges
            </p>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              {eventConfig.ticketing.serviceChargeLabel}
            </span>
            <div className="text-lg sm:text-xl font-bold font-mono text-gray-900 mt-1 truncate">
              {summary ? koboToNaira(summary.serviceChargeKobo) : '—'}
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">
              Gateway {summary ? koboToNaira(summary.gatewayFeesKobo) : '—'}
            </p>
          </div>

          <div
            className={`p-3 sm:p-4 rounded-xl border shadow-sm ${
              summary?.salesClosed
                ? 'bg-red-50 border-red-300'
                : 'bg-white border-gray-200'
            }`}
          >
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
              Ticket Sales
            </span>
            <div
              className={`text-lg sm:text-xl font-bold font-mono mt-1 ${
                summary?.salesClosed ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {summary ? (summary.salesClosed ? 'CLOSED' : 'OPEN') : '—'}
            </div>
            <button
              type="button"
              disabled={!summary || salesToggleBusy}
              onClick={() =>
                summary?.salesClosed ? handleSetSalesOpen(true) : setIsCloseSalesModalOpen(true)
              }
              className="mt-2 min-h-[36px] w-full px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            >
              {summary?.salesClosed ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Re-open</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Close</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 sm:col-span-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Current Price
            </span>
            <div className="text-lg sm:text-xl font-bold font-mono text-gray-900 mt-1">
              {summary ? koboToNaira(summary.currentPriceKobo) : '—'}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input aria-label="New ticket price in naira" inputMode="decimal" value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)} placeholder="New ₦ price"
                className="min-w-0 w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
              <button type="button" onClick={requestPriceChange} disabled={priceBusy}
                className="rounded bg-gray-900 px-2.5 text-xs font-semibold text-white disabled:opacity-50">Change</button>
            </div>
          </div>
        </section>

        {/* ========================================================
            2. CAPACITY METER & CHANNEL BREAKDOWN
        ======================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white p-5 rounded-lg border border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Venue Capacity Allocation
                </h3>
                <p className="text-[11px] text-gray-500">
                  Total Hall Capacity: {summary?.capacity || eventConfig.ticketing.capacity} Attendees
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-gray-700">
                {summary?.ticketsSold || 0} / {summary?.capacity || eventConfig.ticketing.capacity}
              </span>
            </div>

            <div className="w-full h-3 bg-gray-100 rounded overflow-hidden flex">
              <div
                style={{
                  width: `${
                    summary ? (summary.ticketsCheckedIn / summary.capacity) * 100 : 0
                  }%`,
                }}
                className="bg-blue-600 h-full"
                title="Checked In"
              />
              <div
                style={{
                  width: `${
                    summary
                      ? ((summary.ticketsSold - summary.ticketsCheckedIn) / summary.capacity) * 100
                      : 0
                  }%`,
                }}
                className="bg-emerald-500 h-full"
                title="Sold (Not Yet Checked In)"
              />
            </div>

            <div className="flex items-center gap-4 text-[11px] text-gray-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
                <span>Checked In ({summary?.ticketsCheckedIn || 0})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Unclaimed ({summary ? summary.ticketsSold - summary.ticketsCheckedIn : 0})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
                <span>Available ({summary?.ticketsRemaining || 0})</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-lg border border-gray-200 space-y-3">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Sales by Payment Channel
            </h3>
            {channelBreakdown.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                No paid orders yet — nothing to break down.
              </p>
            ) : (
              <div className="space-y-2.5">
                {channelBreakdown.map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-700 font-medium truncate">{item.name}</span>
                      {/* Order count as well as share: at these volumes "100%"
                          can mean a single order, and a percentage on its own
                          would read as a trend. */}
                      <span className="font-mono text-gray-900 font-bold ml-2 whitespace-nowrap">
                        {item.count} · {item.percent}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-slate-700 rounded"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm" aria-labelledby="campaign-heading">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="campaign-heading" className="flex items-center gap-2 font-bold text-gray-900"><Mail className="h-4 w-4" /> Email Campaigns</h2>
              <p className="text-xs text-gray-500">Compose, preview, test, and send to a snapshotted paid-buyer audience.</p></div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-bold text-gray-700">{campaignCount ?? '—'} recipients</span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-gray-700">Type
                  <select value={campaignKind} onChange={(e) => setCampaignKind(e.target.value as EmailCampaignKind)} className="mt-1 w-full rounded border border-gray-300 p-2">
                    <option value="essential">Essential event update</option><option value="marketing">Marketing (opted-in only)</option>
                  </select></label>
                <label className="text-xs font-semibold text-gray-700">Audience
                  <select value={campaignAudience} onChange={(e) => setCampaignAudience(e.target.value as EmailCampaignAudience)} className="mt-1 w-full rounded border border-gray-300 p-2">
                    <option value="all_paid">All paid buyers</option><option value="checked_in">Has checked in</option><option value="not_checked_in">Not checked in</option>
                  </select></label>
              </div>
              {campaignKind === 'essential' && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Use only for necessary information about this purchased event, not promotions.</p>}
              <input value={campaignSubject} onChange={(e) => setCampaignSubject(e.target.value)} maxLength={150} placeholder="Email subject"
                className="w-full rounded border border-gray-300 p-2.5 text-sm" />
              <textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} maxLength={10000} rows={8} placeholder="Write the message. Blank lines create paragraphs."
                className="w-full rounded border border-gray-300 p-2.5 text-sm" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Test recipient email"
                  className="min-h-10 min-w-0 flex-1 rounded border border-gray-300 px-2.5 text-sm" />
                <button type="button" disabled={campaignBusy || !testEmail || !campaignSubject || !campaignMessage} onClick={handleTestCampaign}
                  className="min-h-10 rounded border border-gray-300 px-3 text-xs font-semibold disabled:opacity-50">Send test</button>
                <button type="button" disabled={campaignBusy || (campaignTestOnly ? !testEmail : !campaignCount) || !campaignSubject || !campaignMessage} onClick={handleSendCampaign}
                  className="min-h-10 rounded bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-50">{campaignBusy ? 'Sending…' : campaignTestOnly ? 'Send to test only' : 'Review & send'}</button>
              </div>
              {/* "Send test" above proves the provider call; this proves the whole
                  batch path — campaign row, recipient rows, resume — against one
                  address. Worth doing once before any send to the real audience. */}
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <input type="checkbox" checked={campaignTestOnly} onChange={(e) => setCampaignTestOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300" />
                Send the real campaign to the test recipient only
              </label>
              {campaignTestOnly && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">
                This creates a genuine campaign and sends it to <strong>{testEmail || 'the address above'}</strong> alone. It appears in history as 1 recipient.
              </p>}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-gray-500">Preview</span>
                <button type="button" onClick={() => setPreviewMobile((v) => !v)} className="text-xs font-semibold text-blue-700">{previewMobile ? 'Desktop width' : 'Mobile width'}</button></div>
              <div className={`mx-auto min-h-72 rounded border border-gray-200 bg-gray-50 p-4 transition-[max-width] ${previewMobile ? 'max-w-[320px]' : 'max-w-full'}`}>
                <div className="rounded-lg bg-white shadow-sm overflow-hidden"><div className="bg-gray-950 p-4 text-xl font-bold text-amber-200">{eventConfig.event.tagline}</div>
                  <div className="p-4 text-sm text-gray-700"><p className="font-bold text-gray-900">{campaignSubject || 'Your subject appears here'}</p>
                    <p className="mt-4 whitespace-pre-wrap">Hi there,{`\n\n`}{campaignMessage || 'Your message preview appears here.'}</p>
                    {campaignKind === 'marketing' && <p className="mt-5 text-xs text-gray-500 underline">Unsubscribe</p>}</div></div>
              </div>
            </div>
          </div>
          {campaigns.length > 0 && <div className="mt-5 border-t border-gray-200 pt-4"><h3 className="text-xs font-bold uppercase text-gray-500">Recent campaigns</h3>
            <div className="mt-2 space-y-2">{campaigns.map((campaign) => <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-2.5 text-xs">
              <div><strong className="text-gray-900">{campaign.subject}</strong><span className="ml-2 text-gray-500">{campaign.status} · {campaign.sentCount}/{campaign.targetedCount} sent · {campaign.failedCount} failed</span></div>
              {(campaign.status === 'sending' || campaign.failedCount > 0) && <button type="button" disabled={campaignBusy} onClick={() => void retryCampaign(campaign.id)} className="font-semibold text-blue-700 disabled:opacity-50">Resume/retry</button>}
            </div>)}</div></div>}
        </section>

        {/* ========================================================
            3. ORDERS TABLE & MOBILE CARDS WITH FILTER, SORT, EXPANSION & ACTIONS
        ======================================================== */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-3.5 sm:p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/50">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px] sm:min-w-[260px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="admin-search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, phone, ref..."
                  aria-label="Search orders by name, phone or reference"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                />
              </div>

              {/* Status filter tabs */}
              <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-xs font-medium text-gray-600 overflow-x-auto">
                {(['all', 'paid', 'pending', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md capitalize text-xs transition-colors whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-gray-900 text-white font-bold'
                        : 'hover:text-gray-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-gray-500 flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
              <span className="font-medium">Showing {orders.length} of {totalCount} records</span>
              <button
                type="button"
                onClick={loadData}
                className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 active:scale-95 transition-all"
                title="Refresh Table"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* MOBILE VIEW: High-density order cards (< md screens) */}
          <div className="block md:hidden divide-y divide-gray-200">
            {loading && (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-gray-100 rounded-xl p-4 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="py-8 px-4 text-center text-red-600 bg-red-50/50">
                <AlertCircle className="w-6 h-6 mx-auto mb-1.5" />
                <span className="font-semibold text-xs">{error}</span>
              </div>
            )}

            {!loading && !error && orders.length === 0 && (
              <div className="py-12 px-4 text-center text-gray-500">
                <p className="font-medium text-sm text-gray-700">No orders match your filter.</p>
                <p className="text-xs text-gray-400 mt-1">Try resetting search keywords or status tabs.</p>
              </div>
            )}

            {!loading &&
              !error &&
              visibleOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const orderTickets = allTickets.filter((t) => t.orderId === order.id);
                return (
                  <div key={order.id} className="p-3.5 transition-colors hover:bg-gray-50">
                    <div
                      onClick={() => handleToggleRow(order.id)}
                      className="cursor-pointer space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-gray-900 block">
                            {order.reference}
                          </span>
                          <h4 className="text-sm font-bold text-gray-900 mt-0.5">
                            {order.buyerName}
                          </h4>
                          <span className="font-mono text-xs text-gray-600 block">
                            {order.buyerPhone}
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              order.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : order.status === 'pending'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-red-50 text-red-800 border-red-300'
                            }`}
                          >
                            {order.status}
                          </span>
                          <span className="font-mono font-bold text-sm text-gray-900">
                            {koboToNaira(order.totalKobo)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono font-bold text-gray-800 text-[11px]">
                            {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {new Date(order.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Link
                            href={`/ticket/${order.reference}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="View Customer Pass"
                            className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => void handleResend(order, e)}
                            disabled={resendingRef === order.reference || order.status !== 'paid'}
                            className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 flex items-center justify-center"
                            title="Resend email receipt"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleRow(order.id)}
                            className="min-h-[36px] px-2 rounded-lg bg-gray-100 text-xs font-semibold text-gray-700 flex items-center gap-1"
                          >
                            <span>{isExpanded ? 'Hide' : 'Tickets'}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Mobile Tickets Drawer */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-200 bg-slate-50/70 p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                          <span>Individual Passes ({orderTickets.length})</span>
                          <span className="text-[11px] font-normal text-gray-500 truncate max-w-[160px]">
                            {order.buyerEmail}
                          </span>
                        </div>

                        {orderTickets.length === 0 ? (
                          <p className="text-xs text-gray-500 py-1">No tickets found.</p>
                        ) : (
                          <div className="divide-y divide-gray-200/60">
                            {orderTickets.map((ticket, tIdx) => (
                              <div
                                key={ticket.id}
                                className="py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <p className="font-bold text-gray-900 leading-snug">
                                    #{tIdx + 1} {ticket.holderName}
                                  </p>
                                  <p className="font-mono text-[11px] text-gray-500">
                                    {ticket.code}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      ticket.status === 'valid'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : ticket.status === 'checked_in'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {ticket.status === 'checked_in' ? 'Scanned' : ticket.status}
                                  </span>

                                  {ticket.status !== 'void' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setVoidModalTicket({
                                          id: ticket.id,
                                          code: ticket.code,
                                        });
                                      }}
                                      className="min-h-[32px] px-2 py-1 rounded bg-white hover:bg-red-50 border border-gray-300 text-red-600 text-[11px] font-bold flex items-center gap-1"
                                    >
                                      <Ban className="w-3 h-3" />
                                      <span>Void</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* DESKTOP VIEW: Sortable HTML Table (>= md screens) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider select-none">
                <tr>
                  <th scope="col" className="py-2.5 px-3 w-8">
                    <span className="sr-only">Expand</span>
                  </th>
                  <SortHeader
                    label="Reference"
                    columnKey="reference"
                    activeKey={sortBy}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Buyer Name"
                    columnKey="buyerName"
                    activeKey={sortBy}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <th scope="col" className="py-2.5 px-3">WhatsApp Phone</th>
                  <th scope="col" className="py-2.5 px-3 text-center">Tickets</th>
                  <SortHeader
                    label="Total (NGN)"
                    columnKey="totalKobo"
                    activeKey={sortBy}
                    direction={sortDir}
                    defaultDirection="desc"
                    onSort={handleSort}
                  />
                  <th scope="col" className="py-2.5 px-3">Status</th>
                  <SortHeader
                    label="Date"
                    columnKey="createdAt"
                    activeKey={sortBy}
                    direction={sortDir}
                    defaultDirection="desc"
                    onSort={handleSort}
                  />
                  <th scope="col" className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 text-gray-800">
                {loading && (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={9} className="py-3 px-3">
                          <div className="h-4 bg-gray-200 rounded w-full" />
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {!loading && error && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-red-600 bg-red-50/50">
                      <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                      <span className="font-semibold">{error}</span>
                    </td>
                  </tr>
                )}

                {!loading && !error && orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500">
                      <p className="font-medium text-sm text-gray-700">No orders match your filter.</p>
                      <p className="text-xs text-gray-400 mt-1">Try resetting search keywords or status tabs.</p>
                    </td>
                  </tr>
                )}

                {!loading &&
                  !error &&
                  visibleOrders.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const orderTickets = allTickets.filter((t) => t.orderId === order.id);
                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => handleToggleRow(order.id)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? 'bg-blue-50/40 font-medium' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-gray-400">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-700" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                            {order.reference}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">
                            {order.buyerName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-600">
                            {order.buyerPhone}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-900">
                            {order.quantity}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                            {koboToNaira(order.totalKobo)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                order.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : order.status === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-red-50 text-red-800 border-red-300'
                              }`}
                            >
                              {order.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-500 text-[11px]">
                            {new Date(order.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            <span className="text-gray-400">
                              {new Date(order.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/ticket/${order.reference}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="View Customer Pass"
                                className="p-1 rounded hover:bg-gray-200 text-gray-600"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={(e) => void handleResend(order, e)}
                                disabled={resendingRef === order.reference || order.status !== 'paid'}
                                title={
                                  order.status === 'paid'
                                    ? 'Email this buyer their ticket link again'
                                    : 'Only a paid order has a ticket to send'
                                }
                                className="p-1 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-40"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED ROW: Individual Tickets */}
                        {isExpanded && (
                          <tr className="bg-slate-50 border-b border-gray-200">
                            <td colSpan={9} className="p-4 pl-11">
                              <div className="bg-white rounded border border-gray-300 p-3.5 space-y-3">
                                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                                  <span className="text-xs font-bold uppercase text-gray-700">
                                    Tickets in this order ({orderTickets.length})
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Buyer: {order.buyerEmail}
                                  </span>
                                </div>

                                {orderTickets.length === 0 ? (
                                  <p className="text-xs text-gray-500 py-2">No individual tickets found for this order.</p>
                                ) : (
                                  <div className="divide-y divide-gray-100">
                                    {orderTickets.map((ticket, tIdx) => (
                                      <div
                                        key={ticket.id}
                                        className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center font-mono font-bold text-[10px] text-gray-600">
                                            #{tIdx + 1}
                                          </span>
                                          <div>
                                            <p className="font-bold text-gray-900">{ticket.holderName}</p>
                                            <p className="font-mono text-[11px] text-gray-500">
                                              {ticket.code} • {ticket.holderPhone ? formatPhoneForDisplay(ticket.holderPhone) : 'NO PHONE'}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                              ticket.status === 'valid'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : ticket.status === 'checked_in'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-red-100 text-red-800'
                                            }`}
                                          >
                                            {ticket.status === 'checked_in'
                                              ? `Scanned: ${new Date(
                                                  ticket.checkedInAt || ''
                                                ).toLocaleTimeString([], {
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })}`
                                              : ticket.status}
                                          </span>

                                          {ticket.status !== 'void' && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setVoidModalTicket({
                                                  id: ticket.id,
                                                  code: ticket.code,
                                                });
                                              }}
                                              className="px-2 py-1 rounded bg-white hover:bg-red-50 border border-gray-300 hover:border-red-300 text-red-600 text-[11px] font-semibold flex items-center gap-1"
                                            >
                                              <Ban className="w-3 h-3" />
                                              <span>Void</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="p-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================
          MODAL: Issue Complimentary / VIP Ticket
      ======================================================== */}
      {isCompModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-gray-300 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Issue Complimentary Ticket</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Generates a 100% discount VIP pass with unique QR verification.
              </p>
            </div>

            <form onSubmit={handleIssueComp} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="e.g. Committee Guest / VIP Lead"
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-xl text-gray-900 text-sm focus:border-gray-900 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Phone (Optional — shown at the door)
                </label>
                <input
                  type="tel"
                  value={compPhone}
                  onChange={(e) => setCompPhone(e.target.value)}
                  placeholder="e.g. 08023456789"
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-xl text-gray-900 text-sm font-mono focus:border-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsCompModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2 bg-gray-900 hover:bg-black text-white rounded-xl font-bold"
                >
                  Issue Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: Void Ticket Confirmation
      ======================================================== */}
      {pendingPriceKobo !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="price-dialog-title">
          <div className="w-full max-w-md rounded-xl bg-white p-5 text-gray-900 shadow-xl">
            <h2 id="price-dialog-title" className="text-lg font-bold">Confirm ticket price change</h2>
            <p className="mt-3 text-sm text-gray-600">Future orders will change from <strong>{koboToNaira(summary?.currentPriceKobo ?? 0)}</strong> to <strong>{koboToNaira(pendingPriceKobo)}</strong>. Existing and pending orders keep their stored price.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={priceBusy} onClick={() => setPendingPriceKobo(null)} className="rounded border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={priceBusy} onClick={() => void confirmPriceChange()} className="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{priceBusy ? 'Saving…' : 'Confirm change'}</button></div>
          </div>
        </div>
      )}

      {isCloseSalesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto my-auto">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Close ticket sales?</h2>
            <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
              The checkout page will stop accepting purchases immediately and show
              buyers a &ldquo;sales closed&rdquo; message. Nobody can buy a ticket until you
              re-open it. You can re-open at any time.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsCloseSalesModalOpen(false)}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl border border-gray-300 bg-white text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={salesToggleBusy}
                onClick={() => handleSetSalesOpen(false)}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-red-600 text-xs sm:text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {salesToggleBusy ? 'Closing…' : 'Close sales'}
              </button>
            </div>
          </div>
        </div>
      )}

      {voidModalTicket && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl border border-red-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900">Void Ticket Pass</h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to permanently cancel ticket{' '}
              <strong className="font-mono text-gray-900 font-bold">{voidModalTicket.code}</strong>?
              This ticket will be rejected immediately by door scanners.
            </p>

            <form onSubmit={handleConfirmVoid} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Duplicate order / Chargeback / Transfer error"
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-xl text-gray-900 text-sm focus:border-red-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidModalTicket(null)}
                  className="flex-1 min-h-[44px] py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
                >
                  Confirm Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
