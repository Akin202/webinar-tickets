'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface WhatsAppSupportButtonProps {
  label?: string;
  orderRef?: string;
  className?: string;
  variant?: 'primary' | 'outline' | 'pill';
}

export const WhatsAppSupportButton: React.FC<WhatsAppSupportButtonProps> = ({
  label = 'Chat on WhatsApp',
  orderRef,
  className = '',
  variant = 'outline',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const phone = eventConfig.support.whatsappNumber.replace(/\D/g, '');
  const baseMessage = eventConfig.support.whatsappMessage;
  const fullMessage = orderRef
    ? `${baseMessage} (Order Ref: ${orderRef})`
    : baseMessage;

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`;

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-brand-accent text-brand-surface font-bold hover:opacity-90 border-transparent';
      case 'pill':
        return 'bg-brand-card hover:bg-brand-card-hover border-brand-border text-brand-text font-medium rounded-full';
      case 'outline':
      default:
        return 'bg-brand-subtle hover:bg-brand-card-hover border-brand-border text-brand-text font-medium';
    }
  };

  return (
    <a
      id="whatsapp-support-btn"
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`min-h-[48px] px-5 py-2.5 rounded-xl border inline-flex items-center justify-center gap-2.5 text-base transition-all ${getVariantStyles()} ${className}`}
      style={{
        transition: prefersReducedMotion ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
      }}
      aria-label="Contact event support on WhatsApp"
    >
      <MessageCircle className="w-5 h-5 text-brand-accent flex-shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </a>
  );
};
