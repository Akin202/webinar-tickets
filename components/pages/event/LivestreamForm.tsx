'use client';

import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { registerLivestream } from '@/lib/data-access';
import type { AttendeeType } from '@/types/ticketing';
import { typographic } from './event-format';

const { livestream, attendeeTypes, support } = eventConfig;
const { form } = livestream;

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'done'; alreadyRegistered: boolean }
  | { state: 'error'; message: string };

/**
 * Free livestream registration, inline on the event page.
 *
 * No payment and no seat: this posts to /api/livestream, which writes to a
 * table nothing in the capacity path reads. A repeat email is a success, not
 * an error — the server reports `already_registered` and the panel says so.
 */
export function LivestreamForm() {
  const fieldId = useId();
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    attendeeType: '' as AttendeeType | '',
    marketingOptIn: false,
  });

  const isSending = status.state === 'sending';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending || !values.attendeeType) return;
    setStatus({ state: 'sending' });
    try {
      const result = await registerLivestream({
        name: values.name,
        email: values.email,
        phone: values.phone,
        attendeeType: values.attendeeType,
        marketingOptIn: values.marketingOptIn,
      });
      setStatus({ state: 'done', alreadyRegistered: result.outcome === 'already_registered' });
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof Error && err.message ? err.message : form.errorFallback,
      });
    }
  }

  if (status.state === 'done') {
    const heading = status.alreadyRegistered ? form.alreadyHeading : form.successHeading;
    const body = status.alreadyRegistered ? form.alreadyBody : form.successBody;
    return (
      <div className="sp-done" role="status">
        <p className="sp-done__head">
          <Check aria-hidden="true" strokeWidth={2.5} />
          <b>{typographic(heading)}</b>
        </p>
        <p className="sp-micro">{typographic(body)}</p>
      </div>
    );
  }

  return (
    <form className="sp-form" onSubmit={handleSubmit} noValidate>
      <div className="sp-field">
        <label htmlFor={`${fieldId}-name`}>{form.nameLabel}</label>
        <input
          id={`${fieldId}-name`}
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </div>

      <div className="sp-field">
        <label htmlFor={`${fieldId}-email`}>{form.emailLabel}</label>
        <input
          id={`${fieldId}-email`}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </div>

      <div className="sp-field">
        <label htmlFor={`${fieldId}-phone`}>{form.phoneLabel}</label>
        <input
          id={`${fieldId}-phone`}
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          aria-describedby={`${fieldId}-phone-hint`}
          value={values.phone}
          onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
        />
        <p className="sp-field__hint" id={`${fieldId}-phone-hint`}>
          {form.phoneHint}
        </p>
      </div>

      <div className="sp-field">
        <label htmlFor={`${fieldId}-type`}>{form.attendeeTypeLabel}</label>
        <select
          id={`${fieldId}-type`}
          name="attendeeType"
          required
          value={values.attendeeType}
          onChange={(e) =>
            setValues((v) => ({ ...v, attendeeType: e.target.value as AttendeeType }))
          }
        >
          <option value="" disabled>
            {form.attendeeTypePlaceholder}
          </option>
          {attendeeTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <label className="sp-check" htmlFor={`${fieldId}-marketing`}>
        <input
          id={`${fieldId}-marketing`}
          name="marketingOptIn"
          type="checkbox"
          checked={values.marketingOptIn}
          onChange={(e) => setValues((v) => ({ ...v, marketingOptIn: e.target.checked }))}
        />
        <span>{form.marketingLabel}</span>
      </label>

      {status.state === 'error' && (
        <p className="sp-formerror" role="alert">
          {typographic(status.message)}{' '}
          <a
            href={`https://wa.me/${support.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(support.whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Message us on WhatsApp
          </a>
        </p>
      )}

      <button
        className="sp-btn sp-btn--outline sp-btn--wide"
        type="submit"
        disabled={isSending}
      >
        {isSending ? form.submittingLabel : form.submitLabel}
      </button>
    </form>
  );
}
