'use client';

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  CalendarPlus,
  Edit3,
  Copy,
  Check,
} from 'lucide-react';
import { Ticket, TicketStatus, formatPhoneForDisplay } from '@/types/ticketing';
import {
  eventConfig,
  doorsOpenIso,
  eventEndsIso,
  toCalendarStamp,
} from '@/config/event.config';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { renameTicketHolder } from '@/lib/data-access';
import { exportTicketPass } from '@/lib/pass-export';
import { DATE_LONG, EVENT_NAME } from '@/components/pages/event/event-format';

/**
 * QR contrast is FUNCTIONAL, not decorative — do not wire these to the
 * brand palette. The code has to scan off a dim phone screen held under
 * bad lighting at the door. Maximum luminance contrast wins; an on-brand
 * QR that fails to scan costs an entry.
 */
const QR_BG = '#ffffff';
const QR_FG = '#090a0f';

export interface TicketCardProps {
  ticket: Ticket;
  forcedStatus?: TicketStatus;
  onUpdateAttendeeName?: (ticketId: string, newName: string) => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  forcedStatus,
  onUpdateAttendeeName,
}) => {
  const [copied, setCopied] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [tempName, setTempName] = useState(ticket.holderName);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Save Pass state. The notice reports what actually happened — the old
  // version claimed a save had occurred when nothing had been written.
  const qrContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [passNotice, setPassNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const activeStatus: TicketStatus = forcedStatus || ticket.status;

  // Escape closes the rename dialog. Without it the only way out on a phone
  // is the Cancel button, and a dialog that traps you is worse than no dialog.
  React.useEffect(() => {
    if (!isRenameOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsRenameOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRenameOpen]);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(ticket.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = tempName.trim();
    if (!next) return;

    // The old version closed the dialog whether or not the write landed, so
    // a rejected rename — sales closed, doors already open, ticket already
    // scanned — looked exactly like a successful one. The holder would then
    // arrive at the gate under a name the door has never heard of.
    setIsRenaming(true);
    setRenameError(null);
    try {
      await renameTicketHolder(ticket.id, next);
      onUpdateAttendeeName?.(ticket.id, next);
      setIsRenameOpen(false);
    } catch (err) {
      console.error('Rename error:', err);
      setRenameError(
        err instanceof Error ? err.message : 'That name could not be saved. Try again.'
      );
    } finally {
      setIsRenaming(false);
    }
  };

  const handleSavePass = async () => {
    setIsSavingPass(true);
    setPassNotice(null);
    const outcome = await exportTicketPass({
      qrContainer: qrContainerRef.current,
      code: ticket.code,
      holderName: ticket.holderName,
      holderPhone: ticket.holderPhone ?? null,
    });
    setIsSavingPass(false);

    if (outcome.kind === 'shared') {
      setPassNotice({ tone: 'ok', text: 'Pass sent. Keep a copy on this phone too.' });
    } else if (outcome.kind === 'downloaded') {
      setPassNotice({ tone: 'ok', text: `Saved as ${outcome.fileName} — check your Downloads or Photos.` });
    } else if (outcome.kind === 'cancelled') {
      setPassNotice(null);
    } else {
      // Falling back to "take a screenshot" is honest here: it is genuinely
      // the next best thing, and it is only offered once saving has actually
      // failed rather than being dressed up as the feature.
      setPassNotice({
        tone: 'bad',
        text: `${outcome.reason} Screenshot this card instead — that still scans.`,
      });
    }
  };

  // Google Calendar Link generator
  const getGoogleCalendarUrl = () => {
    const title = encodeURIComponent(`${eventConfig.event.name} - ${eventConfig.event.tagline}`);
    const details = encodeURIComponent(
      `${eventConfig.event.hostedBy}\nTicket Code: ${ticket.code}\nAttendee: ${ticket.holderName}\nVenue: ${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`
    );
    const location = encodeURIComponent(`${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`);
    // Derived, not typed. These were two hardcoded UTC stamps that happened
    // to be right for this event and would silently be wrong for the next
    // one — the calendar entry is the one artefact a buyer keeps in their
    // pocket for a week, so it cannot drift from the config.
    const dates = `${toCalendarStamp(doorsOpenIso)}/${toCalendarStamp(eventEndsIso)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* What the Save Pass button actually did. */}
      {passNotice && (
        <div
          role="status"
          className={`mb-4 p-3 rounded-xl border text-xs font-semibold text-center flex items-center justify-center gap-2 ${
            passNotice.tone === 'ok'
              ? 'bg-brand-success-bg border-brand-success-border text-brand-success'
              : 'bg-brand-urgent-bg border-brand-urgent-border text-brand-urgent'
          }`}
        >
          {passNotice.tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{passNotice.text}</span>
        </div>
      )}

      {/* Main Ticket Container - Screen capture friendly */}
      <div
        id={`ticket-card-${ticket.code}`}
        className={`relative overflow-hidden rounded-2xl border transition-all shadow-[0_28px_60px_-32px_rgba(0,0,0,0.7)] ${
          activeStatus === 'valid'
            ? 'bg-brand-card border-brand-border-strong'
            : activeStatus === 'checked_in'
            ? 'bg-brand-card-hover border-brand-border'
            : 'bg-brand-card-danger border-brand-urgent-border'
        }`}
      >
        {/* Top Metallic / Glow Accent Strip */}
        <div
          className={`h-2 w-full ${
            activeStatus === 'valid'
              ? 'bg-brand-primary'
              : activeStatus === 'checked_in'
              ? 'bg-brand-border-strong'
              : 'bg-brand-urgent'
          }`}
        />

        {/* Ticket Header */}
        <div className="p-6 pb-4 border-b border-brand-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight [text-wrap:balance]">
                {EVENT_NAME}
              </h2>
              <p className="text-sm text-brand-muted mt-1">
                {DATE_LONG} · {eventConfig.event.venueName}
              </p>
            </div>

            {/* Status Pill */}
            <div>
              {activeStatus === 'valid' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-success-bg text-brand-success text-xs font-bold uppercase tracking-wider border border-brand-success-border">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid</span>
                </span>
              )}
              {activeStatus === 'checked_in' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-card-hover text-brand-muted text-xs font-bold uppercase tracking-wider border border-brand-border-strong">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Checked In</span>
                </span>
              )}
              {activeStatus === 'void' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-urgent-bg text-brand-urgent text-xs font-bold uppercase tracking-wider border border-brand-urgent-border">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Void</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Ticket Body: QR Code & Code Number */}
        <div className="p-6 text-center space-y-5">
          {/* QR Code Canvas Frame */}
          <div ref={qrContainerRef} className="relative inline-block p-4 rounded-2xl bg-white shadow-xl">
            <QRCodeSVG
              value={ticket.code}
              size={210}
              level="H"
              // The quiet zone has to live INSIDE the svg. The surrounding
              // padding is a DOM box: it survives a screenshot but not the
              // PNG export, which serialises the svg alone — and a QR with
              // no margin is the classic "worked on my screen, failed at the
              // door" bug. `includeMargin` is deprecated in qrcode.react v4.
              marginSize={4}
              bgColor={QR_BG}
              fgColor={QR_FG}
              className={`transition-opacity duration-300 ${
                activeStatus !== 'valid' ? 'opacity-30' : 'opacity-100'
              }`}
            />

            {/* Checked In Overlay Watermark */}
            {activeStatus === 'checked_in' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-2xl p-4 text-white">
                <div className="p-2 rounded-full bg-brand-success text-white mb-2 shadow-lg">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <span className="font-mono text-sm font-black uppercase tracking-widest text-brand-success">
                  Scanned & Admitted
                </span>
                <span className="text-[11px] text-gray-200 mt-1">
                  {ticket.checkedInAt
                    ? new Date(ticket.checkedInAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Gate Check Completed'}
                </span>
              </div>
            )}

            {/* Void / Cancelled Overlay */}
            {activeStatus === 'void' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-[2px] rounded-2xl p-4 text-white">
                <div className="p-2 rounded-full bg-brand-urgent text-white mb-2 shadow-lg">
                  <XCircle className="w-8 h-8" />
                </div>
                <span className="font-mono text-base font-black uppercase tracking-widest text-brand-urgent">
                  Cancelled / Void
                </span>
                <span className="text-[11px] text-gray-300 mt-1 text-center">
                  Not valid for event entry
                </span>
              </div>
            )}
          </div>

          {/* Ticket Code & Quick Copy */}
          <div className="space-y-1">
            <span className="text-xs font-semibold text-brand-dim">
              Ticket code
            </span>
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-xl sm:text-2xl font-bold text-white tracking-wider select-all">
                {ticket.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copy ticket code"
                aria-label="Copy ticket code"
                className="p-3 rounded-lg bg-brand-subtle text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-brand-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Attendee Details Card */}
          <div className="pt-4 border-t border-brand-border text-left space-y-2.5">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-2">
              <span className="text-xs font-semibold text-brand-dim">Name on this ticket</span>
              {eventConfig.featureFlags.allowNameChange && activeStatus === 'valid' && (
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(true)}
                  className="inline-flex items-center gap-1 min-h-[40px] px-2 -mr-2 text-sm font-semibold text-white underline underline-offset-4"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Rename</span>
                </button>
              )}
            </div>

            <p className="text-lg font-bold text-white">
              {ticket.holderName}
            </p>

            {/* The number door staff will ask for. It is shown here because
                the holder has to know what they will be challenged on — the
                gate reads this off the scan result and asks "what's your
                number?" to defeat forwarded screenshots. Deliberately not
                editable: a renameable identity check is not a check. */}
            {ticket.holderPhone && (
              <div className="pt-2 border-t border-brand-border/60">
                <span className="text-xs font-semibold text-brand-dim block">
                  Phone on this ticket
                </span>
                <p className="text-sm font-bold text-brand-text font-mono-code tracking-wide">
                  {formatPhoneForDisplay(ticket.holderPhone)}
                </p>
                <p className="text-xs text-brand-dim mt-1 leading-snug">
                  Door staff may ask you to say this number aloud.
                </p>
              </div>
            )}
          </div>

          {/* Event Schedule & Location */}
          <div className="grid grid-cols-2 gap-2 text-left text-sm pt-4 border-t border-brand-border">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-brand-dim font-semibold text-xs">
                <Calendar className="w-3.5 h-3.5" />
                <span>Date</span>
              </div>
              <p className="font-semibold text-brand-text">{DATE_LONG}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-brand-dim font-semibold text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Doors open</span>
              </div>
              <p className="font-semibold text-brand-text">{eventConfig.event.doorsOpen}</p>
            </div>

            <div className="col-span-2 pt-2 border-t border-brand-border/40 space-y-0.5">
              <div className="flex items-center gap-1.5 text-brand-dim font-semibold text-xs">
                <MapPin className="w-3.5 h-3.5" />
                <span>Venue</span>
              </div>
              <p className="font-semibold text-brand-text">{eventConfig.event.venueName}</p>
              <p className="text-xs text-brand-dim">{eventConfig.event.venueAddress}</p>
            </div>
          </div>

          {/* Gate Scanning Warning */}
          <div className="p-3 rounded-xl bg-brand-warning/10 border border-brand-warning/30 flex items-start gap-2.5 text-left text-xs text-brand-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong className="block text-brand-text">One entry only</strong>
              {/* Was "uniquely encrypted", which is not true — the code is a
                  random single-use token, not ciphertext. The accurate
                  sentence is also the more useful warning. */}
              <span>
                This code works once. The first scan at the gate admits; every scan after
                that is refused, including on a forwarded copy.
              </span>
            </div>
          </div>
        </div>

        {/* Perforated Divider Visual Effect */}
        <div className="relative flex items-center justify-between px-2 py-1">
          <div className="w-5 h-5 -ml-5 rounded-full bg-brand-surface border-r border-brand-border" />
          <div className="flex-1 border-t-2 border-dashed border-brand-border/50 mx-2" />
          <div className="w-5 h-5 -mr-5 rounded-full bg-brand-surface border-l border-brand-border" />
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 bg-brand-subtle/40 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleSavePass()}
              disabled={isSavingPass}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-brand-card hover:bg-brand-card-hover border border-brand-border-strong text-brand-text text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{isSavingPass ? 'Saving…' : 'Save ticket'}</span>
            </button>

            {/* Add to Calendar */}
            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] px-3 py-2 rounded-xl bg-brand-card hover:bg-brand-card-hover border border-brand-border-strong text-brand-text text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Add to calendar</span>
            </a>
          </div>

          <WhatsAppSupportButton
            orderRef={ticket.code}
            label="Need help with this ticket?"
          />
        </div>
      </div>

      {/* Rename Modal Dialog */}
      {isRenameOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div className="public-page w-full max-w-sm rounded-2xl bg-brand-card border border-brand-border-strong p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-extrabold text-white">
                Change the name on this ticket
              </h3>
              <p className="text-sm text-brand-muted mt-1 leading-relaxed">
                This is the name door staff will see when they scan it.
              </p>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="rename-name-input"
                  className="block text-sm font-semibold text-brand-text mb-1.5"
                >
                  Full name
                </label>
                <input
                  id="rename-name-input"
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="e.g. Babatunde Folarin Adeyemi"
                  className="w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border border-brand-border text-brand-text text-base focus:border-brand-accent"
                  autoFocus
                />
              </div>

              {renameError && (
                <p
                  role="alert"
                  className="p-3 rounded-xl bg-brand-urgent-bg border border-brand-urgent-border text-brand-urgent text-xs font-semibold leading-snug"
                >
                  {renameError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(false)}
                  className="min-h-[48px] flex-1 px-4 py-2 rounded-xl border border-brand-border-strong text-brand-text font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !tempName.trim()}
                  className="min-h-[48px] flex-1 px-4 py-2 rounded-xl bg-brand-primary text-white font-semibold text-sm hover:bg-brand-primary-hover transition-colors disabled:opacity-60"
                >
                  {isRenaming ? 'Saving…' : 'Save name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
