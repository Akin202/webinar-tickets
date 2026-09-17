import { eventConfig, doorsOpenIso } from '@/config/event.config';

/**
 * Derived display strings shared by the event page's parts. Every source
 * value is in config/event.config.ts; this only formats them, so no part of
 * the page can advertise a different day, time or support number.
 */

const { event, support, programme, speakers } = eventConfig;

const LAGOS = 'Africa/Lagos';
const doorsOpen = new Date(doorsOpenIso);

/** "SATURDAY 3 OCTOBER 2026" */
export const DATE_FULL_CAPS = doorsOpen
  .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: LAGOS })
  .replace(',', '')
  .toUpperCase();

/** "3 October 2026" */
export const DATE_LONG = doorsOpen.toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: LAGOS,
});

/** "10:00–16:00" */
export const HOURS = `${event.doorsOpen}–${event.endsAt}`;

export const WHATSAPP_HREF = `https://wa.me/${support.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
  support.whatsappMessage
)}`;

/**
 * Display-only typography: "Summit '26" -> "Summit ’26", "isn't" -> "isn’t".
 * Config strings stay plain ASCII because they also feed emails, the admin
 * tool and tests; the curly marks are applied only where text is rendered.
 */
export function typographic(text: string): string {
  return text.replace(/(\w)'(\w)/g, '$1\u2019$2').replace(/(^|\s)'(\d)/g, '$1\u2019$2');
}

/** Event name as displayed. */
export const EVENT_NAME = typographic(eventConfig.event.name);

/** "Prof. Chika Yinka-Banjo" -> "CY". Titles ending in a full stop are skipped. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word && !word.endsWith('.'));
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export type ProgrammeSlot = (typeof programme)[number];

const announcedSpeakerIds = new Set(speakers.filter((speaker) => speaker.announced).map((speaker) => speaker.id));

/**
 * The hero's agenda preview: doors, every announced speaker's slot, and the
 * launch. Unannounced slots stay out so the first screen never shows "To be
 * announced" as if it were a headline act.
 */
export const DAY_PREVIEW: ReadonlyArray<ProgrammeSlot> = programme.filter(
  (slot, index) =>
    index === 0 || slot.isLaunch === true || (slot.speakerId !== undefined && announcedSpeakerIds.has(slot.speakerId))
);
