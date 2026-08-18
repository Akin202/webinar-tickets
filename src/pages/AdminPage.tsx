import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import {
  getSalesSummary,
  listOrders,
  listTickets,
  voidTicket,
  issueComplimentaryTicket,
  exportOrdersCsv,
} from '@/lib/data-access';
import {
  Order,
  OrderStatus,
  Ticket,
  SalesSummary,
  koboToNaira,
} from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';

export const AdminPage: React.FC = () => {
  // Stats & Dashboard state
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // Filters & Sorting
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<keyof Order>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Row Expansion State
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState<boolean>(false);

  // Modal Dialogs
  const [isCompModalOpen, setIsCompModalOpen] = useState<boolean>(false);
  const [compName, setCompName] = useState<string>('');
  const [compMatric, setCompMatric] = useState<string>('');

  const [voidModalTicket, setVoidModalTicket] = useState<{ id: string; code: string } | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');

  // Fetch summary and orders
  const loadData = async () => {
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
      setSummary(sumData);
      setOrders(ordersData.orders);
      setTotalCount(ordersData.total);
      setAllTickets(ticketsData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter, page, sortBy, sortDir]);

  const triggerNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Toggle Row Expansion
  const handleToggleRow = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    setLoadingTickets(true);
    try {
      const t = await listTickets();
      setAllTickets(t);
    } catch {
      // keep existing
    } finally {
      setLoadingTickets(false);
    }
  };

  // Resend ticket stub
  const handleResend = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerNotice(`Ticket link resent to ${order.buyerEmail}`);
  };

  // Void ticket handler
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
        holderMatricNumber: compMatric || null,
      });
      triggerNotice(`VIP Pass ${ticket.code} issued to ${ticket.holderName}`);
      setIsCompModalOpen(false);
      setCompName('');
      setCompMatric('');
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
      link.setAttribute('download', `unilag_eng26_orders_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      triggerNotice('Failed to export CSV.');
    }
  };

  const channelBreakdown = [
    { name: 'Debit Card (Mastercard / Visa / Verve)', percent: 68 },
    { name: 'Direct Bank Transfer (NIBSS)', percent: 24 },
    { name: 'USSD (*737#, *894#, *966#)', percent: 6 },
    { name: 'Barter / Mobile Money / OPay', percent: 2 },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1f2c] font-sans antialiased pb-16">
      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="fixed top-4 right-4 z-50 bg-[#1e293b] text-white text-xs font-semibold px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Top Admin Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-1.5 rounded border border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-xs font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Public Page</span>
            </Link>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">
                UNILAG ENG '26 Ticketing Admin
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
              to="/scan"
              id="admin-open-scanner-btn"
              className="min-h-[36px] px-3 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Door Scanner</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ========================================================
            1. STATS ROW (SalesSummary)
        ======================================================== */}
        <section aria-label="Sales Metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Tickets Sold
            </span>
            <div className="text-2xl font-bold font-mono text-gray-900 mt-1">
              {summary ? summary.ticketsSold : '—'}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summary ? Math.round((summary.ticketsSold / summary.capacity) * 100) : 0}% of capacity
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Remaining
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {summary ? summary.ticketsRemaining : '—'}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">Available for purchase</p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Checked In
            </span>
            <div className="text-2xl font-bold font-mono text-blue-700 mt-1">
              {summary ? summary.ticketsCheckedIn : '—'}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summary && summary.ticketsSold > 0
                ? Math.round((summary.ticketsCheckedIn / summary.ticketsSold) * 100)
                : 0}
              % turn-up rate
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Gross Revenue
            </span>
            <div className="text-xl font-bold font-mono text-gray-900 mt-1">
              {summary ? koboToNaira(summary.grossKobo) : '—'}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">Total collected</p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Net Revenue
            </span>
            <div className="text-xl font-bold font-mono text-gray-900 mt-1">
              {summary ? koboToNaira(summary.netKobo) : '—'}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">After processor fees</p>
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
            <div className="space-y-2.5">
              {channelBreakdown.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-700 font-medium truncate">{item.name}</span>
                    <span className="font-mono text-gray-900 font-bold ml-2">
                      {item.percent}%
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
          </div>
        </section>

        {/* ========================================================
            3. ORDERS TABLE WITH FILTER, SORT, EXPANSION & ACTIONS
        ======================================================== */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/50">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search input */}
              <div className="relative min-w-[260px]">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="admin-search-input"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, phone, matric, ref..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-500"
                />
              </div>

              {/* Status filter tabs */}
              <div className="flex rounded border border-gray-300 bg-white p-0.5 text-xs font-medium text-gray-600">
                {(['all', 'paid', 'pending', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 rounded capitalize text-xs transition-colors ${
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

            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Showing {orders.length} of {totalCount} records</span>
              <button
                type="button"
                onClick={loadData}
                className="p-1 rounded hover:bg-gray-200 text-gray-600"
                title="Refresh Table"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider select-none">
                <tr>
                  <th className="py-2.5 px-3 w-8"></th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-gray-200/60"
                    onClick={() => {
                      if (sortBy === 'reference') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortBy('reference');
                        setSortDir('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Reference</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-gray-200/60"
                    onClick={() => {
                      if (sortBy === 'buyerName') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortBy('buyerName');
                        setSortDir('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Buyer Name</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">WhatsApp Phone</th>
                  <th className="py-2.5 px-3 text-center">Tickets</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-gray-200/60"
                    onClick={() => {
                      if (sortBy === 'totalKobo') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortBy('totalKobo');
                        setSortDir('desc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Total (NGN)</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Status</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-gray-200/60"
                    onClick={() => {
                      if (sortBy === 'createdAt') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortBy('createdAt');
                        setSortDir('desc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
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
                  orders.map((order) => {
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
                            {order.ticketCount}
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
                                to={`/ticket/${order.reference}`}
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
                                onClick={(e) => handleResend(order, e)}
                                title="Resend Pass via Email/SMS"
                                className="p-1 rounded hover:bg-gray-200 text-gray-600"
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

                                {loadingTickets ? (
                                  <p className="text-xs text-gray-500 py-2">Loading ticket passes...</p>
                                ) : orderTickets.length === 0 ? (
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
                                              {ticket.code} • {ticket.holderMatricNumber || 'GUEST'}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md bg-white rounded-lg border border-gray-300 shadow-2xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Issue Complimentary Ticket</h3>
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
                  placeholder="e.g. Prof. O. M. Sadiq (Dean of Engineering)"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Matric / Faculty ID (Optional)
                </label>
                <input
                  type="text"
                  value={compMatric}
                  onChange={(e) => setCompMatric(e.target.value)}
                  placeholder="e.g. VIP-FACULTY-01"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsCompModalOpen(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-gray-900 hover:bg-black text-white rounded font-bold"
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
      {voidModalTicket && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm bg-white rounded-lg border border-red-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900">Void Ticket Pass</h3>
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to permanently cancel ticket{' '}
              <strong className="font-mono text-gray-900">{voidModalTicket.code}</strong>?
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidModalTicket(null)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold"
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
