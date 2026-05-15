import React from 'react';
import { Link } from 'react-router-dom';

type LegalFooterProps = {
  className?: string;
  compact?: boolean;
};

const linkClass =
  'transition-colors duration-150 text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

export const LegalFooter: React.FC<LegalFooterProps> = ({ className = '', compact = false }) => {
  return (
    <footer
      className={[
        'border-t border-[color:var(--border)] bg-[var(--bg-surface)]',
        compact ? 'px-4 py-4' : 'px-5 py-5',
        className,
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
          PropAI Pulse uses password login and device memory to keep sign-in friction low.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium">
          <Link className={linkClass} to="/privacy-policy">
            Privacy Policy
          </Link>
          <Link className={linkClass} to="/terms">
            Terms & Conditions
          </Link>
          <Link className={linkClass} to="/refund-policy">
            Refund Policy
          </Link>
          <Link className={linkClass} to="/cancellation-policy">
            Cancellation Policy
          </Link>
          <Link className={linkClass} to="/contact">
            Contact Us
          </Link>
        </div>
      </div>
    </footer>
  );
};
