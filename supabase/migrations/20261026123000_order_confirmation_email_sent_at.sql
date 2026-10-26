-- Track when ticket confirmation was dispatched to n8n for a paid order.
-- Prevents duplicate confirmation dispatches and enables cron retries.

alter table public.orders add column if not exists confirmation_email_sent_at timestamptz;

create index if not exists orders_unsent_confirmation_idx
  on public.orders (paid_at)
  where status = 'paid' and confirmation_email_sent_at is null;
