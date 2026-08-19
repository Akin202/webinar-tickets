'use client';

import { eventConfig } from '@/config/event.config';
import { formatPhoneForDisplay } from '@/types/ticketing';

/**
 * Renders a ticket to a PNG the holder can keep.
 *
 * This is the real delivery path. No email is sent, WhatsApp is where the
 * link travels, and what people actually do with a pass is save it to their
 * gallery — so "Save Pass" has to produce a file, not a suggestion to take a
 * screenshot. A screenshot crops, dims, and arrives at the door at whatever
 * resolution the sender's phone chose.
 *
 * Hand-drawn on a canvas rather than rasterising the DOM with html2canvas:
 * the card is a dark-on-dark party design and the door needs maximum QR
 * contrast, so the export is a different artefact from the on-screen card,
 * not a photocopy of it. It also keeps the public bundle free of a ~200KB
 * dependency on the buyer's mobile-data budget.
 */

/** Canvas geometry. Portrait, sized so the QR survives a WhatsApp re-encode. */
const PASS = {
  width: 1080,
  height: 1800,
  margin: 72,
  qrSize: 640,
  headerHeight: 300,
  footerHeight: 150,
} as const;

const INK = '#0b0c10';
const PAPER = '#ffffff';
const MUTED = '#5b6270';

export type PassExportOutcome =
  | { kind: 'shared' }
  | { kind: 'downloaded'; fileName: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string };

export interface PassExportInput {
  /** The element wrapping the live <svg> QR. Serialised, never re-encoded. */
  qrContainer: HTMLElement | null;
  code: string;
  holderName: string;
  holderPhone: string | null;
}

/**
 * Reads the fonts the page actually resolved.
 *
 * next/font generates hashed family names at build time, so they cannot be
 * hardcoded here. Taking them off computed style keeps the export on-brand
 * and degrades to the system stack if a face has not loaded.
 */
function resolveFonts(): { display: string; body: string; mono: string } {
  const body = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const displayEl = document.querySelector('.font-display');
  const monoEl = document.querySelector('.font-mono-code');
  return {
    display: displayEl ? getComputedStyle(displayEl).fontFamily : body,
    body,
    mono: monoEl ? getComputedStyle(monoEl).fontFamily : 'ui-monospace, monospace',
  };
}

function brandPrimary(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--brand-primary')
    .trim();
  return value || eventConfig.brand.primary;
}

/**
 * Turns the live QR into a drawable image.
 *
 * Serialised straight from the DOM so the exported code is bit-identical to
 * the one on screen — regenerating it here would be a second implementation
 * of the thing the door depends on. `xmlns` is added because React omits it,
 * and without it the data URL will not decode.
 */
function loadQrImage(container: HTMLElement): Promise<HTMLImageElement> {
  const svg = container.querySelector('svg');
  if (!svg) return Promise.reject(new Error('QR code not found on the page.'));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(PASS.qrSize));
  clone.setAttribute('height', String(PASS.qrSize));

  const markup = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('QR code could not be rendered.'));
    img.src = url;
  });
}

