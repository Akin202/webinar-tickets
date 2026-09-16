import type { Order, Ticket } from '@/types/ticketing';

/**
 * snake_case database rows -> camelCase contract types. The contract in
 * /types/ticketing.ts is the single shape the UI knows; these two functions
 * are the only place the column names appear outside SQL.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orderFromRow(row: any): Order {
  return {
    id: row.id,
    reference: row.reference,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    attendeeType: row.attendee_type ?? null,
    quantity: row.quantity,
    unitPriceKobo: row.unit_price_kobo,
    serviceChargeKobo: row.service_charge_kobo,
    feeKobo: row.fee_kobo,
    totalKobo: row.total_kobo,
    status: row.status,
    paystackChannel: row.paystack_channel,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ticketFromRow(row: any): Ticket {
  return {
    id: row.id,
    orderId: row.order_id,
    code: row.code,
    holderName: row.holder_name,
    holderPhone: row.holder_phone,
    status: row.status,
    issuedAt: row.issued_at,
    checkedInAt: row.checked_in_at,
    checkedInBy: row.checked_in_by,
    checkedInDevice: row.checked_in_device,
  };
}
