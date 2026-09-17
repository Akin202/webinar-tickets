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
        return 'bg-[#25D366] text-black font-bold hover:bg-[#20bd5a] border-transparent shadow-sm';
      case 'pill':
        return 'bg-brand-card hover:bg-brand-card-hover border-brand-border text-brand-text font-semibold rounded-full hover:border-brand-border-strong';
      case 'outline':
      default:
        return 'bg-brand-surface hover:bg-brand-card-hover border-brand-border text-brand-text font-semibold hover:border-brand-border-strong';
    }
  };

  return (
    <a
      id="whatsapp-support-btn"
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`min-h-[48px] px-4 py-2.5 rounded-[10px] border inline-flex items-center justify-center gap-2 text-sm transition-all active:scale-98 ${getVariantStyles()} ${className}`}
      style={{
        transition: prefersReducedMotion ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
      }}
      aria-label="Contact event support on WhatsApp"
    >
      <MessageCircle className="w-4 h-4 text-[#25D366] flex-shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </a>
  );
};
