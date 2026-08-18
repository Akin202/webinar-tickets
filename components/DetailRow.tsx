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
      className="flex items-start gap-4 p-4 sm:p-5 rounded-xl bg-brand-card border border-brand-border"
    >
      <div className="w-12 h-12 rounded-xl bg-brand-subtle flex-shrink-0 flex items-center justify-center text-brand-primary">
        <Icon className="w-6 h-6 text-brand-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand-muted mb-0.5">
          {label}
        </p>
        <div className="text-base sm:text-lg font-medium text-brand-text break-words">
          {value}
        </div>
        {subValue && (
          <p className="text-sm text-brand-muted mt-1 leading-relaxed">{subValue}</p>
        )}
      </div>

      {actionHref && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] min-w-[48px] px-3 py-2 rounded-lg bg-brand-subtle hover:bg-brand-card-hover border border-brand-border flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-primary transition-colors flex-shrink-0"
          aria-label={`${actionLabel || 'View'} for ${label}`}
        >
          <span>{actionLabel || 'View'}</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
};
