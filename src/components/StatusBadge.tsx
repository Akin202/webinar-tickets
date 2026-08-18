import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle, Sparkles } from 'lucide-react';
import { OrderStatus, TicketStatus } from '@/types/ticketing';

interface StatusBadgeProps {
  status: OrderStatus | TicketStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = status.toLowerCase();

  const getStatusConfig = () => {
    switch (normalized) {
      case 'paid':
        return {
          label: 'PAID & CONFIRMED',
          icon: CheckCircle2,
          bgClass: 'bg-brand-success-bg',
          textClass: 'text-brand-success',
          borderClass: 'border-brand-success-border',
        };
      case 'valid':
        return {
          label: 'VALID FOR ENTRY',
          icon: Sparkles,
          bgClass: 'bg-brand-success-bg',
          textClass: 'text-brand-success',
          borderClass: 'border-brand-success-border',
        };
      case 'pending':
        return {
          label: 'PAYMENT PENDING',
          icon: Clock,
          bgClass: 'bg-brand-warning-bg',
          textClass: 'text-brand-warning',
          borderClass: 'border-brand-warning-border',
        };
      case 'used':
        return {
          label: 'CHECKED IN',
          icon: CheckCircle2,
          bgClass: 'bg-brand-subtle',
          textClass: 'text-brand-muted',
          borderClass: 'border-brand-border',
        };
      case 'failed':
        return {
          label: 'PAYMENT FAILED',
          icon: XCircle,
          bgClass: 'bg-brand-urgent-bg',
          textClass: 'text-brand-urgent',
          borderClass: 'border-brand-urgent-border',
        };
      case 'cancelled':
        return {
          label: 'CANCELLED',
          icon: AlertCircle,
          bgClass: 'bg-brand-urgent-bg',
          textClass: 'text-brand-urgent',
          borderClass: 'border-brand-urgent-border',
        };
      default:
        return {
          label: status.toUpperCase(),
          icon: Clock,
          bgClass: 'bg-brand-subtle',
          textClass: 'text-brand-muted',
          borderClass: 'border-brand-border',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-3 py-1.5 text-xs sm:text-sm gap-2';

  return (
    <span
      id={`status-badge-${normalized}`}
      className={`inline-flex items-center font-bold tracking-wider uppercase rounded-full border ${config.bgClass} ${config.textClass} ${config.borderClass} ${sizeClasses}`}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span>{config.label}</span>
    </span>
  );
};
