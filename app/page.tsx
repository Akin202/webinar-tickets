import { EventPage } from '@/components/pages/EventPage';

/**
 * Server component on purpose. The public page's OG tags (in the root
 * layout) must be in the server-rendered HTML because this link is
 * distributed on WhatsApp, whose crawler does not run JavaScript.
 * Interactivity lives inside <EventPage />, which is a client component.
 */
export default function Page() {
  return <EventPage />;
}
