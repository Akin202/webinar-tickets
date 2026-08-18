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
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { Ticket, TicketStatus } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { renameTicketHolder } from '@/lib/data-access';

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
  const [saveImageNotice, setSaveImageNotice] = useState(false);

  const activeStatus: TicketStatus = forcedStatus || ticket.status;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(ticket.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      try {
        await renameTicketHolder(ticket.id, tempName.trim(), ticket.holderMatricNumber);
        if (onUpdateAttendeeName) {
          onUpdateAttendeeName(ticket.id, tempName.trim());
        }
      } catch (err) {
        console.error('Rename error:', err);
      }
    }
    setIsRenameOpen(false);
  };

  // Google Calendar Link generator
  const getGoogleCalendarUrl = () => {
    const title = encodeURIComponent(`${eventConfig.event.name} - ${eventConfig.event.tagline}`);
    const details = encodeURIComponent(
      `${eventConfig.event.hostedBy}\nTicket Code: ${ticket.code}\nAttendee: ${ticket.holderName}\nVenue: ${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`
    );
    const location = encodeURIComponent(`${eventConfig.event.venueName}, ${eventConfig.event.venueAddress}`);
    const dates = '20260825T223000Z/20260826T030000Z';
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Save Image Tooltip Notice */}
      {saveImageNotice && (
        <div className="mb-4 p-3 rounded-xl bg-brand-primary/10 border border-brand-primary text-brand-primary text-xs font-semibold text-center flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>Screenshot saved tip: You can also take a screenshot of this card for fast offline gate scanning!</span>
        </div>
      )}

      {/* Main Ticket Container - Screen capture friendly */}
      <div
        id={`ticket-card-${ticket.code}`}
        className={`relative overflow-hidden rounded-3xl border transition-all shadow-2xl ${
          activeStatus === 'valid'
            ? 'bg-[#12141a] border-brand-primary/40 shadow-brand-primary/10'
            : activeStatus === 'checked_in'
            ? 'bg-[#15161c] border-brand-muted/30 shadow-black/40'
            : 'bg-[#181214] border-brand-urgent/40 shadow-brand-urgent/10'
        }`}
      >
        {/* Top Metallic / Glow Accent Strip */}
        <div
          className={`h-2 w-full ${
            activeStatus === 'valid'
              ? 'bg-[#e2ff00] shadow-[0_0_12px_#e2ff00]'
              : activeStatus === 'checked_in'
              ? 'bg-slate-700'
              : 'bg-rose-500'
          }`}
        />

        {/* Ticket Header */}
        <div className="p-6 pb-4 border-b border-[#21262d]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#e2ff00] font-mono-code">
                Official Admission Pass
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase mt-0.5 font-display">
                {eventConfig.event.name}
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono-code">
                {eventConfig.event.tagline} • {eventConfig.event.hostedBy}
              </p>
            </div>

            {/* Status Pill */}
            <div>
              {activeStatus === 'valid' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e2ff00]/15 text-[#e2ff00] text-xs font-black uppercase tracking-wider border border-[#e2ff00]/40">
                  <span className="w-2 h-2 rounded-full bg-[#e2ff00] animate-pulse" />
                  <span>Valid</span>
                </span>
              )}
              {activeStatus === 'checked_in' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#161b22] text-slate-400 text-xs font-black uppercase tracking-wider border border-[#30363d]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Checked In</span>
                </span>
              )}
              {activeStatus === 'void' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/60 text-rose-400 text-xs font-black uppercase tracking-wider border border-rose-800">
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
          <div className="relative inline-block p-4 rounded-2xl bg-white shadow-xl">
            <QRCodeSVG
              value={ticket.code}
              size={210}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#090a0f"
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-dim">
              Security Ticket Code
            </span>
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-xl sm:text-2xl font-black text-brand-primary tracking-wider select-all">
                {ticket.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copy ticket code"
                className="p-1.5 rounded-lg bg-brand-subtle text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-brand-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Attendee Details Card */}
          <div className="p-4 rounded-2xl bg-brand-subtle/80 border border-brand-border/70 text-left space-y-2.5">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-2">
              <span className="text-[11px] font-bold uppercase text-brand-dim">Holder Name</span>
              {eventConfig.featureFlags.allowNameChange && activeStatus === 'valid' && (
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent hover:underline"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Rename</span>
                </button>
              )}
            </div>

            <p className="text-base font-extrabold text-brand-text uppercase tracking-tight">
              {ticket.holderName}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              {ticket.holderMatricNumber && (
                <div className="flex items-center gap-1.5 text-brand-muted">
                  <GraduationCap className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                  <span className="font-mono">{ticket.holderMatricNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Event Schedule & Location */}
          <div className="grid grid-cols-2 gap-2 text-left text-xs bg-brand-card/40 p-3.5 rounded-xl border border-brand-border/40">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-brand-dim font-bold uppercase text-[10px]">
                <Calendar className="w-3 h-3 text-brand-primary" />
                <span>Date</span>
              </div>
              <p className="font-semibold text-brand-text">{eventConfig.event.date}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-brand-dim font-bold uppercase text-[10px]">
                <Clock className="w-3 h-3 text-brand-accent" />
                <span>Doors Open</span>
              </div>
              <p className="font-semibold text-brand-text">{eventConfig.event.doorsOpen}</p>
            </div>

            <div className="col-span-2 pt-2 border-t border-brand-border/40 space-y-0.5">
              <div className="flex items-center gap-1.5 text-brand-dim font-bold uppercase text-[10px]">
                <MapPin className="w-3 h-3 text-brand-primary" />
                <span>Venue</span>
              </div>
              <p className="font-semibold text-brand-text">{eventConfig.event.venueName}</p>
              <p className="text-[11px] text-brand-dim truncate">{eventConfig.event.venueAddress}</p>
            </div>
          </div>

          {/* Gate Scanning Warning */}
          <div className="p-3 rounded-xl bg-brand-warning/10 border border-brand-warning/30 flex items-start gap-2.5 text-left text-xs text-brand-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong className="block text-brand-text">ONE ENTRY ONLY</strong>
              <span>This QR code is uniquely encrypted and deactivates permanently upon first scan at the gate.</span>
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
            {/* Save as image stub */}
            <button
              type="button"
              onClick={() => {
                setSaveImageNotice(true);
                setTimeout(() => setSaveImageNotice(false), 4000);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-brand-card hover:bg-brand-card-hover border border-brand-border text-brand-text text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-brand-primary" />
              <span>Save Pass</span>
            </button>

            {/* Add to Calendar */}
            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-brand-card hover:bg-brand-card-hover border border-brand-border text-brand-text text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-brand-accent" />
              <span>Add to Calendar</span>
            </a>
          </div>

          <WhatsAppSupportButton
            ticketCode={ticket.code}
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
          <div className="w-full max-w-sm rounded-3xl bg-brand-card border border-brand-border p-6 shadow-2xl space-y-4">
            <div>
              <span className="text-xs font-bold uppercase text-brand-primary tracking-widest">
                Ticket Name Update
              </span>
              <h3 className="text-lg font-black text-brand-text mt-1">
                Rename Ticket Holder
              </h3>
              <p className="text-xs text-brand-muted mt-1 leading-relaxed">
                Update the official name displayed on this pass and registered for gate admission.
              </p>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="rename-name-input"
                  className="block text-xs font-bold uppercase text-brand-muted mb-1"
                >
                  Full Official Name
                </label>
                <input
                  id="rename-name-input"
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="e.g. Babatunde Folarin Adeyemi"
                  className="w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border border-brand-border text-brand-text text-sm focus:border-brand-primary"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(false)}
                  className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-brand-subtle text-brand-muted hover:text-brand-text font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-brand-primary text-brand-surface font-bold text-xs hover:bg-brand-primary-hover transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
