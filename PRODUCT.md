# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Buyers of a seat:** people in and around Lagos, mostly arriving from a link forwarded on WhatsApp, on mid-tier Android phones with metered mobile data. A deliberately mixed room:
  - students and fresh graduates worried AI will take jobs they don't have yet;
  - working professionals who have used ChatGPT and stopped there;
  - founders and business owners being sold "AI transformation" by several vendors at once.
- **Their job:** decide within a minute or two whether ₦10,000 and a Saturday are worth it, pay without friction (card, bank transfer or USSD through Paystack), and keep a QR ticket they can show at the door.
- **Livestream viewers:** outside Lagos or not paying; they register free and get a link. Registration is not live yet.

## Product Purpose
Sell the 100 in-person seats for **FlagIQ AI Summit '26** (Saturday 3 October 2026, 10:00–16:00, AI UniPod, University of Lagos), run free livestream registration, and admit each ticket exactly once at the door.

Success, all confirmed goals:
1. Seats sold, up to the 100 cap.
2. Attendees who start with FlagIQ afterwards, through Flag Skool Cohort 2 (the attendee-only discount is the bridge).
3. The **product launch** on the day lands with the room (a 14:40 slot in the programme). It is a goal in its own right, not a filler slot.

## Positioning
FlagIQ, an AI agency and education brand and the parent of Flag Skool, runs a one-day, hands-on summit with UNILAG's AI UniPod. Speakers are people shipping AI work now, not panelists talking about the future.

**The promise:** start with FlagIQ and you get ahead of the AI wave heading into 2027, without the fear of losing your job to it. Everyone leaves with something they can use on Monday.

## Operating Context
- Discovery is almost entirely WhatsApp link shares, so the server-rendered link preview (title, description, OG image) is the first impression.
- The room is 100 people who largely know each other or are one hop apart. A failed payment or a paid-but-no-ticket case becomes public fast.
- Support happens on WhatsApp. A WhatsApp link must be within reach wherever something can go wrong.
- At the door, staff phones scan QR codes on bad venue wifi. The scanner is a separate tool surface, outside this product record's design scope.

## Capabilities and Constraints
- ₦10,000 per seat, **all in**: no service charge and no fee passed to the buyer. Max 5 seats per order. The live price, capacity and sales gate are set in `/admin` and enforced by the database, not by the page.
- 100 seats, **no overbooking, no waitlist, no refund copy, no manual bank-transfer entry.** When seat 100 sells, that's it.
- Checkout asks one segmentation question: student or fresh graduate / working professional / founder or business owner.
- A QR ticket is issued only after payment settles; the ticket link lets the buyer rename the holder.
- Livestream: free, stored separately, never counts against seats. **Undecided:** registration ships "this week"; until then the card must say so, never a dead button.
- The seat includes: the full day, every session including two workshops, lunch and refreshments, the Flag Skool Cohort 2 discount, structured networking, and Flag Skool community entry on Telegram.
- Speakers: Prof. Chika Yinka-Banjo (Director, AI UniPod; host), Michael Pepper, Saheed Niyi, and one more confirmed the week of 22 September. **Undecided:** roles for Pepper and Niyi, and the final speaker.
- Every event-specific string lives in `config/event.config.ts`. Performance budget: LCP under 2.5s on slow mobile data; the OG image stays under 300KB.

## Brand Commitments
- **FlagIQ logo** is fixed: a red flag carrying circuit traces on a black pole, over a black "FLAGIQ" wordmark. Source: `public/assets/FlagIQ Logo.png` (master at `~/Work/FlagIQ/brand/flagiq-logo.png`). It is only 499×500 raster, so it is used at modest sizes and never redrawn, recoloured or upscaled.
- **Voice:** plain, direct, a little wry, Nigeria-specific ("what it costs in Nigeria"; Lagos traffic jokes). No hype vocabulary. Copy may be tightened for clarity in the same voice, with the owner approving changes to factual copy.

## Evidence on Hand
- Real: event facts, price, programme, speaker names, audiences and FAQ (all in config), and the logo.
- **Coming:** real photos of the AI UniPod venue, from the owner's phone.
- **Absent, must not be fabricated:** speaker photos, attendee testimonials, past-event photos, attendance numbers, sponsor or partner logos, press. Any generated imagery must read as illustration, never as the real venue or real people.

## Product Principles
1. **Money screens are trust screens.** Checkout and the ticket are plain and unambiguous; nothing decorative competes with price, total, state or the Pay action.
2. **Built for the phone in the buyer's hand.** 360px on metered data is the primary viewport, not an adaptation.
3. **Honest scarcity.** 100 seats and no waitlist are stated as facts; no fake urgency or inflated counters.
4. **Say what you'll leave with.** Every section answers what the attendee can do on Monday, or how they get ahead into 2027.
5. **Never a dead end.** Every unavailable state (sold out, sales closed, livestream pending, payment failed) says what happens next and offers WhatsApp.

## Accessibility & Inclusion
Text contrast at least 4.5:1. All motion is transform/opacity and respects reduced-motion. Buttons at least 48px tall. States (sold out, closed, errors) are never shown by colour alone. Mid-tier Android and slow networks are the design baseline.
