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
        <span className="inline-block text-xs sm:text-sm font-bold uppercase tracking-widest text-[#e2ff00] mb-1.5 px-2.5 py-0.5 rounded bg-[#e2ff00]/10 border border-[#e2ff00]/20">
          {eyebrow}
        </span>
      )}
      <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight uppercase font-display">
        {title}
      </h2>
      {subtitle && (
        <p className="text-base sm:text-lg text-brand-muted mt-2 max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
