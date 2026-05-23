'use client';

import React from 'react';
import { CheckCircle, Bell, BellOff, InboxIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useInbox } from '../hooks/useInbox';
import { ListingCard } from '../components/stream/ListingCard';

const PAGE_SIZE = 20;

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-3 w-20 rounded bg-[var(--bg-elevated)]" />
          <div className="h-4 w-48 rounded bg-[var(--bg-elevated)]" />
          <div className="h-3 w-32 rounded bg-[var(--bg-elevated)]" />
        </div>
        <div className="h-8 w-8 rounded-lg bg-[var(--bg-elevated)]" />
      </div>
    </div>
  );
}

function NotificationBanner() {
  const [dismissed, setDismissed] = React.useState(false);

  if (
    dismissed ||
    typeof Notification === 'undefined' ||
    Notification.permission === 'granted' ||
    Notification.permission === 'denied'
  ) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center justify-between rounded-[12px] border border-[color:rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.08)] px-4 py-3">
      <div className="flex items-center gap-3">
        <Bell className="h-4 w-4 text-blue-400" />
        <p className="text-[12px] leading-5 text-[var(--text-secondary)]">
          Enable notifications to get alerted when new listings arrive.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void Notification.requestPermission(); }}
          className="rounded-[8px] bg-blue-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Enable
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-[8px] border border-[color:var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function Inbox() {
  const { items, unreadCount, markRead, markAllRead, isLoading } = useInbox();
  const [tab, setTab] = React.useState<'unread' | 'all'>('unread');
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(
    () => (tab === 'unread' ? items.filter((item) => !item.isRead) : items),
    [items, tab],
  );

  const paginated = React.useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page],
  );

  const hasMore = paginated.length < filtered.length;

  const handleToggle = (itemId: string) => {
    markRead(itemId);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <InboxIcon className="h-6 w-6 text-[var(--accent)]" />
          <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Inbox</h1>
          {unreadCount > 0 ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            Live
          </span>
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1.5 rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Mark all read
          </button>
        ) : null}
      </div>

      <NotificationBanner />

      <div className="mb-4 flex gap-1 rounded-[10px] bg-[var(--bg-elevated)] p-1">
        <button
          type="button"
          onClick={() => { setTab('unread'); setPage(1); }}
          className={cn(
            'flex-1 rounded-[8px] px-4 py-2 text-[12px] font-semibold transition-colors',
            tab === 'unread'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          Unread
          {unreadCount > 0 ? (
            <span className="ml-1.5 text-[var(--text-muted)]">({unreadCount})</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => { setTab('all'); setPage(1); }}
          className={cn(
            'flex-1 rounded-[8px] px-4 py-2 text-[12px] font-semibold transition-colors',
            tab === 'all'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          All
          <span className="ml-1.5 text-[var(--text-muted)]">({items.length})</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle className="mb-3 h-10 w-10 text-[var(--accent)]" />
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">You&apos;re all caught up</p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {tab === 'unread'
              ? 'No new listings — check back later.'
              : 'Your inbox is empty. Listings will appear here as they arrive.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map((item) => (
            <div key={item.id} className={cn(!item.isRead && 'border-l-2 border-blue-500')}>
              <ListingCard
                listing={item}
                isExpanded={false}
                onToggle={() => handleToggle(item.id)}
              />
            </div>
          ))}

          {hasMore ? (
            <div className="flex justify-center pt-2 pb-6">
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-6 py-2.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
