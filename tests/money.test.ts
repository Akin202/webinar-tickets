import { describe, it, expect } from 'vitest';
import {
  computeOrderTotals,
  paystackFeeKobo,
  grossUpForPaystackFee,
} from '@/types/ticketing';

/**
 * The money sweep the comment in types/ticketing.ts claims exists.
 *
 * Every one of these is a property that has to hold for any price the
 * organiser might set, not just the current ₦3,000 — the whole point of the
 * config file is that the next faculty changes the number.
 */

const UNIT_PRICES = [
  100_000, // ₦1,000 — under the ₦2,500 flat-fee threshold
  240_000, // just under
  250_000, // exactly on it
  260_000, // just over
  300_000, // the real ticket price
  1_500_000, // ₦15,000
  9_000_000, // ₦90,000 — into the ₦2,000 fee cap
];
const QUANTITIES = [1, 2, 3, 4, 5];
const SERVICE_RATES = [0, 0.075, 0.1];

function everyCase(fn: (t: ReturnType<typeof computeOrderTotals>, pass: boolean) => void) {
  for (const unitPriceKobo of UNIT_PRICES) {
    for (const quantity of QUANTITIES) {
      for (const serviceChargeRate of SERVICE_RATES) {
        for (const passFeeToBuyer of [true, false]) {
          fn(
            computeOrderTotals({ quantity, unitPriceKobo, serviceChargeRate, passFeeToBuyer }),
            passFeeToBuyer
          );
        }
      }
    }
  }
}

describe('paystackFeeKobo', () => {
  it('waives the flat fee below ₦2,500 and charges it at the threshold', () => {
    expect(paystackFeeKobo(249_999)).toBe(Math.ceil(249_999 * 0.015));
    expect(paystackFeeKobo(250_000)).toBe(Math.ceil(250_000 * 0.015) + 10_000);
  });

  it('caps at ₦2,000', () => {
    expect(paystackFeeKobo(100_000_000)).toBe(200_000);
    expect(paystackFeeKobo(1_000_000_000)).toBe(200_000);
  });

  it('never returns a fraction of a kobo', () => {
    for (let amount = 0; amount <= 5_000_000; amount += 9_973) {
      expect(Number.isInteger(paystackFeeKobo(amount))).toBe(true);
    }
  });
});

describe('grossUpForPaystackFee', () => {
  it('lands exactly on the target, never past it', () => {
    // The exactness claim the residual identity depends on. Stepped across
    // the ₦2,500 boundary deliberately: fee() is discontinuous there, so
    // `t - fee(t)` drops by ~₦100 and the search has to re-approach from
    // below. If it ever overshot, reconciliation could not tell a
    // fee-passed order from a corrupt row.
    for (let subtotal = 1; subtotal <= 600_000; subtotal += 997) {
      const total = grossUpForPaystackFee(subtotal);
      expect(total - paystackFeeKobo(total)).toBe(subtotal);
    }
  });

  it('handles the fee cap without looping past it', () => {
    const subtotal = 50_000_000;
    const total = grossUpForPaystackFee(subtotal);
    expect(total - paystackFeeKobo(total)).toBe(subtotal);
  });

  it('is zero for nothing', () => {
    expect(grossUpForPaystackFee(0)).toBe(0);
    expect(grossUpForPaystackFee(-1)).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  it('keeps every field an integer number of kobo', () => {
    everyCase((t) => {
      for (const [field, value] of Object.entries(t)) {
        expect(Number.isInteger(value), `${field} = ${value}`).toBe(true);
      }
    });
  });

  it('composes: base + serviceCharge === subtotal', () => {
    everyCase((t) => {
      expect(t.baseKobo + t.serviceChargeKobo).toBe(t.subtotalKobo);
      expect(t.baseKobo).toBe(t.unitPriceKobo * t.quantity);
    });
  });

  it('leaves the organiser exactly the subtotal when the buyer covers the fee', () => {
    everyCase((t, pass) => {
      if (!pass) return;
      // This is the whole reason grossUpForPaystackFee exists: charging
      // subtotal + fee(subtotal) under-recovers, because Paystack takes its
      // percentage of the total including the fee we added.
      expect(t.totalKobo - t.gatewayFeeKobo).toBe(t.subtotalKobo);
      expect(t.totalKobo - t.gatewayFeeKobo - t.serviceChargeKobo).toBe(t.baseKobo);
    });
  });

  it('charges the buyer only the subtotal when the organiser absorbs the fee', () => {
    everyCase((t, pass) => {
      if (pass) return;
      expect(t.totalKobo).toBe(t.subtotalKobo);
      // The fee comes out of the organiser's side, so the invariant stated
      // for pass-mode deliberately does NOT hold here. Asserting it as a
      // universal law would be wrong.
      expect(t.totalKobo - t.gatewayFeeKobo - t.serviceChargeKobo).toBe(
        t.baseKobo - t.gatewayFeeKobo
      );
    });
  });

  it('recovers the fee mode from a stored order alone (residual identity)', () => {
    // Reconciliation relies on this if passFeeToBuyer is ever flipped
    // mid-sale. Strict equality, not `> 0`: the strict test also catches a
    // corrupt row, where the loose one would silently report pass-mode.
    everyCase((t, pass) => {
      const residual = t.totalKobo - t.unitPriceKobo * t.quantity - t.serviceChargeKobo;
      expect(residual).toBe(pass ? t.gatewayFeeKobo : 0);
    });
  });

  it('never charges the buyer less than the organiser keeps', () => {
    everyCase((t) => {
      expect(t.totalKobo).toBeGreaterThanOrEqual(t.baseKobo);
    });
  });

  it('prices the live configuration the way the page claims', () => {
    // ₦3,000 ticket, 7.5% service charge, buyer covers the gateway fee.
    const t = computeOrderTotals({
      quantity: 1,
      unitPriceKobo: 300_000,
      serviceChargeRate: 0.075,
      passFeeToBuyer: true,
    });
    expect(t.baseKobo).toBe(300_000);
    expect(t.serviceChargeKobo).toBe(22_500);
    expect(t.subtotalKobo).toBe(322_500);
    expect(t.totalKobo - t.gatewayFeeKobo).toBe(322_500);
  });
});