/** Centres one line, shrinking the size until it fits the content width. */
function centredLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  opts: { weight: string; size: number; family: string; colour: string; tracking?: number }
): void {
  const maxWidth = PASS.width - PASS.margin * 2;
  let size = opts.size;
  ctx.fillStyle = opts.colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Tracking is applied before measuring, not after: a name long enough to
  // need shrinking is exactly the case where the extra letter spacing
  // decides whether it fits.
  if (opts.tracking) ctx.letterSpacing = `${opts.tracking}px`;

  do {
    ctx.font = `${opts.weight} ${size}px ${opts.family}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 14);

  ctx.fillText(text, PASS.width / 2, y);
  if (opts.tracking) ctx.letterSpacing = '0px';
}

function drawHeader(ctx: CanvasRenderingContext2D, fonts: ReturnType<typeof resolveFonts>): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, PASS.width, PASS.headerHeight);
  ctx.fillStyle = brandPrimary();
  ctx.fillRect(0, 0, PASS.width, 14);

  centredLine(ctx, eventConfig.event.tagline.toUpperCase(), 128, {
    weight: '900',
    size: 84,
    family: fonts.display,
    colour: brandPrimary(),
  });
  centredLine(ctx, eventConfig.event.name, 184, {
    weight: '700',
    size: 32,
    family: fonts.body,
    colour: '#e2e8f0',
  });
  centredLine(ctx, 'OFFICIAL ADMISSION PASS', 248, {
    weight: '700',
    size: 26,
    family: fonts.mono,
    colour: '#94a3b8',
    tracking: 6,
  });
}

/** A label above its value. Returns the y to continue from. */
function drawField(
  ctx: CanvasRenderingContext2D,
  fonts: ReturnType<typeof resolveFonts>,
  label: string,
  value: string,
  y: number,
  valueFamily?: string
): number {
  centredLine(ctx, label.toUpperCase(), y, {
    weight: '700',
    size: 24,
    family: fonts.body,
    colour: MUTED,
    tracking: 4,
  });
  centredLine(ctx, value, y + 52, {
    weight: '800',
    size: 42,
    family: valueFamily ?? fonts.body,
    colour: INK,
  });
  return y + 110;
}

function drawRule(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PASS.margin, y);
  ctx.lineTo(PASS.width - PASS.margin, y);
  ctx.stroke();
}

function drawFooter(ctx: CanvasRenderingContext2D, fonts: ReturnType<typeof resolveFonts>): void {
  const top = PASS.height - PASS.footerHeight;
  ctx.fillStyle = INK;
  ctx.fillRect(0, top, PASS.width, PASS.footerHeight);

  // The single most important sentence on the file, because this PNG is
  // exactly the artefact people forward to friends.
  centredLine(ctx, 'ONE ENTRY ONLY — THIS CODE WORKS ONCE', top + 62, {
    weight: '800',
    size: 30,
    family: fonts.body,
    colour: brandPrimary(),
  });
  centredLine(ctx, 'A forwarded copy will be refused at the gate.', top + 108, {
    weight: '500',
    size: 26,
    family: fonts.body,
    colour: '#94a3b8',
  });
}

function drawPass(
  ctx: CanvasRenderingContext2D,
  qr: HTMLImageElement,
  input: PassExportInput
): void {
  const fonts = resolveFonts();

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PASS.width, PASS.height);
  drawHeader(ctx, fonts);

  // Pure white behind the QR, always — the surrounding design never gets to
  // tint the thing a camera has to read in bad light.
  const qrX = (PASS.width - PASS.qrSize) / 2;
  const qrY = PASS.headerHeight + 48;
  ctx.fillStyle = PAPER;
  ctx.fillRect(qrX - 24, qrY - 24, PASS.qrSize + 48, PASS.qrSize + 48);
  ctx.drawImage(qr, qrX, qrY, PASS.qrSize, PASS.qrSize);

  let y = qrY + PASS.qrSize + 100;
  y = drawField(ctx, fonts, 'Ticket code', input.code, y, fonts.mono);
  drawRule(ctx, y - 24);

  y = drawField(ctx, fonts, 'Holder', input.holderName, y + 16);
  if (input.holderPhone) {
    // Printed because it is the door's identity check: staff read this off
    // the scan result and ask the person in front of them to say it.
    y = drawField(ctx, fonts, 'Phone', formatPhoneForDisplay(input.holderPhone), y, fonts.mono);
  }
  drawRule(ctx, y - 24);

  y = drawField(
    ctx,
    fonts,
    'Doors open',
    `${eventConfig.event.date} · ${eventConfig.event.doorsOpen}`,
    y + 16
  );
  drawField(ctx, fonts, 'Venue', eventConfig.event.venueName, y);

  drawFooter(ctx, fonts);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
      'image/png'
    );
  });
}

/**
 * Hands the file over. Share sheet first where the device has one — on
 * Android that puts "WhatsApp" one tap away, which is how these passes
 * actually move — and a plain download everywhere else.
 */
async function deliver(blob: Blob, fileName: string): Promise<PassExportOutcome> {
  const file = new File([blob], fileName, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${eventConfig.event.name} — ${eventConfig.event.tagline}`,
      });
      return { kind: 'shared' };
    } catch (err) {
      // Dismissing the sheet is not a failure and must not be reported as
      // one; anything else falls through to a download rather than dead-ending.
      if (err instanceof Error && err.name === 'AbortError') return { kind: 'cancelled' };
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoked on the next tick: Safari aborts the download if the URL dies
  // in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { kind: 'downloaded', fileName };
}

export async function exportTicketPass(input: PassExportInput): Promise<PassExportOutcome> {
  if (!input.qrContainer) {
    return { kind: 'failed', reason: 'The pass is not ready yet. Try again in a moment.' };
  }
  try {
    // Custom faces must be resolved before the canvas asks for them, or the
    // export silently falls back to Times New Roman.
    if (document.fonts?.ready) await document.fonts.ready;

    const qr = await loadQrImage(input.qrContainer);
    const canvas = document.createElement('canvas');
    canvas.width = PASS.width;
    canvas.height = PASS.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { kind: 'failed', reason: 'This browser cannot render the image.' };

    drawPass(ctx, qr, input);
    const blob = await canvasToBlob(canvas);
    return await deliver(blob, `pass-${input.code}.png`);
  } catch (err) {
    console.error('Pass export failed:', err);
    return {
      kind: 'failed',
      reason: err instanceof Error ? err.message : 'The pass could not be saved.',
    };
  }
}
