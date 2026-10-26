import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendTicketConfirmation } from '@/lib/ticket-confirmation';

const N8N_URL = 'https://n8n.example.test/webhook/ticket-minted';
const N8N_SECRET = 'secret_webhook_token_xyz';

describe('sendTicketConfirmation', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.N8N_TICKET_WEBHOOK_URL = N8N_URL;
    process.env.N8N_WEBHOOK_SECRET = N8N_SECRET;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.N8N_TICKET_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  it('claims order atomically and sends complete payload with base64 QR to n8n', async () => {
    const updateOrder = vi.fn();
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            update: vi.fn((updates) => {
              updateOrder(updates);
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      select: vi.fn().mockReturnValue({
                        maybeSingle: async () => ({
                          data: {
                            id: 'ord-123',
                            reference: 'FIQ26-TEST-REF1',
                            buyer_name: 'John Doe',
                            buyer_email: 'john@example.test',
                            attendee_type: 'professional',
                            total_kobo: 1_000_000,
                            status: 'paid',
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        code: 'FIQ-ABCD-EFGH',
                        holder_name: 'John Doe',
                        status: 'valid',
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await sendTicketConfirmation('ord-123', mockSupabase as any);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(N8N_URL);
    expect(options.method).toBe('POST');
    expect(options.headers['X-Webhook-Secret']).toBe(N8N_SECRET);
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.reference).toBe('FIQ26-TEST-REF1');
    expect(body.customer_name).toBe('John Doe');
    expect(body.customer_email).toBe('john@example.test');
    expect(body.event_name).toBe('Flag Skool Summit');
    expect(body.event_date).toBe('2026-10-31');
    expect(body.event_date_display).toContain('October 2026');
    expect(body.event_time).toBe('10:00 - 16:00');
    expect(body.event_venue).toContain('AI UniPod');
    expect(body.amount).toBe('10,000');
    expect(body.currency).toBe('NGN');
    expect(body.ticket_page_url).toContain('/ticket/FIQ26-TEST-REF1');
    expect(body).not.toHaveProperty('buyer_phone');
    expect(body).not.toHaveProperty('customer_phone');

    expect(body.tickets).toHaveLength(1);
    expect(body.tickets[0].ticket_code).toBe('FIQ-ABCD-EFGH');
    expect(body.tickets[0].ticket_type).toBe('professional');
    expect(body.tickets[0].holder_name).toBe('John Doe');
    expect(body.tickets[0]).not.toHaveProperty('holder_phone');
    expect(typeof body.tickets[0].qr_png_base64).toBe('string');
    // Base64 header for PNG starts with iVBORw0KGgo
    expect(body.tickets[0].qr_png_base64.startsWith('iVBORw0KGgo')).toBe(true);
  });

  it('skips gracefully if order is already claimed or not found', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: async () => ({
                    data: null, // No row returned -> already claimed/sent
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })),
    };

    const result = await sendTicketConfirmation('ord-already-sent', mockSupabase as any);

    expect(result).toEqual({ ok: true, skipped: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reverts confirmation_email_sent_at to null on n8n failure and does not log credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    });

    const revertedUpdates: any[] = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            update: vi.fn((updates) => {
              revertedUpdates.push(updates);
              return {
                eq: vi.fn((field, val) => {
                  if (updates.confirmation_email_sent_at === null) {
                    return Promise.resolve({ error: null });
                  }
                  return {
                    eq: vi.fn().mockReturnValue({
                      is: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                          maybeSingle: async () => ({
                            data: {
                              id: 'ord-fail',
                              reference: 'FIQ26-FAIL-REF',
                              buyer_name: 'Alice',
                              buyer_email: 'alice@example.test',
                              attendee_type: 'student',
                              total_kobo: 1_000_000,
                              status: 'paid',
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  };
                }),
              };
            }),
          };
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        code: 'FIQ-SECR-ET01',
                        holder_name: 'Alice',
                        status: 'valid',
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTicketConfirmation('ord-fail', mockSupabase as any);

    expect(result.ok).toBe(false);
    expect(revertedUpdates).toEqual([
      { confirmation_email_sent_at: expect.any(String) },
      { confirmation_email_sent_at: null },
    ]);

    // Assert that console error logged the reference but NOT the bearer credential
    expect(consoleError).toHaveBeenCalled();
    const loggedMessage = consoleError.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(loggedMessage).toContain('FIQ26-FAIL-REF');
    expect(loggedMessage).not.toContain('FIQ-SECR-ET01');

    consoleError.mockRestore();
  });

  it('formats complimentary order amount as "Complimentary"', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      maybeSingle: async () => ({
                        data: {
                          id: 'ord-comp',
                          reference: 'FIQ26-COMP-REF',
                          buyer_name: 'VIP Guest',
                          buyer_email: 'comp@invalid.local',
                          attendee_type: null,
                          total_kobo: 0,
                          status: 'paid',
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            })),
          };
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        code: 'FIQ-COMP-0001',
                        holder_name: 'VIP Guest',
                        status: 'valid',
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await sendTicketConfirmation('ord-comp', mockSupabase as any);

    expect(result.ok).toBe(true);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe('Complimentary');
    expect(body.customer_email).toBe('comp@invalid.local');
    expect(body.tickets[0].ticket_type).toBe('complimentary');
  });

  it('reverts column to null and warns if N8N_TICKET_WEBHOOK_URL is not set', async () => {
    delete process.env.N8N_TICKET_WEBHOOK_URL;

    const revertedUpdates: any[] = [];
    const mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn((updates) => {
          revertedUpdates.push(updates);
          return {
            eq: vi.fn((field, val) => {
              if (updates.confirmation_email_sent_at === null) {
                return Promise.resolve({ error: null });
              }
              return {
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      maybeSingle: async () => ({
                        data: {
                          id: 'ord-no-url',
                          reference: 'FIQ26-NO-URL',
                          buyer_name: 'Bob',
                          buyer_email: 'bob@example.test',
                          attendee_type: 'student',
                          total_kobo: 1_000_000,
                          status: 'paid',
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }),
          };
        }),
      })),
    };

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendTicketConfirmation('ord-no-url', mockSupabase as any);

    expect(result).toEqual({ ok: false, reason: 'N8N_TICKET_WEBHOOK_URL not configured' });
    expect(revertedUpdates).toEqual([
      { confirmation_email_sent_at: expect.any(String) },
      { confirmation_email_sent_at: null },
    ]);
    expect(mockFetch).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
  });
});
