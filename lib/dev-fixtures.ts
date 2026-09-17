import { computeOrderTotals, Order, Ticket } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';

// Derived, not hardcoded: the dev preview should show the same money the real
// checkout would, including the service charge and gateway fee.
const SAMPLE_TOTALS = computeOrderTotals({
  quantity: 2,
  unitPriceKobo: eventConfig.ticketing.priceKobo,
  serviceChargeKoboPerSeat: eventConfig.ticketing.serviceChargeKoboPerSeat,
  passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
});

export const SAMPLE_ORDER: Order = {
  id: 'ord_sample_882194',
  reference: 'ENG26-TX-882194',
  buyerName: 'Emeka Okafor',
  buyerEmail: 'emeka.okafor@example.com',
  buyerPhone: '+2348012345678',
  attendeeType: 'professional',
  quantity: 2,
  unitPriceKobo: eventConfig.ticketing.priceKobo,
  serviceChargeKobo: SAMPLE_TOTALS.serviceChargeKobo,
  feeKobo: SAMPLE_TOTALS.gatewayFeeKobo,
  totalKobo: SAMPLE_TOTALS.totalKobo,
  status: 'paid',
  paystackChannel: 'card',
  createdAt: '2026-08-20T10:00:00Z',
  paidAt: '2026-08-20T10:02:15Z',
};

export const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'tkt_sample_01',
    orderId: 'ord_sample_882194',
    code: 'FIQ-7K2Q-9XM4',
    holderName: 'Emeka Okafor',
    holderPhone: '+2348012345678',
    holderPhoneLast4: '5678',
    status: 'valid',
    issuedAt: '2026-08-20T10:02:15Z',
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  },
  {
    id: 'tkt_sample_02',
    orderId: 'ord_sample_882194',
    code: 'FIQ-8P4L-3YT9',
    holderName: 'Chiamaka Adeleke',
    holderPhone: '+2348098765432',
    holderPhoneLast4: '5432',
    status: 'valid',
    issuedAt: '2026-08-20T10:02:15Z',
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  },
  {
    id: 'tkt_sample_03',
    orderId: 'ord_sample_882194',
    code: 'FIQ-9M1X-2KD8',
    holderName: 'Tunde Bakare',
    holderPhone: '+2348033334444',
    holderPhoneLast4: '4444',
    status: 'void',
    issuedAt: '2026-08-20T10:02:15Z',
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  },
  {
    id: 'tkt_sample_04',
    orderId: 'ord_sample_882194',
    code: 'FIQ-4J7V-8RN1',
    holderName: 'Zainab Bello',
    holderPhone: '+2348055556666',
    holderPhoneLast4: '6666',
    status: 'valid',
    issuedAt: '2026-08-20T10:02:15Z',
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  },
];
