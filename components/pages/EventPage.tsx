'use client';

import React, { useState } from 'react';

import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  MapPin,
  ShieldAlert,
  Shirt,
  Ticket,
  ChevronDown,
  ArrowRight,
  Share2,
  CheckCircle,
  Wine,
  Sparkles,
  PartyPopper,
  Flame,
} from 'lucide-react';
import { eventConfig, doorsOpenIso, eventDayStamp } from '@/config/event.config';
import { koboToNaira } from '@/types/ticketing';
import { Countdown } from '@/components/Countdown';
import { PriceTag } from '@/components/PriceTag';
import { DetailRow } from '@/components/DetailRow';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { SectionHeading } from '@/components/SectionHeading';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const defaultFaqs = [
  {
    question: "Is this event BYOB (Bring Your Own Bottle)?",
    answer: "Yes! Last Dance is a BYOB (Bring Your Own Bottle) event. Everyone is encouraged to bring their own bottles, drinks, and alcohol to celebrate the sign-out in full energy with fellow graduating engineers."
  },
  {
    question: "How do I get my ticket after paying?",
    // Still no Google Wallet pass, so that claim stays out. Email is real
    // now but described as a backup, because it is: it can bounce, land in
    // spam, or be typed wrong at checkout.
    answer: "Your QR pass appears on screen the moment payment clears — save it there and then, using the Save Pass button. We also email you the link as a backup, but do not wait on it: save the pass on the spot."
  },
  {
    question: "What is the dress code for Last Dance?",
    answer: `The dress code is '${eventConfig.event.dressCode}'. We strongly encourage signed white graduation shirts, custom signout markers, and rave-chic nightclub outfits.`
  },
  {
    question: "Can someone else use my ticket if I can't attend?",
    // "once" was never enforced, and renaming genuinely does close at doors —
    // the manifest is on the door phones by then and may be offline for the
    // rest of the night, so a late change would leave the gate challenging a
    // name the pass no longer shows.
    answer: `Tickets are non-refundable and non-transferable at the gate. Before doors open at ${eventConfig.event.doorsOpen} you can change the name on a pass from the ticket page; after that the name is fixed. The phone number on the pass never changes — door staff use it to confirm the pass is yours.`
  },
  {
    question: "What are the door requirements & security checks?",
    answer: "Every attendee must present their digital QR pass and a valid photo ID. Age policy: " + eventConfig.event.policies.ageOrIdPolicy + ". Bags are subject to security search at the entrance."
  }
];

