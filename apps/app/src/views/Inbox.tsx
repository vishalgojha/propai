'use client';

import React from 'react';
import { Bell, CheckCircle, Clock, InboxIcon, MapPin, MessageSquare, Pencil, Save, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getStreamPriceLabel } from '../lib/streamPrice';
import { useInbox } from '../hooks/useInbox';
import { useAuth } from '../context/AuthContext';
import { correctStreamItem, type InboxMatch, type StreamItem } from '../services/streamAPI';

const PAGE_SIZE = 20;

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="h-3 w-36 rounded bg-[var(--bg-elevated)]" />
      <div className="mt-4 h-5 w-72 rounded bg-[var(--bg-elevated)]" />
      <div className="mt-3 h-3 w-full rounded bg-[var(--bg-elevated)]" />
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
        <p className="text-[12px] leading-5 text-[var(--text-secondary)]">Enable notifications to get alerted when new matches arrive.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { void Notification.requestPermission(); }} className="rounded-[8px] bg-blue-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-600">
          Enable
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-[8px] border border-[color:var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(value?: string) {
  const parsed = value ? new Date(value).getTime() : 0;
  if (!parsed) return 'now';
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function cleanMarketLocation(value?: string | null) {
  const location = String(value || '').trim();
  if (!location || /^mumbai market$/i.test(location)) return '';
  return location;
}

function itemTitle(item: StreamItem) {
  const location = cleanMarketLocation(item.location);
  const title = String(item.title || '').trim();
  const genericTitle = !title || /wanted in mumbai market|property listing|broker-sourced/i.test(title);
  if (!genericTitle) return title;

  const bhk = String(item.bhk || '').trim();
  const asset = String(item.assetClass || item.propertyCategory || 'property').trim();
  if (item.type === 'Requirement') {
    return [bhk && !/^n\/?a$/i.test(bhk) ? bhk : '', asset, 'requirement', location ? `in ${location}` : ''].filter(Boolean).join(' ');
  }
  return [item.type === 'Rent' ? 'Rental' : item.type, asset, location ? `in ${location}` : ''].filter(Boolean).join(' ');
}

function priceLabel(item: StreamItem) {
  return getStreamPriceLabel(item);
}

function typeTone(type: StreamItem['type']) {
  if (type === 'Requirement') return 'border-blue-400/30 bg-blue-500/10 text-blue-300';
  if (type === 'Rent' || type === 'Lease') return 'border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.1)] text-[var(--accent)]';
  return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 truncate text-[12px] font-semibold text-[var(--text-primary)]">{value || '-'}</p>
    </div>
  );
}

function MiniItem({ item, label }: { item: StreamItem; label: string }) {
  const location = cleanMarketLocation(item.location) || 'Mumbai market';
  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">{label}</span>
        <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]', typeTone(item.type))}>{item.type}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-bold leading-6 text-[var(--text-primary)]">{itemTitle(item)}</h3>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
        <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span>{location}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.04] pt-4 sm:grid-cols-4">
        <DetailRow label="Price" value={priceLabel(item)} />
        <DetailRow label="BHK" value={item.bhk && !/^n\/?a$/i.test(item.bhk) ? item.bhk : null} />
        <DetailRow label="Asset" value={item.assetClass || item.propertyCategory} />
        <DetailRow label="Broker" value={item.brokerName || item.source} />
      </div>
    </div>
  );
}

function inboxLabel(item: StreamItem, side: 'source' | 'match') {
  const isRequirement = item.type === 'Requirement' || item.recordType === 'requirement';
  if (side === 'source') return isRequirement ? 'Your requirement' : 'Your listing';
  return isRequirement ? 'Matching requirement' : 'Matching listing';
}

