import React from 'react';
import { LucideIcon, ExternalLink } from 'lucide-react';

interface DetailRowProps {
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
  subValue?: string;
}

export const DetailRow: React.FC<DetailRowProps> = ({
  icon: Icon,
  label,
  value,
  actionHref,
  actionLabel,
  subValue,
}) => {
  return (
    <div
      id={`detail-row-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
      className="flex items-start gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-brand-card border border-brand-border hover:border-brand-border-strong transition-colors"
    >
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex-shrink-0 flex items-center justify-center text-brand-primary">
        <Icon className="w-5 h-5 text-brand-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-brand-muted mb-0.5">
          {label}
        </p>
        <div className="text-base sm:text-lg font-bold text-brand-text break-words leading-snug font-display">
          {value}
        </div>
        {subValue && (
          <p className="text-xs sm:text-sm text-brand-muted mt-1 leading-relaxed">{subValue}</p>
        )}
      </div>

      {actionHref && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-brand-surface hover:bg-brand-card-hover border border-brand-border hover:border-brand-primary/40 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-primary transition-all flex-shrink-0 active:scale-95"
          aria-label={`${actionLabel || 'View'} for ${label}`}
        >
          <span>{actionLabel || 'View'}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};
