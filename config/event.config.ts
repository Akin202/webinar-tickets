export const eventConfig = {
  event: {
    name: "Engineering Sign-Out After-Party",
    tagline: "Last Dance",
    hostedBy: "Faculty of Engineering, University of Lagos",
    date: "2026-08-25",
    // West Africa Time. Nigeria does not observe DST, so this is constant.
    utcOffset: "+01:00",
    doorsOpen: "23:30",   // 11:30 PM. 24h clock — do not write 11:30.
    endsAt: "04:00",
    venueName: "BFF Lagos",
    venueAddress: "4 jinbowu street, Yaba Lagos, Nigeria",
    venueMapUrl: "https://maps.app.goo.gl/vNbJxWt4wQzpwJHc6?g_st=ic",
    dressCode: "style your signout outfit",
    policies: {
      ageOrIdPolicy: "must be above 18 years",
      refundPolicy: "no refunds, no transfers, no resales",
    },
  },

  ticketing: {
    priceKobo: 300000,              // ₦3,000 — what the organiser keeps per ticket
    currency: "NGN" as const,
    capacity: 300,                  // 90% of real hall capacity
    maxPerOrder: 5,
    lowStockThreshold: 30,          // show "only N left" below this

    // true => the buyer covers Paystack's gateway fee, added on top at
    // checkout. false meant the organiser silently absorbed ~₦145/ticket.
    passFeeToBuyer: true,

    // FlagIQ's cut for building and running the platform, charged on top of
    // priceKobo. This is a PLATFORM FEE, not a tax: it is retained, not
    // remitted to FIRS. Do not relabel it "VAT" unless FlagIQ is actually
    // VAT-registered and remitting — that would misdescribe retained revenue
    // as tax on ~300 student receipts.
    serviceChargeRate: 0.075,
    serviceChargeLabel: "Service charge",

    // PRIMARY sales gate, controlled from /admin. Sales stay open until the
    // organiser closes them or capacity is reached — there is no date-based
    // auto-close.
    salesOpen: true,

    // BACKSTOP ONLY, not the primary gate. Without it, someone who finds the
    // link a week later can still pay for an event that already happened,
    // which is a refund and a reputation problem rather than a sale.
    salesHardStopAt: "2026-08-26T04:00:00+01:00",
  },

  brand: {
    primary: "#e2ff00",
    accent: "#00f0ff",
    ink: "#ffffff",
    surface: "#060709",
    logoUrl: "/assets/logo.svg",
    heroImageUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1800&q=80",
    ogImageUrl: "/assets/og.jpg",
    // next/font self-hosts these under generated family names, exposed as
    // CSS variables from app/layout.tsx. Referencing the raw family name
    // here would silently fall back to the system font.
    fontHeading: "var(--font-anton), Impact, sans-serif",
    fontBody: "var(--font-jakarta), system-ui, sans-serif",
  },

  staff: {
    // The door terminal's Supabase Auth identity. The 6-digit gate PIN is
    // this account's password — one shared terminal account, per-device
    // attribution via the device id recorded on every check-in. Created by
    // scripts/seed-staff.mjs.
    scannerEmail: "scanner@lastdance.tikets.online",
  },

  support: {
    whatsappNumber: "+2348039927805",
    whatsappMessage: "Hi, I need help with my sign-out ticket",
    email: "support@lastdance.tikets.online",
    organiserName: "After party Committee",
  },

  seo: {
    siteUrl: "https://lastdance.tikets.online",
    title: "Engineering Sign-Out After-Party — Last Dance",
    description: "Official ticketing for the Engineering Sign-Out After-Party 'Last Dance' at BFF Lagos. August 25, 2026.",
  },

  featureFlags: {
    allowNameChange: true,       // holder can rename their ticket before the event
    showLiveSalesCounter: true,  // "312 going" on the public page — social proof
    offlineScannerEnabled: true,
  },
} as const;

export type EventConfig = typeof eventConfig;

/** Doors-open as a real instant, derived from the config fields above.
 *  Exists because EventPage previously hand-built this string with the time
 *  hardcoded, which both bypassed the config and baked in an AM/PM bug. */
export const doorsOpenIso =
  `${eventConfig.event.date}T${eventConfig.event.doorsOpen}:00${eventConfig.event.utcOffset}`;

