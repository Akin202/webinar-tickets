'use client';

import React, { useState } from 'react';

import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  ShieldAlert,
  Shirt,
  Ticket,
  ChevronDown,
  GlassWater,
  Music,
  Camera,
  ShieldCheck,
  Gift,
  ArrowRight,
  Share2,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { eventConfig, doorsOpenIso } from '@/config/event.config';
import { getSalesSummary } from '@/lib/data-access';
import { SalesSummary, koboToNaira } from '@/types/ticketing';
import { Countdown } from '@/components/Countdown';
import { CapacityMeter } from '@/components/CapacityMeter';
import { PriceTag } from '@/components/PriceTag';
import { DetailRow } from '@/components/DetailRow';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { SectionHeading } from '@/components/SectionHeading';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const defaultFaqs = [
  {
    question: "How do I get my ticket after paying?",
    answer: "Your unique QR-coded digital pass is generated on-screen immediately after payment and sent to your email. You can save it, screenshot it, or add it to Google Wallet / Calendar."
  },
  {
    question: "What is the dress code for Last Dance?",
    answer: `The dress code is '${eventConfig.event.dressCode}'. We strongly encourage signed white graduation shirts, custom signout markers, and rave-chic nightclub outfits.`
  },
  {
    question: "Can someone else use my ticket if I can't attend?",
    answer: "Tickets are strictly non-refundable and non-transferable at the gate. If name changes are enabled before the event, the original purchaser may rename the ticket once from the ticket view."
  },
  {
    question: "What are the door requirements & security checks?",
    answer: "Every attendee must present their digital QR pass and a valid photo ID. Age policy: " + eventConfig.event.policies.ageOrIdPolicy + ". Bags are subject to security search at the entrance."
  }
];

