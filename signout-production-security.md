# Ship-Tonight Security Pass — Sign-Out Tickets

---

## PART 0 — Read this first. It takes two minutes and may save your weekend.

You want to take real money from ~400 people who know you personally, starting in under twelve hours, using code that hasn't existed long enough to have been tested by anyone.

Here's the thing that makes this solvable: **selling tickets and scanning tickets are separated in time.** You need to sell at 9am tomorrow. You do not need the scanner until event night, which is weeks away. Those are two different deadlines, and you've been treating them as one.

### The move: sell with zero code tomorrow, build the app properly behind it

Your Paystack account is now active, which unlocks **Payment Pages** — a hosted checkout you build in the dashboard with no code at all. It supports products with **limited inventory** and a **maximum quantity per order**. That is a ticket seller. It closes when it sells out.

Set that up tonight in about twenty minutes:

1. Dashboard → **Products** → create "Sign-Out Ticket", price, **limited stock = your capacity**, max quantity per order = 5
2. Dashboard → **Payment Pages** → New Page → attach the product
3. Add custom fields: **full name**, **matric number**, **phone number**
4. Copy the link. That's what goes out at 9am.

**What you get:** money collected from 9am, capacity enforced by Paystack, zero attack surface, zero code you wrote at 3am, a clean CSV of every buyer, and settlement running into your account while you sleep.

**What you don't get:** QR codes at purchase time. You don't need them yet. You export the buyer list later, generate codes from it, and send them out a few days before the event — by which point your app has had two weeks of testing instead of six hours.

**Then build the real app on the original schedule** and import the Payment Page buyers into it. Same destination. No 9am scramble, no money moving through untested code.

### If you ship your own code tomorrow anyway

That's your call and you're the one carrying it. But be clear-eyed about the specific failure modes, because they aren't abstract:

- A webhook signature bug means anyone who finds your endpoint can mint free tickets.
- A missing idempotency check means one Paystack retry issues 800 tickets for 400 payments.
- A capacity race means you sell 460 seats in a 400-seat hall and personally refund 60 friends.
- An RLS gap means 400 students' names, phone numbers and matric numbers are readable from the browser console.
- A client-trusted amount means someone pays ₦100 for a ₦10,000 ticket.

Every one of those is silent. You find out from a WhatsApp message, not a dashboard.

**Minimum position if you go ahead:** run Part 1, then run Part 2 yourself by hand — not Claude, you. If any Part 2 check fails, put the Payment Page link out at 9am instead and fix it during the day. Have that link created and ready tonight regardless. It costs you twenty minutes and it's the difference between a delay and a disaster.

---

## PART 1 — The security prompt

Paste this whole block into Claude Code.

```
This app takes real money from ~400 university students starting tomorrow
morning. I am the organiser and they know me personally — a double charge, a
lost ticket, or a leaked phone number is a reputational problem, not a bug.
Assume an adversarial user who has read the client bundle and knows the
endpoints.

Do a full security and correctness pass on the money path. Work in this order.
Do NOT add features. Do NOT refactor for elegance. Fix correctness and security
only, and commit each fix separately with a clear message.

=== 1. THE WEBHOOK — the highest-risk code in the repo ===
- Verify the x-paystack-signature HMAC SHA512 over the RAW REQUEST BODY BYTES.
  Do NOT parse JSON and re-stringify before hashing — key order and whitespace
  will differ and the signature will not match. In Next.js App Router use
  await req.text() and hash that exact string. Show me the handler.
- Reject any request that fails signature verification with a 401, log it, and
  never process it. Confirm there is no code path that processes an unverified
  payload.
- Return 200 immediately, then process. Paystack retries on non-200.
- IDEMPOTENCY: the same reference arriving 10 times must create tickets exactly
  once. Enforce at the DATABASE level — a unique constraint on orders.reference
  plus a transaction, not an application-level "check then insert". Show me the
  SQL.
- Independently call Paystack's Verify Transaction endpoint before trusting any
  webhook payload. Confirm the AMOUNT matches what we expect for that reference.
  Reject and alert on mismatch — this is the "paid ₦100 for a ₦10,000 ticket"
  attack.
- Ticket generation must be atomic with marking the order paid. A partial write
  must be impossible. Wrap in a single transaction.

=== 2. NEVER TRUST THE CLIENT ===
- Recompute total_kobo SERVER-SIDE from the database, not from anything the
  client sent. Find every place a client-supplied amount, price, or quantity is
  trusted and fix it.
- Validate every input server-side with the same zod schema the client uses.
  Extract it to one shared module so there is a single definition.
- Clamp quantity to the configured max per order, server-side.

=== 3. CAPACITY — overselling means refunding my friends ===
- Enforce remaining capacity inside a database transaction with row locking, so
  two simultaneous purchases cannot both pass the check. Simulate 50 concurrent
  purchase attempts against the last 5 tickets and show me that exactly 5
  succeed.
- Enforce sales_close_at server-side. Hiding the button is not enforcement.

=== 4. DATA EXPOSURE — 400 identifiable students ===
- RLS ON for every table. The anon role must have ZERO read access to orders,
  tickets, and check_ins.
- The public sales counter must come from a SECURITY DEFINER function returning
  counts only — never rows.
- Write a script that uses ONLY the public anon key and attempts to (a) select
  from orders, (b) select from tickets, (c) enumerate ticket codes. Run it.
  Show me the output. All three must fail.
- Grep the built client bundle for the service role key and any secret. Tell me
  the exact command you used and paste the result.
- Confirm no secret is committed to git, including in history. Check .env is
  gitignored.

=== 5. TICKET CODES ===
- Generated server-side with a CSPRNG (crypto.randomBytes), never on the client,
  never sequential, never derived from a counter or timestamp.
- The order reference in the ticket URL must be unguessable — someone WILL try
  incrementing it. If it is currently sequential or short, fix it now.
- Confirm the /ticket/[reference] route is noindex.

=== 6. ABUSE ===
- Rate-limit the checkout endpoint per IP and per phone number.
- Rate-limit any ticket-lookup or rename endpoint. These enable enumeration.
- Add a reasonable body size limit on all POST routes.

=== 7. OPERATIONAL VISIBILITY — I need to know when it breaks at 2am ===
- Add error logging that I can actually see. Log every webhook signature
  failure, amount mismatch, capacity rejection, and unhandled exception.
- Add /api/health returning database and Paystack reachability.
- Write a reconciliation script that lists every Paystack transaction for a date
  range and diffs it against the orders table, reporting discrepancies in both
  directions. I need this before I can confidently refund anyone.

=== 8. FAILURE MODES ARE NEVER DEAD ENDS ===
- If Paystack is unreachable at checkout, show the error plus my WhatsApp
  number. A dead end is a lost sale and an angry message to me.
- Error boundary with a human contact route.
- Custom 404.

=== 9. HEADERS AND TRANSPORT ===
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options or
  frame-ancestors, and a Content-Security-Policy that does not break Paystack's
  checkout redirect.
- Confirm every cookie is httpOnly, secure, sameSite.

=== REPORT AT THE END ===
Do not tell me things are secure. For each item, tell me the specific check you
ran and paste the output:
1. The raw-body webhook handler, in full.
2. The SQL constraint enforcing idempotency.
3. The output of firing the same webhook payload 10 times — how many tickets exist.
4. The output of the 50-concurrent-purchase capacity test.
5. The output of the anon-key attack script, all three attempts.
6. The exact grep command and result for secrets in the client bundle.
7. Anything you found that I did not ask about.

Then give me a numbered list of anything still unsafe that you could not fix,
ranked by how likely it is to cost me money tonight.
```

