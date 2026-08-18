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
    priceKobo: 300000,              // ₦3,000
    currency: "NGN" as const,
    capacity: 300,                  // 90% of real hall capacity
    maxPerOrder: 5,
    salesCloseAt: "2026-08-25T23:00:00+01:00",
    passFeeToBuyer: false,          // true => Paystack fee added on top at checkout
    lowStockThreshold: 30,          // show "only N left" below this
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

/** Human-readable sales-close time for UI copy. The raw ISO string was being
 *  rendered straight at the buyer on the sales-closed screen. */
export const salesCloseLabel = new Date(
  eventConfig.ticketing.salesCloseAt
).toLocaleString("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});