export const EventPage: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const prefersReducedMotion = useReducedMotion();

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
    <div className="min-h-screen bg-brand-surface text-white flex flex-col selection:bg-brand-primary selection:text-black overflow-x-hidden pb-20 sm:pb-0">
      {/* ========================================================
          1. TOP TICKER RIBBON (Poster Ticker Tape)
      ======================================================== */}
      <div className="w-full bg-brand-primary text-black py-1.5 px-3 overflow-hidden select-none border-b border-black font-mono-code font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center">
        <div className="flex items-center gap-4 sm:gap-6 animate-pulse whitespace-nowrap overflow-x-auto no-scrollbar mx-auto max-w-full">
          <span>⚡ {eventConfig.event.tagline.toUpperCase()}</span>
          <span>•</span>
          <span>{eventConfig.event.name.toUpperCase()}</span>
          <span>•</span>
          <span>DOORS OPEN {eventConfig.event.doorsOpen}</span>
          <span>•</span>
          <span>🍾 BYOB EVENT</span>
          <span>•</span>
          <span>{eventConfig.event.venueName.toUpperCase()}</span>
          <span>•</span>
          <span>{eventConfig.event.dressCode.toUpperCase()}</span>
        </div>
      </div>

      {/* ========================================================
          2. AUTHENTIC TICKETING PASS HERO SECTION
      ======================================================== */}
      <header
        id="event-hero"
        className="relative w-full overflow-hidden border-b border-brand-border bg-brand-raised pt-4 sm:pt-10 pb-10 sm:pb-16 px-3 sm:px-6"
      >
        {/* Background Nightclub Atmosphere */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <Image
            src={eventConfig.brand.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-25 scale-105 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-surface via-brand-surface/85 to-brand-surface/70" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--brand-surface)_90%)]" />
        </div>

        {/* Master Ticket Frame Container */}
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          
          {/* Main Admission Pass / Ticket Box */}
          <div className="w-full rounded-2xl sm:rounded-3xl bg-brand-card/95 border-2 border-brand-border shadow-2xl backdrop-blur-md relative overflow-hidden">
            
            {/* Top Metallic / Neon Ticket Accent Strip */}
            <div className="h-2 w-full bg-brand-primary shadow-[0_0_15px_var(--brand-primary)]" />

            {/* Ticket Header Ribbon */}
            <div className="px-4 sm:px-8 py-3 sm:py-3.5 bg-brand-subtle/70 border-b border-brand-border flex flex-wrap items-center justify-between gap-2 text-xs font-mono-code font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5 sm:gap-2 text-brand-primary">
                <Ticket className="w-4 h-4" />
                <span className="text-[11px] sm:text-xs">OFFICIAL ADMISSION PASS</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-slate-300">
                <span className="hidden sm:inline text-slate-400">NO. #TKT-2026-LD</span>
                <span className="px-2.5 py-0.5 rounded-full bg-brand-primary/15 border border-brand-primary/40 text-brand-primary text-[10px] sm:text-[11px] font-black">
                  ADMIT ONE • GENERAL PASS
                </span>
              </div>
            </div>

            {/* Main Ticket Body */}
            <div className="p-4 sm:p-10 pb-6 sm:pb-8">
              
              {/* Event Tagline & Branding */}
              <div className="text-center">
                <span className="inline-block text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-3 py-1 rounded-full mb-2 sm:mb-3">
                  SIGN-OUT 2026 • OFFICIAL ACCESS
                </span>

                <h1 className="text-4xl xs:text-5xl sm:text-8xl md:text-9xl font-black tracking-tighter text-brand-primary uppercase font-display leading-[0.88] drop-shadow-[0_4px_28px_rgba(226,255,0,0.4)] select-none break-words">
                  {eventConfig.event.tagline.toUpperCase()}
                </h1>

                {/* Sub-banner ribbon (Clean ticket strip with NO stray dots) */}
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-3 sm:mt-4 py-2 border-y border-brand-border text-slate-200 font-bold uppercase text-xs sm:text-base md:text-lg tracking-wider sm:tracking-widest px-2 font-mono-code bg-brand-subtle/30">
                  <span className="text-brand-primary font-black">SIGN-OUT</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-white font-black">AFTER PARTY</span>
                </div>
              </div>

              {/* Event Description & BYOB Highlight Box */}
              <div className="py-6 sm:py-7 text-center max-w-2xl mx-auto space-y-4">
                <p className="text-base sm:text-xl text-slate-200 font-semibold leading-relaxed">
                  Hosted by the Faculty of Engineering. The definitive sign-out after-party celebration to wrap up an epic university journey.
                </p>

                {/* Event Highlights & Badges Bar (BYOB & Dress Code) */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {/* Distinct BYOB Pill Badge */}
                  <div
                    id="byob-pill-badge"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/15 border-2 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.25)] text-xs sm:text-sm font-black uppercase tracking-wider animate-pulse-subtle"
                  >
                    <Wine className="w-4 h-4 text-amber-300" />
                    <span>BYOB • BRING YOUR OWN BOTTLE</span>
                  </div>

                  {/* Dress Code Pill Badge */}
                  <div
                    id="dress-code-badge"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-card-hover border border-brand-border-strong text-xs sm:text-sm font-bold text-slate-200"
                  >
                    <Shirt className="w-4 h-4 text-brand-primary" />
                    <span>Dress Code: <strong className="text-brand-primary font-bold">{eventConfig.event.dressCode}</strong></span>
                  </div>
                </div>

                {/* Streamlined BYOB Admission Notice Strip */}
                <div
                  id="byob-details-card"
                  className="mx-auto max-w-xl p-3.5 sm:p-4 rounded-2xl bg-brand-subtle/80 border border-brand-border text-center flex items-center justify-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium text-left leading-snug">
                    <strong className="text-amber-300 font-bold">Party Policy:</strong> This is a BYOB event — everyone is welcome to come with their own drinks, bottles & alcohol.
                  </p>
                </div>
              </div>

              {/* Ticket Key Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-center">
                
                {/* Doors Open */}
                <div className="p-4 rounded-2xl bg-brand-subtle/60 border border-brand-border flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
                    Doors Open
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary font-display tracking-tight mt-0.5">
                    {eventConfig.event.doorsOpen}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">11:30 PM (WAT)</span>
                </div>

                {/* Venue */}
                <div className="p-4 rounded-2xl bg-brand-subtle/60 border border-brand-border flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
                    Venue Location
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-brand-primary font-display uppercase tracking-wider mt-0.5">
                    {eventConfig.event.venueName}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate max-w-[200px] font-mono">
                    {eventConfig.event.venueAddress}
                  </span>
                </div>

                {/* Date */}
                <div className="p-4 rounded-2xl bg-brand-subtle/60 border border-brand-border flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
                    Event Date
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary font-display tracking-tight mt-0.5">
                    {eventDayStamp}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">25th August 2026</span>
                </div>
              </div>
            </div>

            {/* Perforated Tear-off Line with Realistic Notches */}
            <div className="relative flex items-center justify-between px-0 py-2">
              {/* Left Cutout Notch */}
              <div className="w-6 h-10 -ml-3 rounded-r-full bg-brand-surface border-y border-r border-brand-border" />
              
              {/* Dashed Tear Line */}
              <div className="flex-1 border-t-2 border-dashed border-brand-border/70 mx-3" />
              
              {/* Right Cutout Notch */}
              <div className="w-6 h-10 -mr-3 rounded-l-full bg-brand-surface border-y border-l border-brand-border" />
            </div>

            {/* Ticket Action Stub / Admission Terminal */}
            <div className="p-5 sm:p-8 pt-4 bg-brand-subtle/40">
              
              {/* Decorative Ticket Barcode & Serial Matrix */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-brand-border text-center sm:text-left">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">
                    Admission Price
                  </span>
                  <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                    <span className="text-3xl sm:text-4xl font-black text-brand-primary font-mono leading-none">
                      {unitPriceFormatted}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">/ person</span>
                  </div>
                </div>

                {/* Faux Barcode Representation */}
                <div className="flex flex-col items-center sm:items-end">
                  <div className="flex items-center gap-[2px] h-9 px-3 py-1 bg-white/90 rounded-md">
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-1 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-1.5 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-1 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-2 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-1.5 h-full bg-black" />
                    <div className="w-1 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-1.5 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                    <div className="w-2 h-full bg-black" />
                    <div className="w-1 h-full bg-black" />
                    <div className="w-0.5 h-full bg-black" />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 tracking-wider mt-1">
                    *SECURE-QR-GATE-GATEPASS*
                  </span>
                </div>
              </div>

              {/* Countdown to Doors Open */}
              <div className="py-6 text-center">
                <span className="text-xs uppercase tracking-widest text-slate-400 font-bold block mb-2">
                  Countdown to Doors Open ({eventConfig.event.doorsOpen})
                </span>
                <Countdown targetIso={doorsOpenIso} />
              </div>

              {/* Primary Call to Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                <Link
                  href="/checkout"
                  id="hero-primary-cta-btn"
                  className={`w-full sm:w-auto min-h-[58px] px-10 py-4 rounded-2xl bg-brand-primary hover:bg-brand-primary-hover text-black font-black text-lg sm:text-xl uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(226,255,0,0.45)] ${
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
                  className="w-full sm:w-auto min-h-[58px] px-6 py-4 rounded-2xl bg-brand-card-hover hover:bg-brand-border border border-brand-border-strong text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
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

              {/* Micro-trust copy */}
              <p className="text-[11px] text-slate-400 text-center mt-4 font-medium">
                Instant digital pass generated upon payment • Gate QR scan admission • Strict 18+ valid ID required
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================
          3. EVENT DETAILS & ACCESS RULES
      ======================================================== */}
      <section
        id="the-details-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 bg-brand-card border-y border-brand-border"
      >
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            title="Event Schedule & Venue Guidelines"
            subtitle="Important entry, BYOB policy, dress code, and gate guidelines for all attendees."
            eyebrow="Crucial Guidelines"
          />

          <div className="space-y-3.5 sm:space-y-4">
            <DetailRow
              icon={Wine}
              label="BYOB Policy (Bring Your Own Bottle)"
              value="Bring Your Own Alcohol / Drinks"
              subValue="This event is BYOB! Everyone is required and encouraged to come with their own bottle and drinks of choice."
            />

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
          4. PRICING & IMMEDIATE CHECKOUT PASS CARD
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

          <p className="text-sm font-semibold text-brand-muted mb-8">
            Limited admission passes available. Early booking strongly recommended.
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
            <p className="text-xs text-slate-400 font-mono">
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

        <div className="max-w-5xl mx-auto pt-8 mt-8 border-t border-brand-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 {eventConfig.event.name} • {eventConfig.event.hostedBy}. All rights reserved.</p>
          <div className="flex items-center gap-4">
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

