import React from 'react';
import { cn } from '../../lib/utils';

type ProviderKind = 'gemini' | 'groq' | 'openrouter' | 'doubleword';

type ProviderLogoProps = {
  provider: ProviderKind;
  className?: string;
};

function GeminiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden="true">
      <path
        d="M12 2.5l2.8 6.1L21 12l-6.2 3.4L12 21.5l-2.8-6.1L3 12l6.2-3.4L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.2l1.4 3 3.1 1.8-3.1 1.8-1.4 3-1.4-3-3.1-1.8 3.1-1.8 1.4-3Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}

function GroqLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16.5 8.2A5.8 5.8 0 1 0 17.8 13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16.8" cy="7.4" r="1.2" fill="currentColor" />
    </svg>
  );
}

function OpenRouterLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 15.5l6.8-6.8M11.2 8.7H15v3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="15.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function DoublewordLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 8h10M7 12h10M7 16h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProviderLogo({ provider, className }: ProviderLogoProps) {
  switch (provider) {
    case 'gemini':
      return <GeminiLogo className={className} />;
    case 'groq':
      return <GroqLogo className={className} />;
    case 'openrouter':
      return <OpenRouterLogo className={className} />;
    case 'doubleword':
      return <DoublewordLogo className={className} />;
    default:
      return <GeminiLogo className={className} />;
  }
}
