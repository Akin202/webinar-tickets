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
    // Self-hosted. A remote host on the LCP path costs a DNS lookup, a TLS
    // handshake and a connection to somebody else's CDN before the largest
    // element can even start downloading — on Slow 4G that is most of the
    // 2.5s budget. 1600w, 133KB; next/image serves AVIF/WebP variants from it.
    heroImageUrl: "/assets/hero.jpg",
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
    //
    // This never receives mail — it is a login, not a mailbox — so it is fine
    // that the host it names carries no MX. Must be final BEFORE seed-staff.mjs
    // runs: changing it afterwards orphans the door account and locks the door
    // terminal out on the night.
    scannerEmail: "scanner@lastdance.tickitid.online",
  },

  support: {
    whatsappNumber: "+2348139927805",
    whatsappMessage: "Hi, I need help with my sign-out ticket",
    // Deliberately on the APEX, not on lastdance.*. The sales host is a CNAME
    // to Vercel, and RFC 1034 forbids any other record coexisting with a CNAME
    // — so lastdance.tickitid.online can never hold MX and mail to it would
    // bounce. The apex holds no CNAME, so Namecheap's free email forwarding
    // can point this at a real inbox. Resend is send-only and gives no mailbox.
    email: "support@tickitid.online",
    organiserName: "After party Committee",
  },

  seo: {
    // Also the fallback when NEXT_PUBLIC_SITE_URL is unset — see app/layout.tsx,
    // app/api/checkout/route.ts and lib/email.ts. That makes this value safety
    // critical, not cosmetic: it decides where Paystack sends buyers back to.
    // It must always name a host we control.
    siteUrl: "https://lastdance.tickitid.online",
    title: "Engineering Sign-Out After-Party — Last Dance",
    description: "Official ticketing for the Engineering Sign-Out After-Party 'Last Dance' at BFF Lagos. August 25, 2026.",
  },

  featureFlags: {
    allowNameChange: true,       // holder can rename their ticket before the event
    showLiveSalesCounter: true,  // "312 going" on the public page — social proof
  },
} as const;

export type EventConfig = typeof eventConfig;

/** Doors-open as a real instant, derived from the config fields above.
 *  Exists because EventPage previously hand-built this string with the time
 *  hardcoded, which both bypassed the config and baked in an AM/PM bug. */
export const doorsOpenIso =
  `${eventConfig.event.date}T${eventConfig.event.doorsOpen}:00${eventConfig.event.utcOffset}`;

/** `2026-08-25` + 1 → `2026-08-26`. UTC arithmetic, so no DST or locale drift. */
function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * When the event actually ends, as a real instant.
 *
 * Doors open at 23:30 and it ends at 04:00 — that 04:00 belongs to the day
 * AFTER `event.date`. Pinning both to the same date produces an event that
 * ends nineteen hours before it starts, which is what a hand-written calendar
 * link would silently do.
 */
export const eventEndsIso = (() => {
  const endsNextDay = eventConfig.event.endsAt < eventConfig.event.doorsOpen;
  const day = endsNextDay ? addOneDay(eventConfig.event.date) : eventConfig.event.date;
  return `${day}T${eventConfig.event.endsAt}:00${eventConfig.event.utcOffset}`;
})();

/**
 * `25/08` — the big date stamp on the flyer. Derived rather than typed, so
 * the poster cannot end up advertising a different day from the one the
 * countdown, the ticket and the sales hard-stop all use.
 */
export const eventDayStamp = (() => {
  const [, month, day] = eventConfig.event.date.split('-');
  return `${day}/${month}`;
})();

/** `YYYYMMDDTHHMMSSZ` — the only timestamp format Google Calendar accepts. */
export function toCalendarStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