export const EventPage: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    getSalesSummary().then(setSalesSummary);
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${eventConfig.event.name} — ${eventConfig.event.tagline}`,
          text: `${eventConfig.event.name} • ${eventConfig.event.hostedBy} • Official Tickets`,
          url: window.location.href,
        });
      } catch {
        // User cancelled share
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const unitPriceFormatted = koboToNaira(eventConfig.ticketing.priceKobo);

  return (
    <div className="min-h-screen bg-brand-surface text-white flex flex-col selection:bg-brand-primary selection:text-black">
      {/* ========================================================
          1. TOP TICKER RIBBON (Poster Ticker Tape)
      ======================================================== */}
      <div className="w-full bg-brand-primary text-black py-1.5 px-4 overflow-hidden select-none border-b border-black font-mono-code font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-between">
        <div className="flex items-center gap-6 animate-pulse whitespace-nowrap mx-auto">
          <span>⚡ {eventConfig.event.tagline.toUpperCase()}</span>
          <span>•</span>
          <span>{eventConfig.event.name.toUpperCase()}</span>
          <span>•</span>
          <span>DOORS OPEN {eventConfig.event.doorsOpen}</span>
          <span>•</span>
          <span>{eventConfig.event.venueName.toUpperCase()}</span>
          <span>•</span>
          <span>{eventConfig.event.dressCode.toUpperCase()}</span>
        </div>
      </div>

      {/* ========================================================
          2. ICONIC FLYER HERO SECTION
      ======================================================== */}
      <header
        id="event-hero"
        className="relative w-full overflow-hidden border-b border-brand-border bg-brand-raised pt-6 sm:pt-10 pb-12 sm:pb-16 px-4 sm:px-6"
      >
        {/* Background Nightclub Atmosphere */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div
            className="w-full h-full bg-cover bg-center opacity-30 scale-105 filter contrast-125"
            style={{
              backgroundImage: `url('${eventConfig.brand.heroImageUrl}')`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-surface via-brand-surface/80 to-brand-surface/60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--brand-surface)_90%)]" />
        </div>

        {/* Flyer Container */}
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          {/* Main Poster Box Frame */}
          <div className="w-full rounded-3xl bg-brand-card/90 border-2 border-brand-border p-6 sm:p-10 shadow-2xl backdrop-blur-md relative overflow-hidden">
            {/* Top Acid Neon Glow Line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-brand-primary shadow-[0_0_15px_var(--brand-primary)]" />

            {/* Poster Header: Giant condensed LAST DANCE Title */}
            <div className="text-center pt-2 pb-4">
              <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter text-brand-primary uppercase font-display leading-[0.88] drop-shadow-[0_4px_24px_rgba(226,255,0,0.35)] select-none">
                {eventConfig.event.tagline.toUpperCase()}
              </h1>

              {/* Sub-banners: ENGINEERING SIGNOUT (Left) & AFTER PARTY (Right) */}
              <div className="flex items-center justify-between mt-3 sm:mt-4 pt-2 border-t-2 border-b-2 border-brand-primary/40 text-brand-primary font-black uppercase text-xs sm:text-lg md:text-xl tracking-widest px-2 font-mono-code">
                <span>ENGINEERING SIGNOUT</span>
                <span className="hidden sm:inline text-white">•</span>
                <span>AFTER PARTY</span>
              </div>
            </div>

            {/* Poster Middle: Host & Dress Code */}
            <div className="py-6 sm:py-8 text-center max-w-2xl mx-auto space-y-4">
              <p className="text-base sm:text-xl text-slate-200 font-semibold leading-relaxed">
                Hosted by {eventConfig.event.hostedBy}. The definitive sign-out celebration — open to everyone who wants to be there.
              </p>

              {/* Dress Code & Vibe Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-card-hover border border-brand-border-strong text-xs sm:text-sm font-bold text-brand-primary">
                <Shirt className="w-4 h-4 text-brand-primary" />
                <span>Dress Code: {eventConfig.event.dressCode}</span>
              </div>
            </div>

            {/* Poster Bottom Anchors (Flyer style: Doors Open, Venue, Date) */}
            <div className="pt-4 border-t-2 border-brand-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              {/* Left Time Stamp */}
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
                  Doors Open
                </span>
                <span className="text-4xl sm:text-6xl font-black text-brand-primary font-display tracking-tight leading-none">
                  {eventConfig.event.doorsOpen}
                </span>
              </div>

              {/* Center Venue Stamp */}
              <div className="flex flex-col items-center justify-center px-4 py-2 rounded-2xl bg-brand-card-hover border border-brand-primary/30 shadow-inner">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Official Venue
                </span>
                <span className="text-xl sm:text-2xl font-black text-brand-primary font-display tracking-[0.2em] uppercase">
                  {eventConfig.event.venueName}
                </span>
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                  {eventConfig.event.venueAddress}
                </span>
              </div>

              {/* Right Date Stamp */}
              <div className="flex flex-col items-center sm:items-end">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
                  Event Date
                </span>
                <span className="text-4xl sm:text-6xl font-black text-brand-primary font-display tracking-tight leading-none">
                  25/08
                </span>
              </div>
            </div>

            {/* Countdown to Event */}
            <div className="mt-8 pt-6 border-t border-brand-border text-center">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-bold block mb-2">
                Countdown to Doors Open ({eventConfig.event.doorsOpen})
              </span>
              <Countdown targetIso={doorsOpenIso} />
            </div>

            {/* Primary Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <Link
                href="/checkout"
                id="hero-primary-cta-btn"
                className={`w-full sm:w-auto min-h-[56px] px-10 py-4 rounded-2xl bg-brand-primary hover:bg-brand-primary-hover text-black font-black text-lg sm:text-xl uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(226,255,0,0.4)] ${
                  prefersReducedMotion ? '' : 'transition-transform duration-150 active:scale-95'
                }`}
              >
                <Ticket className="w-6 h-6 text-black" />
                <span>BUY PARTY PASS ({unitPriceFormatted})</span>
                <ArrowRight className="w-5 h-5 text-black" />
              </Link>

              <button
                type="button"
                id="hero-share-btn"
                onClick={handleShare}
                className="w-full sm:w-auto min-h-[56px] px-6 py-4 rounded-2xl bg-brand-card-hover hover:bg-brand-border border border-brand-border-strong text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
                aria-label="Share event link"
              >
                {copiedLink ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-brand-primary" />
                    <span className="text-brand-primary">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-5 h-5 text-slate-400" />
                    <span>Share Event</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================
          3. LIVE CAPACITY STRIP
      ======================================================== */}
      <section
        id="live-status-strip"
        aria-label="Live ticket capacity status"
        className="w-full bg-brand-raised border-b border-brand-border py-6 px-4 sm:px-6"
      >
        <div className="max-w-3xl mx-auto">
          <CapacityMeter
            sold={salesSummary?.ticketsSold ?? 214}
            capacity={eventConfig.ticketing.capacity}
            lowStockThreshold={eventConfig.ticketing.lowStockThreshold}
            showCount={eventConfig.featureFlags.showLiveSalesCounter}
          />
        </div>
      </section>

      {/* ========================================================
          4. EVENT DETAILS & ACCESS RULES
      ======================================================== */}
      <section
        id="the-details-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 bg-brand-card border-y border-brand-border"
      >
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            title="Event Schedule & Venue Guidelines"
            subtitle="Important entry, dress code, and gate guidelines for all attendees."
            eyebrow="Crucial Guidelines"
          />

          <div className="space-y-3.5 sm:space-y-4">
            <DetailRow
              icon={Calendar}
              label="Date & Schedule"
              value={eventConfig.event.date}
              subValue={`Doors open at ${eventConfig.event.doorsOpen} • Closes at ${eventConfig.event.endsAt}`}
            />

            <DetailRow
              icon={MapPin}
              label="Venue Location"
              value={eventConfig.event.venueName}
              subValue={eventConfig.event.venueAddress}
              actionHref={eventConfig.event.venueMapUrl}
              actionLabel="Get Directions"
            />

            <DetailRow
              icon={Shirt}
              label="Dress Code"
              value={eventConfig.event.dressCode}
            />

            <DetailRow
              icon={ShieldAlert}
              label="Age & Identification Policy"
              value={eventConfig.event.policies.ageOrIdPolicy}
              subValue="Strict security at the door. Valid photo ID required."
            />
          </div>
        </div>
      </section>

      {/* ========================================================
          5. PRICING & IMMEDIATE CHECKOUT PASS CARD
      ======================================================== */}
      <section
        id="pricing-cta-section"
        className="w-full py-16 sm:py-20 px-4 sm:px-6 max-w-4xl mx-auto text-center"
      >
        <div className="p-8 sm:p-12 rounded-3xl bg-brand-card border-2 border-brand-primary/40 flex flex-col items-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-brand-primary" />

          <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-brand-primary mb-2 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30">
            Official Admission Pass
          </span>

          <h2 className="text-3xl sm:text-5xl font-black text-white font-display uppercase mb-4 tracking-tight">
            Secure Your {eventConfig.event.tagline} Pass
          </h2>

          <div className="mb-4">
            <PriceTag size="lg" />
          </div>

          <p className="text-sm font-semibold text-rose-400 mb-8">
            Strict capacity limited to {eventConfig.ticketing.capacity} passes.
          </p>

          <Link
            href="/checkout"
            id="pricing-section-cta-btn"
            className={`w-full sm:w-auto min-h-[58px] px-12 py-4 rounded-2xl bg-brand-primary hover:bg-brand-primary-hover text-black font-black text-xl uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(226,255,0,0.5)] ${
              prefersReducedMotion ? '' : 'transition-transform duration-150 active:scale-95'
            }`}
          >
            <Ticket className="w-6 h-6 text-black" />
            <span>GET YOUR PASS NOW →</span>
          </Link>

          <p className="text-xs text-slate-400 mt-4 font-medium">
            Instant digital ticket generation with high-speed QR verification at the gate.
          </p>
        </div>
      </section>

      {/* ========================================================
          6. FAQ ACCORDION
      ======================================================== */}
      <section
        id="faq-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 max-w-3xl mx-auto border-t border-brand-border"
      >
        <SectionHeading
          title="Frequently Asked Questions"
          subtitle="Everything you need to know about passes, gate admission, and door rules."
          eyebrow="Help & Support"
        />

        <div className="space-y-3">
          {defaultFaqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={faq.question}
                id={`faq-item-${index}`}
                className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden"
              >
                <button
                  type="button"
                  id={`faq-toggle-btn-${index}`}
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  className="w-full min-h-[54px] p-4 sm:p-5 flex items-center justify-between gap-4 text-left transition-colors hover:bg-brand-card-hover"
                >
                  <span className="text-base sm:text-lg font-bold text-white leading-snug">
                    {faq.question}
                  </span>
                  <div
                    className="w-8 h-8 rounded-full bg-brand-card-hover flex items-center justify-center text-brand-primary flex-shrink-0"
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: prefersReducedMotion ? 'none' : 'transform 0.2s ease',
                    }}
                  >
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${index}`}
                    className="px-4 pb-5 sm:px-5 sm:pb-6 text-sm sm:text-base text-slate-300 leading-relaxed border-t border-brand-border pt-3"
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}

          {/* Refund policy box */}
          <div
            id="faq-refund-policy-box"
            className="p-5 rounded-2xl bg-brand-card-hover border border-brand-border text-xs sm:text-sm text-slate-300 mt-6"
          >
            <strong className="text-white font-bold block mb-1">
              Official Policy:
            </strong>
            <p className="leading-relaxed">{eventConfig.event.policies.refundPolicy}</p>
          </div>
        </div>
      </section>

      {/* ========================================================
          7. STICKY MOBILE BUY BAR
      ======================================================== */}
      <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden bg-brand-surface/95 border-t border-brand-border p-3 backdrop-blur-lg flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400">LAST DANCE PASS</span>
          <span className="text-lg font-black text-brand-primary font-mono leading-none">{unitPriceFormatted}</span>
        </div>
        <Link
          href="/checkout"
          id="mobile-sticky-buy-btn"
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-brand-primary text-black font-black text-sm uppercase flex items-center gap-1.5 shadow-lg active:scale-95"
        >
          <span>GET PASS →</span>
        </Link>
      </div>

      {/* ========================================================
          8. FOOTER
      ======================================================== */}
      <footer
        id="event-footer"
        className="w-full mt-auto bg-brand-raised border-t border-brand-border py-12 px-4 sm:px-6 pb-20 sm:pb-12"
      >
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-8 text-center md:text-left">
          {/* Organiser Column */}
          <div className="max-w-sm">
            <h3 className="text-2xl font-black text-brand-primary font-display uppercase tracking-tight mb-1">
              {eventConfig.event.name}
            </h3>
            <p className="text-sm text-slate-400 mb-2">
              {eventConfig.event.tagline} • {eventConfig.event.hostedBy}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              Contact: {eventConfig.support.email}
            </p>
          </div>

          {/* WhatsApp Support Button */}
          <div className="flex flex-col items-center md:items-end gap-3">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Need assistance?
            </span>
            <WhatsAppSupportButton variant="primary" label="Official WhatsApp Desk" />
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-8 mt-8 border-t border-brand-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© 2026 {eventConfig.event.name} • {eventConfig.event.hostedBy}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="hover:text-white transition-colors">
              Organizers Admin
            </Link>
            <span>•</span>
            <Link href="/scan" className="hover:text-white transition-colors">
              Door Scanner
            </Link>
            <span>•</span>
            <a
              href="#faq-refund-policy-box"
              className="hover:text-white transition-colors"
            >
              Terms & Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
