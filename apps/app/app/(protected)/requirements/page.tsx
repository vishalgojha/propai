"use client";

import { CircleAlert } from 'lucide-react';

export default function Page() {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
      <CircleAlert className="mx-auto h-12 w-12 text-[var(--amber)]" />
      <h2 className="mt-4 text-xl font-semibold">Requirements</h2>
      <p className="mt-2 text-[var(--text-secondary)]">
        Broker requirements dashboard will be available soon.
      </p>
    </div>
  );
}
