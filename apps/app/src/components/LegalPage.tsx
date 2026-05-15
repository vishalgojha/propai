import React from 'react';
import { Link } from 'react-router-dom';

type Section = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  title: string;
  intro: string;
  updatedAt: string;
  sections: Section[];
};

export const LegalPage: React.FC<LegalPageProps> = ({ title, intro, updatedAt, sections }) => {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">PropAI Pulse</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">{title}</h1>
          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">{intro}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Last updated: {updatedAt}</p>

          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <section key={section.title} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5">
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[13px] leading-6 text-[var(--text-secondary)]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-5 text-[12px] text-[var(--text-secondary)]">
            <span>Questions about billing or subscriptions? Email support@propai.live.</span>
            <Link className="font-medium text-[var(--accent)] hover:underline" to="/login">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
