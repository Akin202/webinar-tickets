import type { Metadata } from 'next';
import Link from 'next/link';
import { eventConfig } from '@/config/event.config';
import { storageInventory, storageKindLabel } from '@/lib/cookie-inventory';

/**
 * The actual disclosure. The bar at the bottom of the buyer pages is only a
 * pointer at this page — this is the thing that has to be complete and true.
 *
 * A static server component on purpose: no data fetching, no client JS, and it
 * is indexable (robots.ts disallows /ticket, /admin, /scan, /checkout and /api,
 * but not this) so a link to it survives being forwarded on WhatsApp.
 *
 * The table is generated from lib/cookie-inventory.ts rather than typed out
 * here, so adding a cookie without updating the disclosure is a change to one
 * file that shows up in two places at once.
 */

export const metadata: Metadata = {
  title: 'Cookies & Privacy',
  description: `How ${eventConfig.event.name} uses cookies and what it stores on your device.`,
  robots: { index: true, follow: true },
};

const lastUpdated = new Date(
  `${eventConfig.legal.policyLastUpdated}T00:00:00Z`
).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-brand-surface text-brand-text px-5 py-14 sm:px-6 sm:py-20">
      <div className="max-w-3xl mx-auto">
        <p className="font-mono-code text-xs uppercase tracking-widest text-brand-primary mb-3">
          {eventConfig.event.name}
        </p>
        <h1 className="font-display text-4xl sm:text-6xl uppercase leading-[0.95] tracking-tight mb-3">
          Cookies &amp; Privacy
        </h1>
        <p className="text-sm text-brand-dim font-mono-code mb-12">
          Last updated {lastUpdated}
        </p>

        <section aria-labelledby="summary-heading" className="mb-12">
          <h2
            id="summary-heading"
            className="font-display text-2xl uppercase tracking-tight text-brand-primary mb-4"
          >
            The short version
          </h2>
          <p className="text-base text-brand-muted leading-relaxed mb-4">
            This site uses a small number of cookies, all of which are strictly
            necessary for it to work and to keep ticket sales fair. There is
            nothing optional to turn on or off, which is why you are shown a
            notice rather than asked for a choice.
          </p>
          <ul className="space-y-2 text-base text-brand-muted leading-relaxed">
            <li className="flex gap-3">
              <span aria-hidden="true" className="text-brand-primary">
                —
              </span>
              <span>
                We do{' '}
                <span className="text-brand-text font-semibold">not</span> use
                advertising cookies, tracking pixels or analytics of any kind.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="text-brand-primary">
                —
              </span>
              <span>
                We do{' '}
                <span className="text-brand-text font-semibold">not</span> sell,
                rent or share your details with anyone for marketing.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="text-brand-primary">
                —
              </span>
              <span>
                No cookie on this site stores your name, email address or phone
                number.
              </span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="inventory-heading" className="mb-12">
          <h2
            id="inventory-heading"
            className="font-display text-2xl uppercase tracking-tight text-brand-primary mb-4"
          >
            Everything we store
          </h2>

          {/* Wide content scrolls inside its own container so the page body
              never scrolls sideways on a 320px phone. */}
          <div className="overflow-x-auto rounded-2xl border border-brand-border">
            <table className="w-full min-w-[34rem] text-left border-collapse">
              <thead>
                <tr className="bg-brand-card">
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs uppercase tracking-wider font-bold text-brand-muted"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs uppercase tracking-wider font-bold text-brand-muted"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs uppercase tracking-wider font-bold text-brand-muted"
                  >
                    What it does
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs uppercase tracking-wider font-bold text-brand-muted whitespace-nowrap"
                  >
                    How long
                  </th>
                </tr>
              </thead>
              <tbody>
                {storageInventory.map((entry) => (
                  <tr
                    key={entry.name}
                    className="border-t border-brand-border align-top"
                  >
                    <th
                      scope="row"
                      className="px-4 py-4 font-mono-code text-xs text-brand-primary font-normal text-left whitespace-nowrap"
                    >
                      {entry.name}
                    </th>
                    <td className="px-4 py-4 text-xs text-brand-dim whitespace-nowrap">
                      {storageKindLabel[entry.kind]}
                    </td>
                    <td className="px-4 py-4 text-sm text-brand-muted leading-relaxed">
                      {entry.purpose}
                      <span className="block mt-1 text-xs text-brand-dim">
                        {entry.scope}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-brand-muted whitespace-nowrap">
                      {entry.lifetime}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="payment-heading" className="mb-12">
          <h2
            id="payment-heading"
            className="font-display text-2xl uppercase tracking-tight text-brand-primary mb-4"
          >
            Paying for a ticket
          </h2>
          <p className="text-base text-brand-muted leading-relaxed">
            Card details are never entered on this site and never reach us. When
            you pay you are handed over to{' '}
            {eventConfig.legal.paymentProcessorName}, who take the payment on
            their own pages and set their own cookies there under their own
            policy. We receive back only whether the payment succeeded, along
            with the name, email address and phone number you typed on our
            checkout page so that we can issue and verify your pass at the door.{' '}
            <a
              href={eventConfig.legal.paymentProcessorPrivacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary underline underline-offset-2"
            >
              Read {eventConfig.legal.paymentProcessorName}&apos;s privacy policy
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="control-heading" className="mb-12">
          <h2
            id="control-heading"
            className="font-display text-2xl uppercase tracking-tight text-brand-primary mb-4"
          >
            Clearing what is stored
          </h2>
          <p className="text-base text-brand-muted leading-relaxed mb-4">
            Every browser lets you clear cookies and site data for a single
            site, usually under Settings → Privacy. Doing so removes everything
            in the table above.
          </p>
          <p className="text-base text-brand-muted leading-relaxed">
            Being straight with you about one thing: clearing the anti-abuse
            cookie does not opt you out of it. The next page you load simply
            issues a fresh one, because without it we cannot tell one buyer from
            another and cannot stop a single person from holding seats they
            never pay for. It contains nothing but a random value.
          </p>
        </section>

        <section aria-labelledby="contact-heading" className="mb-14">
          <h2
            id="contact-heading"
            className="font-display text-2xl uppercase tracking-tight text-brand-primary mb-4"
          >
            Who to ask
          </h2>
          <p className="text-base text-brand-muted leading-relaxed">
            This event and the data collected for it are the responsibility of{' '}
            <span className="text-brand-text font-semibold">
              {eventConfig.legal.dataControllerName}
            </span>
            . To ask what we hold about you, or to have it deleted after the
            event, email{' '}
            <a
              href={`mailto:${eventConfig.support.email}`}
              className="text-brand-primary underline underline-offset-2 font-mono-code text-sm"
            >
              {eventConfig.support.email}
            </a>
            .
          </p>
        </section>

        <Link
          href="/"
          className="min-h-[48px] px-8 py-3 rounded-2xl bg-brand-primary text-brand-surface font-black uppercase tracking-wider inline-flex items-center"
        >
          ← Back to {eventConfig.event.tagline}
        </Link>
      </div>
    </main>
  );
}