function AdminCorrectionPanel({ item }: { item: StreamItem }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: item.title || itemTitle(item),
    type: item.type,
    location: cleanMarketLocation(item.location) || item.location || '',
    price: item.price || '',
    bhk: item.bhk || '',
    dealType: item.dealType || '',
    assetClass: item.assetClass || '',
    rawText: item.rawText || item.description || '',
    parseNotes: item.parseNotes || '',
  });

  React.useEffect(() => {
    setForm({
      title: item.title || itemTitle(item),
      type: item.type,
      location: cleanMarketLocation(item.location) || item.location || '',
      price: item.price || '',
      bhk: item.bhk || '',
      dealType: item.dealType || '',
      assetClass: item.assetClass || '',
      rawText: item.rawText || item.description || '',
      parseNotes: item.parseNotes || '',
    });
  }, [item]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSaved(null);
    const result = await correctStreamItem(item.id, {
      title: form.title,
      type: form.type,
      location: form.location,
      price: form.price,
      bhk: form.bhk,
      dealType: form.dealType,
      assetClass: form.assetClass,
      rawText: form.rawText,
      parseNotes: form.parseNotes || 'Corrected from super-admin Inbox review',
    });
    setSaving(false);
    setSaved(result?.success ? 'Saved correction for parser learning.' : 'Save failed.');
  };

  return (
    <div className="mt-4 rounded-[12px] border border-[color:rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.06)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-300">Super admin parser review</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Raw WhatsApp message and correction fields for parser learning.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)]">
          {open ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Raw WhatsApp message</span>
            <textarea value={form.rawText} onChange={(event) => update('rawText', event.target.value)} rows={5} className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3 text-[12px] leading-5 text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Correct title" className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
            <select value={form.type} onChange={(event) => update('type', event.target.value)} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]">
              {['Rent', 'Sale', 'Requirement', 'Pre-leased', 'Lease'].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Location" className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
            <input value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="Price label" className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
            <input value={form.bhk} onChange={(event) => update('bhk', event.target.value)} placeholder="BHK" className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
            <input value={form.assetClass} onChange={(event) => update('assetClass', event.target.value)} placeholder="Asset class" className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
          </div>
          <textarea value={form.parseNotes} onChange={(event) => update('parseNotes', event.target.value)} rows={2} placeholder="Correction note" className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-[#061108] disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Update parser record'}
            </button>
            {saved ? <span className="text-[11px] text-[var(--text-secondary)]">{saved}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InboxMatchCard({ match, isSuperAdmin, onRead }: { match: InboxMatch; isSuperAdmin: boolean; onRead: (id: string) => void }) {
  const unread = !match.isRead && !match.matchedItem.isRead;
  return (
    <article className={cn('rounded-[16px] border bg-[var(--bg-surface)] p-4', unread ? 'border-blue-500/45 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]' : 'border-[color:var(--border)]')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-semibold text-[var(--text-primary)]">Match score {match.matchScore}</span>
          {match.matchReasons.slice(0, 4).map((reason) => (
            <span key={reason} className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[var(--text-secondary)]">{reason}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <Clock className="h-3.5 w-3.5" />
          {formatTimeAgo(match.createdAt)}
          {unread ? (
            <button type="button" onClick={() => onRead(match.id)} className="ml-2 rounded-[8px] border border-[color:var(--border)] px-2.5 py-1 font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">Mark read</button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <MiniItem item={match.sourceItem} label={inboxLabel(match.sourceItem, 'source')} />
        <MiniItem item={match.matchedItem} label={inboxLabel(match.matchedItem, 'match')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <MessageSquare className="h-4 w-4 text-[var(--accent)]" />
          Review the fit, then contact the saved source or client from the matched record.
        </div>
        <a href={match.matchedItem.waLink || '#'} target="_blank" rel="noreferrer" className={cn('rounded-[10px] px-4 py-2 text-[12px] font-bold', match.matchedItem.waLink ? 'bg-[var(--accent)] text-[#061108]' : 'pointer-events-none bg-[var(--bg-elevated)] text-[var(--text-muted)]')}>
          Open WhatsApp
        </a>
      </div>

      {isSuperAdmin ? <AdminCorrectionPanel item={match.matchedItem} /> : null}
    </article>
  );
}

export function Inbox() {
  const { user } = useAuth();
  const { matches, unreadCount, markRead, markAllRead, isLoading } = useInbox();
  const [tab, setTab] = React.useState<'unread' | 'all'>('unread');
  const [page, setPage] = React.useState(1);
  const isSuperAdmin = user?.appRole === 'super_admin';

  const filtered = React.useMemo(
    () => (tab === 'unread' ? matches.filter((match) => !match.isRead && !match.matchedItem.isRead) : matches),
    [matches, tab],
  );
  const paginated = React.useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore = paginated.length < filtered.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <InboxIcon className="h-6 w-6 text-[var(--accent)]" />
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Inbox</h1>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Auto-matched workspace listings and buyer or tenant requirements.</p>
          </div>
          {unreadCount > 0 ? <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{unreadCount}</span> : null}
        </div>

        {unreadCount > 0 ? (
          <button type="button" onClick={markAllRead} className="flex items-center gap-1.5 rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]">
            <CheckCircle className="h-3.5 w-3.5" />
            Mark all read
          </button>
        ) : null}
      </div>

      <NotificationBanner />

      <div className="mb-4 flex gap-1 rounded-[10px] bg-[var(--bg-elevated)] p-1">
        {(['unread', 'all'] as const).map((nextTab) => (
          <button
            key={nextTab}
            type="button"
            onClick={() => { setTab(nextTab); setPage(1); }}
            className={cn('flex-1 rounded-[8px] px-4 py-2 text-[12px] font-semibold capitalize transition-colors', tab === nextTab ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
          >
            {nextTab}
            <span className="ml-1.5 text-[var(--text-muted)]">({nextTab === 'unread' ? unreadCount : matches.length})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle className="mb-3 h-10 w-10 text-[var(--accent)]" />
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">You&apos;re all caught up</p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{tab === 'unread' ? 'No unread listing-requirement matches.' : 'Matches appear here when your listings and requirements line up.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginated.map((match) => <InboxMatchCard key={match.id} match={match} isSuperAdmin={isSuperAdmin} onRead={markRead} />)}

          {hasMore ? (
            <div className="flex justify-center pb-6 pt-2">
              <button type="button" onClick={() => setPage((prev) => prev + 1)} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-6 py-2.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]">
                Load more
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
