'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Users,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { eventConfig, doorsOpenIso, eventDayStamp } from '@/config/event.config';
import { koboToNaira, computeOrderTotals } from '@/types/ticketing';
import { Countdown } from '@/components/Countdown';
import { PriceTag } from '@/components/PriceTag';
import { DetailRow } from '@/components/DetailRow';
import { QuantityStepper } from '@/components/QuantityStepper';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { SectionHeading } from '@/components/SectionHeading';
import { CookieNotice } from '@/components/CookieNotice';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getPublicSalesCounter } from '@/lib/data-access';

const defaultFaqs = [
  {
    question: "Is this event BYOB (Bring Your Own Bottle)?",
    answer: "Yes! Last Dance is a BYOB (Bring Your Own Bottle) event. Everyone is encouraged to bring their own bottles, drinks, and alcohol to celebrate the sign-out in full energy with fellow graduating students across UNILAG."
  },
  {
    question: "How do I get my ticket after paying?",
    answer: "Your QR pass appears on screen the moment payment clears — save it there and then, using the Save Pass button. We also email you the link as a backup, but do not wait on it: save the pass on the spot."
  },
  {
    question: "What is the dress code for Last Dance?",
    answer: `The dress code is '${eventConfig.event.dressCode}'. We strongly encourage signed white graduation shirts, custom signout markers, and rave-chic nightclub outfits.`
  },
  {
    question: "Can someone else use my ticket if I can't attend?",
    answer: `Tickets are non-refundable and non-transferable at the gate. Before doors open at ${eventConfig.event.doorsOpen} you can change the name on a pass from the ticket page; after that the name is fixed. The phone number on the pass never changes — door staff use it to confirm the pass is yours.`
  },
  {
    question: "What are the door requirements & security checks?",
    answer: `Every attendee must present their digital QR pass and a valid photo ID. Age policy: ${eventConfig.event.policies.ageOrIdPolicy}. Bags are subject to security search at the entrance.`
  }
];

