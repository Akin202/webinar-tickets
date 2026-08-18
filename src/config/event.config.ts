export const eventConfig = {
  event: {
    name: "Engineering Sign-Out After-Party",
    tagline: "Last Dance",
    hostedBy: "Faculty of Engineering, University of Lagos",
    date: "2026-08-25",
    doorsOpen: "11:30",
    endsAt: "04:00",
    venueName: "BFF Lagos",
    venueAddress: "4 jinbowu street, Yaba Lagos, Nigeria",
    venueMapUrl: "https://maps.app.goo.gl/vNbJxWt4wQzpwJHc6?g_st=ic",
    dressCode: "style your signout outfit",
    includes: [
      "Access to Main Arena & Dancefloor",
      "Complimentary Signature Welcome Drinks",
      "Live Sets by Top Lagos DJs & Hypemen",
      "Signed Shirt Photo Booth & Sharpie Station",
      "Midnight Sign-Out Countdown",
      "Bouncer Security & Fast QR Barcode Access",
    ],
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
    fontHeading: "Anton, Impact, sans-serif",
    fontBody: "Plus Jakarta Sans, sans-serif",
  },

  support: {
    whatsappNumber: "+2348039876543",
    whatsappMessage: "Hi, I need help with my sign-out ticket",
    email: "signout@unilageng.ng",
    organiserName: "Faculty of Engineering Sign-Out Committee",
  },

  seo: {
    siteUrl: "https://lastdance.unilageng.ng",
    title: "Engineering Sign-Out After-Party — Last Dance",
    description: "Official ticketing for the Engineering Sign-Out After-Party 'Last Dance' at BFF Lagos. August 25, 2026.",
  },

  featureFlags: {
    allowNameChange: true,       // holder can rename their ticket before the event
    showLiveSalesCounter: true,  // "312 going" on the public page — social proof
    requireMatricNumber: true,
    offlineScannerEnabled: true,
  },
} as const;

export type EventConfig = typeof eventConfig;
