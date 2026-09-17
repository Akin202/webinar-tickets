import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventConfig } from '@/config/event.config';

/**
 * The launch gate for config/event.config.ts. This build was forked from a
 * previous event, and the failure mode is not a crash — it is a paying
 * attendee receiving the old event's domain, WhatsApp number or copy. So
 * placeholders are spelled to be caught here, and so are the old event's
 * identifiers.
 */

const source = readFileSync(resolve(import.meta.dirname, '../config/event.config.ts'), 'utf8');

const FORBIDDEN: Array<[string, RegExp]> = [
  ['unfilled placeholder', /TODO\(summit\)/],
  ['placeholder domain', /\.invalid\b/],
  ['previous event domain', /lastdance|tickitid/i],
  ['previous event name', /sign-?out|after-?party|last dance/i],
  ['previous ticket prefix', /\bSGN-/],
];

describe('event config is launch-ready', () => {
  it.each(FORBIDDEN)('contains no %s', (_label, pattern) => {
    const hits = source
      .split('\n')
      .map((line, i) => `${i + 1}: ${line.trim()}`)
      .filter((line) => pattern.test(line));
    expect(hits).toEqual([]);
  });

  it('points every programme slot at a speaker that exists', () => {
    const ids = new Set(eventConfig.speakers.map((s) => s.id));
    for (const slot of eventConfig.programme) {
      if (slot.speakerId) expect(ids.has(slot.speakerId)).toBe(true);
    }
  });

  it('charges the buyer the service charge and the gateway fee', () => {
    expect(eventConfig.ticketing.serviceChargeKoboPerSeat).toBe(25_000);
    expect(eventConfig.ticketing.passFeeToBuyer).toBe(true);
  });

  it('keeps the fee copy pinned to the amount actually charged', () => {
    // The seat card and the FAQ both name a naira figure. If someone changes
    // serviceChargeKoboPerSeat without changing the copy, a buyer reads one
    // number and is charged another — so fail the build instead.
    const naira = `\u20a6${eventConfig.ticketing.serviceChargeKoboPerSeat / 100}`;
    expect(eventConfig.seat.feeNote).toContain(naira);
    const feeFaq = eventConfig.faq.find((entry) => entry.question.includes('more than'));
    expect(feeFaq, 'the FAQ explaining the total must exist').toBeTruthy();
    expect(feeFaq?.answer).toContain(naira);
  });

  it('never shows a visitor how many seats are left', () => {
    // Owner's call (2026-09-17): buyers see scarcity, not arithmetic. The
    // capacity is still enforced in event_settings — it just never reaches a
    // public string. This test fails if the number comes back into the copy.
    expect(eventConfig.featureFlags.showLiveSalesCounter).toBe(false);

    const capacity = String(eventConfig.ticketing.capacity);
    const publicCopy = JSON.stringify([
      eventConfig.event, eventConfig.seat, eventConfig.livestream,
      eventConfig.copy, eventConfig.faq, eventConfig.seo, eventConfig.audiences,
    ]);
    expect(publicCopy).not.toContain(`${capacity} seat`);
    expect(publicCopy).not.toContain(`${capacity} people`);
    expect(publicCopy).not.toMatch(/only \d+ (seat|left)/i);
  });

  it('uses a real https site URL', () => {
    expect(new URL(eventConfig.seo.siteUrl).protocol).toBe('https:');
  });
});
