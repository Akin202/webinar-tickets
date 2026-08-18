'use client';

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, ShieldCheck, User, Mail, Phone, GraduationCap, Building2, Loader2 } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import {
  CheckoutValues,
  PurchaseState,
  koboToNaira,
  normaliseNgPhone,
  paystackFeeKobo,
} from '@/types/ticketing';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface CheckoutFormProps {
  initialValues?: Partial<CheckoutValues>;
  purchaseState: PurchaseState; // controlled from outside
  onSubmit: (values: CheckoutValues) => void; // fire and forget
}

// Zod schema based on config rules
const checkoutSchema = z.object({
  fullName: z.string().min(3, 'Please enter your full official name (min 3 characters)'),
  email: z.string().email('Please enter a valid email address for your ticket delivery'),
  phone: z
    .string()
    .min(10, 'Please enter a valid Nigerian phone number')
    .refine((val) => {
      const norm = normaliseNgPhone(val);
      return norm.startsWith('+234') && norm.length >= 13;
    }, 'Must be a valid Nigerian number (e.g. 08023456789 or +234...)'),
  matricNumber: eventConfig.featureFlags.requireMatricNumber
    ? z.string().min(5, 'Matric / Student ID number is required (e.g. 190403063)')
    : z.string().optional(),
  department: z.string().optional(),
  quantity: z
    .number()
    .min(1, 'Quantity must be at least 1')
    .max(eventConfig.ticketing.maxPerOrder, `Maximum ${eventConfig.ticketing.maxPerOrder} tickets per order`),
});

