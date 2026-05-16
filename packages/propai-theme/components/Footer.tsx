import React from "react";

type FooterProps = {
  className?: string;
};

const linkClass =
  "transition-colors duration-150 text-[#94a3b8] hover:text-[#3EE88A] text-[11px] font-medium";

export function Footer({ className = "" }: FooterProps) {
  return (
    <footer
      className={`border-t border-[#243040] bg-[#0d1117] px-5 py-6 ${className}`}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm font-medium text-[#e2e8f0]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#3EE88A" }}
            />
            PropAI
          </div>
          <p className="text-[11px] text-[#64748b]">
            Fresh property listings straight from broker WhatsApp networks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/" className={linkClass}>
            Home
          </a>
          <a href="/listings" className={linkClass}>
            Browse listings
          </a>
          <a href="/broker/signup" className={linkClass}>
            For brokers
          </a>
        </div>
      </div>

      <div className="mx-auto mt-4 flex max-w-7xl flex-col gap-3 border-t border-[#1e293b] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href="/privacy-policy" className={linkClass}>
            Privacy Policy
          </a>
          <a href="/terms" className={linkClass}>
            Terms &amp; Conditions
          </a>
          <a href="/refund-policy" className={linkClass}>
            Refund Policy
          </a>
          <a href="/cancellation-policy" className={linkClass}>
            Cancellation Policy
          </a>
          <a href="/contact" className={linkClass}>
            Contact Us
          </a>
        </div>
        <p className="text-[11px] text-[#475569]">
          &copy; {new Date().getFullYear()} PropAI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