---

## PART 2 — Your go/no-go checklist

**You run these. Not Claude.** Claude will report success; success is a claim until you've seen it with your own eyes. Fifteen minutes, and any red is a no-go.

| # | Check | How | Pass |
|---|---|---|---|
| 1 | Real purchase, real money | Buy one ticket on **live keys** with your own card | Ticket arrives, money in dashboard |
| 2 | Webhook replay | Re-send the same webhook payload 10× with curl | Still exactly 1 ticket |
| 3 | Forged webhook | POST to the webhook with a junk signature | 401, nothing created |
| 4 | Amount tamper | Webhook payload with amount changed to 100 | Rejected and logged |
| 5 | Data leak | Browser console on the public page, anon key, `select * from orders` | Fails |
| 6 | URL guessing | Change a digit in your `/ticket/[reference]` URL | 404, not someone else's ticket |
| 7 | Sold out | Set capacity to sold+1 in the DB, buy the last one, try again | Refuses, no orphan order |
| 8 | Secrets | `grep -r "sk_live" .next/ && git log -p \| grep -i "sk_live"` | Zero hits both |
| 9 | Real phone | Full purchase on a cheap Android on mobile data, not wifi | Completes |
| 10 | WhatsApp preview | Send the URL to yourself on WhatsApp | Preview card renders |

**Any failure on 1–8 → put the Payment Page link out at 9am instead.** No debate, no "I'll just quickly fix it." You'll be tired and it's other people's money.

---

## PART 3 — Tonight, in order

1. **Create the Paystack Payment Page now, before anything else.** Twenty minutes. This is your parachute and it must exist whether or not you use it.
2. Run the Part 1 prompt.
3. Run Part 2 by hand.
4. Green on all ten → launch your app. Any red → launch the Payment Page link, fix during the day, switch over when Part 2 is clean.
5. Either way: **soft launch first.** Send it to 10 people from your exec team at 9am, not the whole faculty. Watch those 10 transactions land correctly. Then broadcast at 11am. Ten confused friends is recoverable; four hundred is not.

---

## PART 4 — Two things that aren't security but will hurt tomorrow

- **Refund policy.** It must be written and published before the first ticket sells. You will be asked, and "we'll figure it out" is how a WhatsApp group turns on you.
- **Settlement timing.** Money doesn't land instantly. Check your settlement cycle against when the DJ, caterer and hall need deposits. If vendors need paying before settlement clears, that's a float problem — worth knowing tonight rather than next week.

---

**Sources:** [Paystack Payment Pages](https://support.paystack.com/en/articles/2132546) · [Paystack Products & inventory](https://support.paystack.com/en/articles/2132674) · [Paystack Storefronts](https://support.paystack.com/en/articles/2132738) · [Paystack Webhooks](https://paystack.com/docs/payments/webhooks/) · [Paystack Verify Payments](https://paystack.com/docs/payments/verify-payments/)
