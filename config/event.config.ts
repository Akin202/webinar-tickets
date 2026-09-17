import type { AttendeeType } from '@/types/ticketing';

// ============================================================
// CONTRACT — every instance-specific string, price, date, colour and asset.
// Nothing event-specific may be hardcoded in a component: swapping this file
// is what turns the build into a different event.
//
// Placeholders use a TODO marker or the reserved invalid TLD ON PURPOSE:
// tests/config.test.ts fails while any survive, so a forgotten value breaks
// `npm test` instead of reaching a paying attendee.
// ============================================================

export const eventConfig = {
  event: {
    name: "FlagIQ AI Summit '26",
    nameHighlight: "AI Summit",   // set in Flag Red inside the hero headline
    shortName: "AI Summit '26",
    eyebrow: "One room · One day · limited seats",
    lede:
      "A full day on where AI actually is right now, what it means for your work, and what you can do with it on Monday morning. Live at the AI UniPod, University of Lagos.",
    tagline: "AI Summit '26",
    hostedBy: "FlagIQ",
    date: "2026-10-03",
    // West Africa Time. Nigeria does not observe DST, so this is constant.
    utcOffset: "+01:00",
    doorsOpen: "10:00",   // 24h clock
    endsAt: "16:00",
    venueName: "AI UniPod",
    venueArea: "University of Lagos",
    venueAddress: "AI UniPod, University of Lagos, Akoka, Lagos",
    venueMapUrl: "https://maps.app.goo.gl/xAkVBRoRgQfqvSn99",
  },

  ticketing: {
    priceKobo: 1_000_000,           // ₦10,000 — the seed; /admin can change the live price
    currency: "NGN" as const,
    // The real room size. ENFORCED but never displayed: the owner's call
    // (2026-09-17) is that buyers see scarcity, not arithmetic. No count, no
    // "N left", no meter — see featureFlags.showLiveSalesCounter.
    capacity: 100,
    maxPerOrder: 5,
    // Kept for the day the counter is switched back on; nothing reads it
    // while showLiveSalesCounter is false.
    lowStockThreshold: 15,

    // The buyer pays the seat, a flat service charge per seat, and Paystack's
    // gateway fee on top — so ₦10,000 per seat reaches FlagIQ intact
    // (2026-09-17, owner's call; it used to be absorbed).
    // FLAT per seat, not a rate: /admin can change the live price, and a
    // percentage would shrink with it. computeOrderTotals grosses the total up
    // so Paystack's cut of its own fee is covered too.
    passFeeToBuyer: true,
    serviceChargeKoboPerSeat: 25_000,   // ₦250 per seat
    serviceChargeLabel: "Service charge",

    // PRIMARY sales gate, controlled from /admin.
    salesOpen: true,

    // BACKSTOP ONLY. Must equal the value the Summit migration writes to
    // event_settings — tests/migration-invariants.test.ts compares them.
    salesHardStopAt: "2026-10-02T23:59:00+01:00",
  },

  /** Checkout's one segmentation question. Values are pinned to the contract. */
  attendeeTypes: [
    { value: "student", label: "Student or fresh graduate" },
    { value: "professional", label: "Working professional" },
    { value: "founder", label: "Founder or business owner" },
  ] satisfies ReadonlyArray<{ value: AttendeeType; label: string }>,

  seat: {
    tag: "In person · Lagos",
    title: "Summit seat",
    priceNote: "per seat, plus fees",
    // Sits under the live total on the seat card. The ₦250 here must match
    // ticketing.serviceChargeKoboPerSeat — tests/config.test.ts pins them
    // together so the copy can never drift from what the buyer is charged.
    feeNote:
      "The total includes a ₦250 service charge per seat and the Paystack card fee.",
    includes: [
      "A seat in the room for the full day, 10:00 to 16:00",
      "Every session, including the two workshops",
      "Lunch and refreshments",
      "A one-time Flag Skool Cohort 2 discount, for attendees only",
      "Structured networking with the speakers and the room",
      "Entry to the Flag Skool community on Telegram",
    ],
    microcopy:
      "Card, bank transfer and USSD through Paystack. Your QR ticket arrives the moment payment clears.",
  },

  livestream: {
    tag: "Online · Free",
    title: "Livestream",
    priceNote: "no card needed",
    includes: [
      "Every main-stage talk, streamed live",
      "Live Q&A in the chat",
      "Entry to the Flag Skool community on Telegram",
      "The recording, sent to you afterwards",
    ],
    microcopy:
      "Name, email and phone number. We send you the link the day before and a reminder an hour ahead. Livestream registrations do not take a seat in the room.",

    /** The registration form. No payment, no QR — an email address on a list. */
    form: {
      openLabel: "Register for the livestream",
      submitLabel: "Register free",
      submittingLabel: "Registering…",
      nameLabel: "Full name",
      emailLabel: "Email",
      phoneLabel: "Phone number",
      phoneHint: "Nigerian number, e.g. 0801 234 5678",
      attendeeTypeLabel: "Which sounds most like you?",
      attendeeTypePlaceholder: "Choose one",
      marketingLabel: "Send me occasional updates from FlagIQ",
      // Shown after a first-time registration and a repeat one. Both are a
      // success: a repeat must never read as an error, or people register
      // again and again.
      successHeading: "You're on the list",
      successBody:
        "Check your email for the confirmation. We send the stream link the day before, and a reminder an hour before we start.",
      alreadyHeading: "You're already registered",
      alreadyBody:
        "That email is on the list. We've sent the confirmation again, and the stream link follows the day before.",
      errorFallback:
        "Something went wrong and you are not registered yet. Please try again, or message us on WhatsApp.",
    },
  },

  copy: {
    hero: {
      // The venue-and-price line under the headline reads
      // "AI UniPod, University of Lagos. Limited seats, ₦10,000 plus fees."
      // Deliberately no number: see ticketing.capacity.
      seatsPhrase: "Limited seats",
      priceSuffix: "plus fees",
      seatCta: "Get a seat",
      livestreamCta: "Livestream",
      menuLabel: "Menu",
      helpLabel: "Help on WhatsApp",
    },
    dayPreview: {
      // The hero's agenda preview: doors, each named speaker, the launch.
      heading: "The day",
      launchTag: "Launch",
      fullProgrammeLink: "See the full programme",
    },
    tickets: {
      eyebrow: "Two ways in",
      heading: "Be in the room, or watch it live.",
      body:
        "Seats are limited, and the room is the only place the networking, the workshops and the Cohort 2 discount happen. The livestream is free and always will be.",
    },
    speakers: {
      eyebrow: "Speaking",
      heading: "People who are actually building.",
      body:
        "No panels about the future of AI in the abstract. Every speaker is shipping something now and will show you what that looks like.",
    },
    programme: {
      eyebrow: "The day",
      heading: "Six hours, fourteen slots, one break.",
      body:
        "Times are indicative and the order is fixed. Doors at 10:00 sharp — Lagos traffic on a Saturday is kind, so there is no excuse.",
    },
    audiences: {
      eyebrow: "Who it's for",
      heading: "A deliberately mixed room.",
    },
    faq: {
      eyebrow: "Before you pay",
      heading: "The questions we'll get anyway.",
    },
    closer: {
      heading: "One room. One Saturday.",
      body: "Everyone leaves with something they can use on Monday. That's the whole promise.",
    },
  },

  // photoUrl null renders an initials placeholder. announced:false is the
  // "one more to come" card — flipping it is the second announcement moment.
  speakers: [
    { id: "solarin-akintunde", name: "Solarin Akintunde", role: null, photoUrl: null, announced: true },
    { id: "michael-pepper", name: "Michael Pepper", role: null, photoUrl: null, announced: true },
    {
      id: "chika-yinka-banjo",
      name: "Prof. Chika Yinka-Banjo",
      role: "Director, AI UniPod, University of Lagos. Host of the summit.",
      photoUrl: null,
      announced: true,
    },
    { id: "saheed-niyi", name: "Saheed Niyi", role: null, photoUrl: null, announced: true },
    {
      id: "tba",
      name: "One more to come",
      role: "The final speaker is confirmed in the week of 22 September.",
      photoUrl: null,
      announced: false,
    },
  ] as ReadonlyArray<{
    id: string;
    name: string;
    role: string | null;
    photoUrl: string | null;
    announced: boolean;
  }>,

  programme: [
    { time: "10:00", title: "Doors open, registration and coffee", durationMins: 30 },
    { time: "10:30", title: "Opening — and how FlagIQ started", durationMins: 25, speakerId: "solarin-akintunde" },
    { time: "10:55", title: "A talk on AI", durationMins: 20, speakerId: "solarin-akintunde" },
    { time: "11:15", title: "Prof. Chika Yinka-Banjo", durationMins: 25, speakerId: "chika-yinka-banjo" },
    { time: "11:40", title: "Where we are now", durationMins: 20, speakerId: "solarin-akintunde" },
    { time: "12:00", title: "What you can do with it", durationMins: 25, speakerId: "solarin-akintunde" },
    { time: "12:25", title: "Testimonials from the community", durationMins: 15 },
    { time: "12:40", title: "Break — lunch and networking", durationMins: 40, isBreak: true },
    { time: "13:20", title: "Michael Pepper", durationMins: 30, speakerId: "michael-pepper" },
    { time: "13:50", title: "To be announced", durationMins: 25, speakerId: "tba" },
    { time: "14:15", title: "Saheed Niyi", durationMins: 25, speakerId: "saheed-niyi" },
    { time: "14:40", title: "Product launch", durationMins: 30, isLaunch: true },
    { time: "15:10", title: "Open networking", durationMins: 50 },
    { time: "16:00", title: "Close", durationMins: null },
  ] as ReadonlyArray<{
    time: string;
    title: string;
    durationMins: number | null;
    speakerId?: string;
    isBreak?: boolean;
    /** The day's marked moment: highlighted in the hero's agenda preview. */
    isLaunch?: boolean;
  }>,

  audiences: [
    {
      title: "Students & fresh grads",
      body:
        "You keep hearing AI will take the job you haven't got yet. Leave knowing which skills actually compound and what to build this month to prove them.",
    },
    {
      title: "Working professionals",
      body:
        "You've used ChatGPT and stopped there. Leave with two or three workflows you can put into your actual job on Monday without asking anyone's permission.",
    },
    {
      title: "Founders & business owners",
      body:
        "You're being sold AI transformation by five different people. Leave able to tell what's real, what it costs in Nigeria, and what to do first.",
    },
  ],

  faq: [
    {
      question: "Can I pay by bank transfer?",
      answer:
        "Yes. Choose bank transfer at the Paystack checkout and your ticket is issued automatically once it clears.",
    },
    {
      question: "What do I get with a seat?",
      answer:
        "A seat for the full day, every session including both workshops, lunch and refreshments, the attendee-only Cohort 2 discount, and the networking block. There is nothing else to pay on the day.",
    },
    {
      question: "Why is the total a bit more than ₦10,000?",
      answer:
        "The seat is ₦10,000. On top of that there is a ₦250 service charge per seat and the card fee Paystack charges for processing the payment. Checkout shows you every line and the exact total before you pay anything.",
    },
    {
      question: "I'm not in Lagos. Is the livestream really free?",
      answer:
        "Really free. Every main-stage talk is streamed and you get the recording afterwards. What you won't get is the room, the workshops and the networking, which is the honest reason to travel.",
    },
    {
      question: "What if it sells out?",
      answer:
        "Seats are limited and there is no overbooking. When the last one sells, that's it — there is no waitlist. The livestream stays free.",
    },
  ],

  brand: {
    primary: "#E3173E",   // signal red: primary actions and the launch marker (white on it 4.7:1)
    accent: "#FF5C7A",    // focus rings and hover on the dark ground
    ink: "#F5F7FA",       // text on the navy ground (18:1)
    surface: "#081028",   // public pages are dark navy end to end
    // No photo on the LCP path: the hero is an inline SVG. Swap in a venue
    // photo here (self-hosted under /public/assets) when one is chosen.
    heroImageUrl: null as string | null,
    // next/font self-hosts these under generated family names, exposed as
    // CSS variables from app/layout.tsx.
    // Public pages set every line in the heading family (Figtree). fontBody
    // stays the /admin and /scan workhorse so the tools never change.
    fontHeading: "var(--font-figtree), system-ui, sans-serif",
    fontBody: "var(--font-instrument), system-ui, sans-serif",
    fontMono: "var(--font-jetbrains), ui-monospace, monospace",
  },

  staff: {
    // The door terminal's Supabase Auth identity; the 6-digit gate PIN is its
    // password. Never receives mail. Must be final BEFORE seed-staff.mjs runs —
    // changing it afterwards orphans the door account.
    scannerEmail: "admin@flagiq.org",
  },

  support: {
    whatsappNumber: "+2348139927805",
    whatsappMessage: "Hi, I need help with my AI Summit ticket",
    // Must be a real inbox. A host that is a CNAME to Vercel cannot hold MX.
    email: "admin@flagiq.org",
    organiserName: "FlagIQ",
  },

  legal: {
    // Bump whenever the disclosure in lib/cookie-inventory.ts changes.
    policyLastUpdated: "2026-09-14",
    dataControllerName: "FlagIQ",
    paymentProcessorName: "Paystack",
    paymentProcessorPrivacyUrl: "https://paystack.com/privacy/merchant",
  },

  seo: {
    // Also the fallback when NEXT_PUBLIC_SITE_URL is unset — it decides where
    // Paystack sends buyers back to. Must always name a host we control.
    siteUrl: "https://webinar.flagiq.org",
    title: "FlagIQ AI Summit '26 — 3 October, AI UniPod",
    description:
      "One room, one day, limited seats. Where AI actually is right now and what to do with it on Monday. In person at the AI UniPod, University of Lagos, or free on the livestream.",
  },

  featureFlags: {
    // The buyer can change the name printed on a ticket from their ticket
    // link until doors open. The QR stays the same; the phone stays the buyer's.
    allowNameChange: true,
    // OFF at the owner's request (2026-09-17): no seat count, no "N left"
    // and no meter anywhere public. The card shows scarcity in words instead.
    showLiveSalesCounter: false,
  },
} as const;

export type EventConfig = typeof eventConfig;

/** Doors-open as a real instant, derived from the config fields above. */
export const doorsOpenIso =
  `${eventConfig.event.date}T${eventConfig.event.doorsOpen}:00${eventConfig.event.utcOffset}`;

/** `2026-08-25` + 1 → `2026-08-26`. UTC arithmetic, so no DST or locale drift. */
function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * When the event actually ends, as a real instant. Handles an end time that
 * falls after midnight (earlier than doors) by rolling it to the next day, so
 * the helper stays correct for an evening event reusing this build.
 */
export const eventEndsIso = (() => {
  const endsNextDay = eventConfig.event.endsAt < eventConfig.event.doorsOpen;
  const day = endsNextDay ? addOneDay(eventConfig.event.date) : eventConfig.event.date;
  return `${day}T${eventConfig.event.endsAt}:00${eventConfig.event.utcOffset}`;
})();

/** `03/10` — derived rather than typed, so no surface can advertise a different day. */
export const eventDayStamp = (() => {
  const [, month, day] = eventConfig.event.date.split('-');
  return `${day}/${month}`;
})();

/** `YYYYMMDDTHHMMSSZ` — the only timestamp format Google Calendar accepts. */
export function toCalendarStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