export const EventPage: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [showStickyBar, setShowStickyBar] = useState<boolean>(false);
  const [currentPriceKobo, setCurrentPriceKobo] = useState<number>(eventConfig.ticketing.priceKobo);
  
  const heroCtaRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    getPublicSalesCounter()
      .then((summary) => {
        if (!cancelled && typeof summary.currentPriceKobo === 'number' && summary.currentPriceKobo > 0) {
          setCurrentPriceKobo(summary.currentPriceKobo);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);


  // Sticky mobile buy bar triggered via IntersectionObserver when hero CTA scrolls off
  useEffect(() => {
    const target = heroCtaRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When hero CTA is not intersecting (scrolled past), show sticky bar
        setShowStickyBar(!entry.isIntersecting);
      },
      { threshold: 0.1, rootMargin: '0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${eventConfig.event.tagline} — ${eventConfig.event.name}`,
          text: `${eventConfig.event.tagline} • ${eventConfig.event.hostedBy} • Official Tickets`,
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

  const unitPriceFormatted = koboToNaira(currentPriceKobo);
  
  const ticketTotals = computeOrderTotals({
    quantity: selectedQuantity,
    unitPriceKobo: currentPriceKobo,
    serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
    passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
  });

  return (
    <div className="min-h-screen bg-[#070709] text-[#F5F5F4] flex flex-col selection:bg-[#C8B88A] selection:text-black overflow-x-hidden pb-24 sm:pb-0">
      {/* ========================================================
          1. TOP TICKER RIBBON (Flyer Aesthetic Marquee)
      ======================================================== */}
      <aside aria-label="Event Announcements" className="w-full bg-[#111114] border-b border-[#232328] text-[#A1A1AA] py-2 px-3 overflow-hidden select-none text-xs font-mono tracking-wider flex items-center justify-center">
        <div className="flex items-center gap-4 sm:gap-6 whitespace-nowrap overflow-x-auto no-scrollbar mx-auto max-w-full text-[11px] sm:text-xs">
          <span className="inline-flex items-center gap-1.5 text-[#C8B88A] font-extrabold tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-[#C8B88A]" />
            <span>LAST DANCE • SIGNOUT AFTER PARTY</span>
          </span>
          <span className="text-[#33333B]">•</span>
          <span className="font-semibold text-[#F5F5F4]">SET '24 ⚙️</span>
          <span className="text-[#33333B]">•</span>
          <span className="text-[#C8B88A] font-bold">🍾 BYOB EVENT</span>
          <span className="text-[#33333B]">•</span>
          <span className="font-semibold">DOORS 23:30</span>
          <span className="text-[#33333B]">•</span>
          <span className="font-semibold">{eventDayStamp}</span>
          <span className="text-[#33333B]">•</span>
          <span className="text-[#F5F5F4] font-bold">📍 BFF LAGOS</span>
          <span className="text-[#33333B]">•</span>
          <span>{eventConfig.event.hostedBy.toUpperCase()}</span>
        </div>
      </aside>

      {/* ========================================================
          2. MOODY / CINEMATIC HERO SECTION (Matching Flyer Vibe)
      ======================================================== */}
      <header
        id="event-hero"
        className="relative w-full overflow-hidden border-b border-[#232328] bg-[#070709] pt-6 sm:pt-12 pb-12 sm:pb-20 px-3.5 sm:px-6 grain-overlay"
      >
        {/* Background Atmospheric Hero Image & Neon Glows */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <Image
            src={eventConfig.brand.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-25 scale-105 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/85 to-[#070709]/90" />
          {/* Subtle neon fuchsia ceiling bar light glow inspired by the flyer */}
          <div className="absolute top-0 inset-x-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.18),transparent_70%)]" />
          {/* Warm Champagne Gold ambient radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(200,184,138,0.08),transparent_75%)]" />
        </div>

        {/* Master Ticket Frame Container */}
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          
          {/* Main Admission Pass Card */}
          <div className="w-full rounded-2xl sm:rounded-3xl bg-[#111114]/95 border border-[#232328] shadow-2xl backdrop-blur-md relative overflow-hidden">
            
            {/* Top Accent Champagne Gold Strip */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#9E8652] via-[#C8B88A] to-[#9E8652] shadow-[0_0_20px_rgba(200,184,138,0.4)]" />

            {/* Ticket Header Ribbon */}
            <div className="px-4 sm:px-8 py-3 bg-[#16161B] border-b border-[#232328] flex flex-wrap items-center justify-between gap-2 text-xs font-mono font-medium">
              <div className="flex items-center gap-2 text-[#C8B88A]">
                <Ticket className="w-4 h-4 text-[#C8B88A] flex-shrink-0" />
                <span className="font-extrabold tracking-widest text-[11px] sm:text-xs uppercase text-[#C8B88A]">
                  {eventConfig.event.hostedBy}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-brand-muted">
                <span className="hidden sm:inline text-brand-dim text-[11px] tracking-wider">#SET24-UNILAG</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#C8B88A]/10 border border-[#C8B88A]/30 text-[#C8B88A] text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider">
                  Official Admission Pass
                </span>
              </div>
            </div>

            {/* Main Ticket Content Body */}
            <div className="p-5 sm:p-10 pb-7 sm:pb-9">
              
              {/* Event Tagline & Branding matching Flyer */}
              <div className="text-center space-y-4">
                
                {/* SET '24 Tag */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#18181D] border border-[#2A2A32] text-[#C8B88A] text-xs font-black uppercase tracking-widest shadow-inner">
                  <span>SET '24 ⚙️</span>
                  <span className="text-[#33333B]">•</span>
                  <span>UNILAG SIGNOUT</span>
                </div>

                {/* Massive Flyer Display Title: LAST DANCE */}
                <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tight text-[#C8B88A] uppercase font-display leading-[0.88] select-none break-words drop-shadow-[0_4px_24px_rgba(200,184,138,0.25)]">
                  LAST DANCE
                </h1>

                {/* Flyer Subhead: SIGNOUT | BYOB | AFTER PARTY */}
                <div className="flex items-center justify-center gap-2 sm:gap-4 text-xs sm:text-base md:text-lg font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[#F5F5F4] pt-1">
                  <span className="tracking-widest">SIGNOUT</span>
                  <span className="text-[#C8B88A] opacity-60 font-serif">|</span>
                  <span className="inline-flex items-center gap-1 text-[#C8B88A] font-extrabold bg-[#C8B88A]/10 px-2.5 py-0.5 rounded border border-[#C8B88A]/25">
                    <span>🍾</span>
                    <span>BYOB</span>
                    <span>🍾</span>
                  </span>
                  <span className="text-[#C8B88A] opacity-60 font-serif">|</span>
                  <span className="tracking-widest">AFTER PARTY</span>
                </div>

                {/* Sub-banner Ribbon */}
                <p className="text-sm sm:text-base text-brand-muted max-w-xl mx-auto leading-relaxed pt-2">
                  Hosted by <strong className="text-[#F5F5F4] font-semibold">{eventConfig.event.hostedBy}</strong>. The definitive sign-out after-party celebrating with 200+ graduating students across UNILAG to wrap up an unforgettable university journey.
                </p>
              </div>

              {/* Event Badges (BYOB & Dress Code) */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-6 pb-2">
                {/* Distinct BYOB Pill */}
                <div
                  id="byob-pill-badge"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C8B88A]/10 border border-[#C8B88A]/30 text-[#C8B88A] text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm"
                >
                  <Wine className="w-4 h-4 text-[#C8B88A]" />
                  <span>BYOB • Bring Your Own Bottle</span>
                </div>

                {/* Dress Code Pill */}
                <div
                  id="dress-code-badge"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#18181D] border border-[#2A2A32] text-xs sm:text-sm font-medium text-brand-text"
                >
                  <Shirt className="w-4 h-4 text-[#C8B88A]" />
                  <span>Dress Code: <strong className="text-brand-text font-bold">{eventConfig.event.dressCode}</strong></span>
                </div>
              </div>

              {/* Key Metadata 3-Column Grid Matching Flyer Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 text-center">
                {/* Doors Open / Time: 23:30 */}
                <div className="p-4 rounded-2xl bg-[#16161B] border border-[#232328] flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#A1A1AA]">
                    Doors Open
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-[#C8B88A] font-display tracking-tight mt-1">
                    23:30
                  </span>
                  <span className="text-[11px] text-brand-dim font-mono mt-0.5">11:30 PM (WAT)</span>
                </div>

                {/* Venue: BFF LAGOS */}
                <div className="p-4 rounded-2xl bg-[#16161B] border border-[#232328] flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#A1A1AA]">
                    Venue Location
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-[#F5F5F4] font-display tracking-tight mt-1 flex items-center gap-1">
                    <span>📍</span> {eventConfig.event.venueName}
                  </span>
                  <span className="text-[11px] text-brand-dim truncate max-w-[200px] font-mono mt-0.5">
                    {eventConfig.event.venueAddress}
                  </span>
                </div>

                {/* Date: 26/08 */}
                <div className="p-4 rounded-2xl bg-[#16161B] border border-[#232328] flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#A1A1AA]">
                    Event Date
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-[#C8B88A] font-display tracking-tight mt-1">
                    {eventDayStamp}
                  </span>
                  <span className="text-[11px] text-brand-dim font-mono mt-0.5">26th August 2026</span>
                </div>
              </div>
            </div>

            {/* Perforated Tear-off Line */}
            <div className="relative flex items-center justify-between px-0 py-1">
              <div className="w-6 h-10 -ml-3 rounded-r-full bg-[#070709] border-y border-r border-[#232328]" />
              <div className="flex-1 border-t-2 border-dashed border-[#232328] mx-3" />
              <div className="w-6 h-10 -mr-3 rounded-l-full bg-[#070709] border-y border-l border-[#232328]" />
            </div>

            {/* Ticket Action Stub Area */}
            <div className="p-5 sm:p-8 pt-3 bg-[#141418]/90">
              
              {/* Admission Price & Barcode Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-[#232328] text-center sm:text-left">
                <div className="space-y-0.5">
                  <span className="text-[11px] uppercase font-bold tracking-widest text-[#A1A1AA] block">
                    Admission Pass
                  </span>
                  <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                    <span className="text-3xl sm:text-4xl font-black text-[#C8B88A] font-display leading-none">
                      {unitPriceFormatted}
                    </span>
                    <span className="text-xs text-brand-muted font-medium">/ person (all-in)</span>
                  </div>
                </div>

                {/* Aesthetic Barcode Motif */}
                <div className="flex flex-col items-center sm:items-end">
                  <div className="flex items-center gap-[2px] h-8 px-3 py-1 bg-white rounded">
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
                  <span className="text-[9px] font-mono text-brand-dim tracking-wider mt-1">
                    *SECURE-QR-GATE-GATEPASS*
                  </span>
                </div>
              </div>

              {/* Working Countdown to Doors Open */}
              <div className="py-6 text-center">
                <span className="text-xs uppercase tracking-widest text-brand-muted font-bold block mb-2.5">
                  Countdown to Doors Open ({eventConfig.event.doorsOpen})
                </span>
                <Countdown targetIso={doorsOpenIso} />
              </div>

              {/* Primary Call to Action Buttons */}
              <div ref={heroCtaRef} className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                <Link
                  href="/checkout"
                  id="hero-primary-cta-btn"
                  className={`w-full sm:w-auto min-h-[54px] px-8 py-3.5 rounded-xl bg-[#C8B88A] hover:bg-[#D8C9A3] text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-[#C8B88A]/20 ${
                    prefersReducedMotion ? '' : 'transition-all duration-150 active:scale-98'
                  }`}
                >
                  <Ticket className="w-5 h-5 text-black" />
                  <span>BUY PASS — {unitPriceFormatted}</span>
                  <ArrowRight className="w-5 h-5 text-black" />
                </Link>

                <button
                  type="button"
                  id="hero-share-btn"
                  onClick={handleShare}
                  className="w-full sm:w-auto min-h-[54px] px-6 py-3.5 rounded-xl bg-[#18181D] hover:bg-[#232328] border border-[#2A2A32] text-brand-text font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-98"
                  aria-label="Share event link"
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-[#C8B88A]" />
                      <span className="text-[#C8B88A] font-bold">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-brand-muted" />
                      <span>Share Event</span>
                    </>
                  )}
                </button>
              </div>

              {/* Micro-trust copy */}
              <p className="text-[11px] text-brand-dim text-center mt-3.5 font-medium">
                Instant digital pass generated upon payment • Gate QR scan admission • Strict 18+ photo ID required
              </p>
            </div>
          </div>

          {/* Social Proof Strip */}
          <div className="mt-6 flex items-center justify-center gap-3 px-4 py-2 rounded-full bg-[#111114]/90 border border-[#232328] text-xs text-brand-muted">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="inline-block h-6 w-6 rounded-full bg-[#C8B88A] text-black font-bold flex items-center justify-center text-[10px] ring-2 ring-[#111114]">
                UN
              </div>
              <div className="inline-block h-6 w-6 rounded-full bg-[#22C55E] text-black font-bold flex items-center justify-center text-[10px] ring-2 ring-[#111114]">
                24
              </div>
              <div className="inline-block h-6 w-6 rounded-full bg-[#E11D48] text-white font-bold flex items-center justify-center text-[10px] ring-2 ring-[#111114]">
                LD
              </div>
            </div>
            <span className="font-semibold text-brand-text">
              Join 200+ graduating students across UNILAG celebrating sign-out
            </span>
          </div>

        </div>
      </header>

      {/* ========================================================
          3. SELECTABLE TICKET PASS MODULE (Part 2 Brief)
      ======================================================== */}
      <section
        id="ticket-pass-selection-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 max-w-3xl mx-auto"
      >
        <SectionHeading
          title="Admission Passes"
          subtitle="Select pass quantity and proceed directly to secure checkout."
          eyebrow="Ticket Tier"
        />

        <div className="rounded-3xl bg-[#141416] border-2 border-brand-primary/40 p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-brand-primary" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#26262A] pb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-extrabold uppercase tracking-wider mb-2">
                <span>Tier 1 • Early Bird</span>
              </div>
              <h3 className="text-2xl font-black text-brand-text font-display">
                General Admission Pass
              </h3>
              <p className="text-xs text-brand-muted mt-1">
                Full access to {eventConfig.event.name} • Nightclub entry • BYOB allowed
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-3xl sm:text-4xl font-black text-brand-primary font-display">
                {unitPriceFormatted}
              </span>
              <span className="text-xs text-brand-muted block font-medium">per pass (all-in)</span>
            </div>
          </div>

          {/* Pass Features List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-brand-text font-medium">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>Instant digital QR gate pass</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>BYOB (Bring your own drinks/alcohol)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>Live DJ sets & party lights</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>Photo ID check at doors ({eventConfig.event.doorsOpen})</span>
            </div>
          </div>

          {/* Quantity Selector & Live Total Calculation */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#18181B] border border-[#26262A] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-muted block">
                Select Quantity
              </span>
              <span className="text-xs text-brand-dim">
                Max {eventConfig.ticketing.maxPerOrder} passes per order
              </span>
            </div>

            <div className="flex items-center gap-4">
              <QuantityStepper
                value={selectedQuantity}
                min={1}
                max={eventConfig.ticketing.maxPerOrder}
                onChange={setSelectedQuantity}
              />
              <div className="text-right pl-2">
                <span className="text-xs text-brand-muted font-bold block uppercase">Total</span>
                <span className="text-xl font-black text-brand-primary font-display">
                  {koboToNaira(ticketTotals.totalKobo)}
                </span>
              </div>
            </div>
          </div>

          {/* Direct Buy Button */}
          <div className="pt-2">
            <Link
              href="/checkout"
              id="ticket-module-buy-btn"
              className={`w-full min-h-[52px] px-8 py-3.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-black font-extrabold text-base uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-brand-primary/20 ${
                prefersReducedMotion ? '' : 'transition-all duration-150 active:scale-98'
              }`}
            >
              <Ticket className="w-5 h-5 text-black" />
              <span>Proceed to Checkout ({koboToNaira(ticketTotals.totalKobo)})</span>
              <ArrowRight className="w-5 h-5 text-black" />
            </Link>

            <p className="text-[11px] text-brand-dim text-center mt-3 font-medium">
              Secured by 256-bit Paystack encryption • Debit card, bank transfer & USSD
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================
          4. EVENT DETAILS & ACCESS RULES SECTION
      ======================================================== */}
      <section
        id="the-details-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 bg-[#141416] border-y border-[#26262A]"
      >
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            title="Event Schedule & Guidelines"
            subtitle="Important entry, BYOB policy, dress code, and gate guidelines for all attendees."
            eyebrow="Key Details"
          />

          <div className="space-y-3.5 sm:space-y-4">
            <DetailRow
              icon={Wine}
              label="BYOB Policy (Bring Your Own Bottle)"
              value="Bring Your Own Alcohol / Drinks"
              subValue="This event is BYOB! Everyone is welcome and encouraged to come with their own bottle and drinks of choice to celebrate in full energy."
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
              subValue="Signed white graduation shirts, custom signout markers, or rave-chic club outfits."
            />

            <DetailRow
              icon={ShieldAlert}
              label="Age & Identification Policy"
              value={eventConfig.event.policies.ageOrIdPolicy}
              subValue="Strict security at the door. Valid photo ID required alongside your QR digital pass."
            />
          </div>
        </div>
      </section>

      {/* ========================================================
          5. FAQ ACCORDION
      ======================================================== */}
      <section
        id="faq-section"
        className="w-full py-12 sm:py-16 px-4 sm:px-6 max-w-3xl mx-auto"
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
                className="rounded-2xl bg-[#141416] border border-[#26262A] overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  id={`faq-toggle-btn-${index}`}
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  className="w-full min-h-[52px] p-4 sm:p-5 flex items-center justify-between gap-4 text-left transition-colors hover:bg-[#1C1C1F]"
                >
                  <span className="text-base sm:text-lg font-bold text-brand-text leading-snug">
                    {faq.question}
                  </span>
                  <div
                    className="w-7 h-7 rounded-full bg-[#202024] flex items-center justify-center text-brand-primary flex-shrink-0"
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: prefersReducedMotion ? 'none' : 'transform 0.2s ease',
                    }}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${index}`}
                    className="px-4 pb-5 sm:px-5 sm:pb-6 text-sm sm:text-base text-brand-muted leading-relaxed border-t border-[#26262A] pt-3.5"
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}

          {/* Refund Policy Box */}
          <div
            id="faq-refund-policy-box"
            className="p-5 rounded-2xl bg-[#141416] border border-[#26262A] text-xs sm:text-sm text-brand-muted mt-6"
          >
            <strong className="text-brand-text font-bold block mb-1">
              Official Policy:
            </strong>
            <p className="leading-relaxed">{eventConfig.event.policies.refundPolicy}</p>
          </div>
        </div>
      </section>

      {/* ========================================================
          6. STICKY MOBILE BUY BAR (Triggered on Scroll)
      ======================================================== */}
      {showStickyBar && (
        <div
          id="sticky-mobile-buy-bar"
          // Offset upward by the cookie notice's height while it is on screen,
          // so the notice can never cover the buy CTA. The variable is set and
          // cleared by CookieNotice; with no notice mounted it resolves to 0px
          // and this behaves exactly as `bottom-0` did.
          //
          // transition-[transform,opacity] is load-bearing, not tidying:
          // `duration-200` sets only a duration, and CSS defaults
          // transition-property to `all`, so once `bottom` became a value that
          // CHANGES it started animating too — a layout-bound property, which
          // this project's motion rule forbids. Naming the two compositor
          // properties keeps the entrance animation and drops the rest.
          className="fixed bottom-[var(--cookie-notice-height,0px)] inset-x-0 z-40 sm:hidden bg-[#0A0A0B]/95 border-t border-[#26262A] p-3 backdrop-blur-xl flex items-center justify-between gap-3 shadow-2xl animate-in slide-in-from-bottom duration-200 transition-[transform,opacity]"
        >
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-extrabold text-brand-muted tracking-wider">
              {eventConfig.event.tagline}
            </span>
            <span className="text-lg font-black text-brand-primary font-display leading-none">
              {unitPriceFormatted}
            </span>
          </div>
          <Link
            href="/checkout"
            id="mobile-sticky-buy-btn"
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-primary text-black font-extrabold text-sm uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-transform"
          >
            <Ticket className="w-4 h-4 text-black" />
            <span>Buy Pass →</span>
          </Link>
        </div>
      )}

      {/* ========================================================
          7. FOOTER
      ======================================================== */}
      <footer
        id="event-footer"
        className="w-full mt-auto bg-[#0A0A0B] border-t border-[#26262A] py-12 px-4 sm:px-6 pb-24 sm:pb-12"
      >
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-8 text-center md:text-left">
          {/* Organiser Column */}
          <div className="max-w-sm">
            <h3 className="text-2xl font-extrabold text-brand-primary font-display uppercase tracking-tight mb-1">
              {eventConfig.event.name}
            </h3>
            <p className="text-sm text-brand-muted mb-2">
              {eventConfig.event.tagline} • {eventConfig.event.hostedBy}
            </p>
            <p className="text-xs text-brand-dim font-mono">
              Contact: {eventConfig.support.email}
            </p>
          </div>

          {/* WhatsApp Support Button */}
          <div className="flex flex-col items-center md:items-end gap-2.5">
            <span className="text-xs uppercase font-bold text-brand-muted tracking-wider">
              Need assistance?
            </span>
            <WhatsAppSupportButton variant="primary" label="Official WhatsApp Desk" />
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-8 mt-8 border-t border-[#26262A] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-brand-dim">
          <p>© 2026 {eventConfig.event.name} • {eventConfig.event.hostedBy}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a
              href="#faq-refund-policy-box"
              className="hover:text-brand-text transition-colors"
            >
              Terms &amp; Policy
            </a>
            <Link href="/cookies" className="hover:text-brand-text transition-colors">
              Cookies &amp; Privacy
            </Link>
          </div>
        </div>
      </footer>

      {/* Last in the tree on purpose: it is fixed-position, so DOM order only
          decides where it lands in the tab sequence, and the end is where a
          dismissible notice belongs rather than ahead of the buy button. */}
      <CookieNotice />
    </div>
  );
};