type FormSchema = z.infer<typeof checkoutSchema>;

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  initialValues,
  purchaseState,
  onSubmit,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isValidating = purchaseState.status === 'validating';
  const isDisabled = isValidating || purchaseState.status !== 'idle';

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormSchema>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: initialValues?.fullName || '',
      email: initialValues?.email || '',
      phone: initialValues?.phone ? normaliseNgPhone(initialValues.phone) : '',
      matricNumber: initialValues?.matricNumber || '',
      department: initialValues?.department || '',
      quantity: initialValues?.quantity || 1,
    },
  });

  const quantity = watch('quantity') || 1;
  const unitPriceKobo = eventConfig.ticketing.priceKobo;
  const baseTotalKobo = unitPriceKobo * quantity;
  const feeKobo = eventConfig.ticketing.passFeeToBuyer
    ? paystackFeeKobo(baseTotalKobo)
    : 0;
  const grandTotalKobo = baseTotalKobo + feeKobo;

  const handlePhoneBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw) {
      const normalized = normaliseNgPhone(raw);
      setValue('phone', normalized, { shouldValidate: true });
    }
  };

  const handleFormSubmit = (data: FormSchema) => {
    onSubmit({
      fullName: data.fullName,
      email: data.email,
      phone: normaliseNgPhone(data.phone),
      matricNumber: data.matricNumber,
      department: data.department,
      quantity: data.quantity,
    });
  };

  return (
    <form
      id="checkout-form"
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
      className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
    >
      {/* Buyer Details Column */}
      <div className="lg:col-span-7 space-y-6">
        <div className="p-6 sm:p-8 rounded-2xl bg-brand-card border border-brand-border space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-primary">
            <User className="w-4 h-4" />
            <span>Attendee Information</span>
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Full Name <span className="text-brand-urgent">*</span>
            </label>
            <div className="relative">
              <input
                id="fullName"
                type="text"
                disabled={isDisabled}
                placeholder="e.g. Babatunde Folarin Adeyemi"
                {...register('fullName')}
                className={`w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border text-brand-text placeholder-brand-dim text-base focus:border-brand-primary transition-colors ${
                  errors.fullName ? 'border-brand-urgent' : 'border-brand-border'
                } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            {errors.fullName && (
              <p className="text-xs text-brand-urgent font-medium mt-1">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Email Address <span className="text-brand-urgent">*</span>
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                disabled={isDisabled}
                placeholder="e.g. student@live.unilag.edu.ng"
                {...register('email')}
                className={`w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border text-brand-text placeholder-brand-dim text-base focus:border-brand-primary transition-colors ${
                  errors.email ? 'border-brand-urgent' : 'border-brand-border'
                } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <p className="text-[11px] text-brand-dim mt-1">
              Your digital ticket & QR code will be delivered here instantly.
            </p>
            {errors.email && (
              <p className="text-xs text-brand-urgent font-medium mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label
              htmlFor="phone"
              className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1.5"
            >
              WhatsApp Phone Number <span className="text-brand-urgent">*</span>
            </label>
            <div className="relative">
              <input
                id="phone"
                type="tel"
                disabled={isDisabled}
                placeholder="e.g. 08023456789 or +234..."
                {...register('phone')}
                onBlur={handlePhoneBlur}
                className={`w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border text-brand-text placeholder-brand-dim text-base font-mono focus:border-brand-primary transition-colors ${
                  errors.phone ? 'border-brand-urgent' : 'border-brand-border'
                } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <p className="text-[11px] text-brand-dim mt-1">
              Format: 080... or +234... (automatically formatted on blur).
            </p>
            {errors.phone && (
              <p className="text-xs text-brand-urgent font-medium mt-1">
                {errors.phone.message}
              </p>
            )}
          </div>

          {/* Matric Number (Conditional) */}
          {eventConfig.featureFlags.requireMatricNumber && (
            <div>
              <label
                htmlFor="matricNumber"
                className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1.5"
              >
                UNILAG Matric / Student ID <span className="text-brand-urgent">*</span>
              </label>
              <div className="relative">
                <input
                  id="matricNumber"
                  type="text"
                  disabled={isDisabled}
                  placeholder="e.g. 190403063 (or GUEST if outside UNILAG)"
                  {...register('matricNumber')}
                  className={`w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border text-brand-text placeholder-brand-dim text-base font-mono focus:border-brand-primary transition-colors ${
                    errors.matricNumber ? 'border-brand-urgent' : 'border-brand-border'
                  } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              {errors.matricNumber && (
                <p className="text-xs text-brand-urgent font-medium mt-1">
                  {errors.matricNumber.message}
                </p>
              )}
            </div>
          )}

          {/* Department (Optional) */}
          <div>
            <label
              htmlFor="department"
              className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Department / Discipline <span className="text-brand-dim">(Optional)</span>
            </label>
            <div className="relative">
              <input
                id="department"
                type="text"
                disabled={isDisabled}
                placeholder="e.g. Electrical & Electronics Engineering"
                {...register('department')}
                className={`w-full min-h-[48px] px-4 rounded-xl bg-brand-subtle border text-brand-text placeholder-brand-dim text-base focus:border-brand-primary transition-colors ${
                  errors.department ? 'border-brand-urgent' : 'border-brand-border'
                } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            {errors.department && (
              <p className="text-xs text-brand-urgent font-medium mt-1">
                {errors.department.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary & Quantity Column */}
      <div className="lg:col-span-5 space-y-6">
        <div className="p-6 sm:p-8 rounded-2xl bg-brand-card border border-brand-border space-y-6 sticky top-6">
          <div className="flex items-center justify-between border-b border-brand-border pb-4">
            <div>
              <h2 className="text-lg font-bold text-brand-text">Order Summary</h2>
              <p className="text-xs text-brand-muted">{eventConfig.event.tagline || eventConfig.event.name}</p>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-brand-subtle text-xs font-semibold text-brand-primary border border-brand-border">
              Standard Pass
            </span>
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-brand-border pb-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted mb-0.5">
                Number of Passes
              </label>
              <p className="text-xs text-brand-dim">
                Max {eventConfig.ticketing.maxPerOrder} passes per order
              </p>
            </div>
            <Controller
              name="quantity"
              control={control}
              render={({ field }) => (
                <QuantityStepper
                  value={field.value}
                  min={1}
                  max={eventConfig.ticketing.maxPerOrder}
                  onChange={field.onChange}
                  disabled={isDisabled}
                />
              )}
            />
          </div>

          {/* Pricing Breakdown */}
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between text-brand-muted">
              <span>Unit Price</span>
              <span className="font-mono text-brand-text">{koboToNaira(unitPriceKobo)}</span>
            </div>

            <div className="flex items-center justify-between text-brand-muted">
              <span>Subtotal ({quantity} {quantity === 1 ? 'ticket' : 'tickets'})</span>
              <span className="font-mono text-brand-text">{koboToNaira(baseTotalKobo)}</span>
            </div>

            {eventConfig.ticketing.passFeeToBuyer && (
              <div className="flex items-center justify-between text-brand-muted">
                <span className="flex items-center gap-1">
                  <span>Paystack Processing Fee</span>
                </span>
                <span className="font-mono text-brand-text">{koboToNaira(feeKobo)}</span>
              </div>
            )}

            <div className="pt-3 border-t border-brand-border flex items-baseline justify-between">
              <span className="text-base font-bold text-brand-text">Total Payable</span>
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-brand-primary">
                {koboToNaira(grandTotalKobo)}
              </span>
            </div>
          </div>

          {/* Trust badges */}
          <div className="p-3.5 rounded-xl bg-brand-subtle border border-brand-border flex items-center gap-3 text-xs text-brand-muted">
            <ShieldCheck className="w-5 h-5 text-brand-accent flex-shrink-0" />
            <span>256-bit encrypted checkout via Paystack. Direct card, bank transfer & USSD accepted.</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="checkout-submit-btn"
            disabled={isDisabled}
            className={`w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-brand-surface font-extrabold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-lg shadow-brand-primary/20 transition-all ${
              isDisabled ? 'opacity-70 cursor-not-allowed' : 'active:scale-98'
            }`}
            style={{
              transition: prefersReducedMotion ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
            }}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Validating Ticket Details...</span>
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                <span>Pay {koboToNaira(grandTotalKobo)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
