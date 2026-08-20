import React from 'react';

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  align?: 'left' | 'center';
  id?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  subtitle,
  eyebrow,
  align = 'left',
  id,
}) => {
  return (
    <div
      id={id || `section-heading-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
      className={`mb-6 sm:mb-8 ${align === 'center' ? 'text-center mx-auto' : 'text-left'}`}
    >
      {eyebrow && (
        <span className="inline-block text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.2em] text-brand-primary mb-2 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20">
          {eyebrow}
        </span>
      )}
      <h2 className="text-2xl sm:text-4xl font-extrabold text-brand-text tracking-tight leading-[1.1] font-display">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm sm:text-base text-brand-muted mt-2 max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
