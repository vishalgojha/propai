import React from 'react';
import { Loader2, RefreshCw, Phone, MapPin, Hash, BadgeIndianRupee, Clock, Building2, UserRound, UsersRound } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchBrokerContactOverlaps, fetchBrokerContacts, type BrokerContact, type BrokerContactOverlap } from '../services/brokerContactApi';
import { handleApiError } from '../services/api';

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
};

const formatPrice = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const BrokerNetwork: React.FC = () => {
  const [contacts, setContacts] = React.useState<BrokerContact[]>([]);
  const [overlaps, setOverlaps] = React.useState<BrokerContactOverlap[]>([]);
  const [activeView, setActiveView] = React.useState<'contacts' | 'overlaps'>('contacts');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [contactData, overlapData] = await Promise.all([
        fetchBrokerContacts(),
        fetchBrokerContactOverlaps(),
      ]);
      setContacts(contactData);
      setOverlaps(overlapData);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totalListings = contacts.reduce((sum, c) => sum + c.listing_count, 0);
  const overlappingGroupLinks = overlaps.reduce((sum, contact) => sum + contact.group_count, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <UserRound className="h-3.5 w-3.5" />
              Broker network
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
              Your broker network
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Brokers extracted from WhatsApp group broadcasts and participant lists — {contacts.length} contact{contacts.length === 1 ? '' : 's'}, {overlaps.length} overlapping contact{overlaps.length === 1 ? '' : 's'}, {totalListings} listing{totalListings === 1 ? '' : 's'} parsed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[16px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex w-full rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-1 md:w-auto">
          <button
            type="button"
            onClick={() => setActiveView('contacts')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors md:flex-none',
              activeView === 'contacts'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <UserRound className="h-4 w-4" />
            All contacts
          </button>
          <button
            type="button"
            onClick={() => setActiveView('overlaps')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors md:flex-none',
              activeView === 'overlaps'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <UsersRound className="h-4 w-4" />
            Overlaps
          </button>
        </div>
        {activeView === 'overlaps' ? (
          <div className="text-[12px] text-[var(--text-secondary)]">
            {overlaps.length} contact{overlaps.length === 1 ? '' : 's'} across {overlappingGroupLinks} group membership link{overlappingGroupLinks === 1 ? '' : 's'}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 px-5 py-20 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading broker contacts...
        </div>
      ) : activeView === 'contacts' && contacts.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-16 text-center text-sm text-[var(--text-secondary)]">
          <UserRound className="mx-auto h-8 w-8 mb-3 opacity-40" />
          No broker contacts yet. They will appear as WhatsApp group messages are parsed.
        </div>
      ) : activeView === 'contacts' ? (
        <div className="overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <th className="px-5 py-4">Broker</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Areas</th>
                  <th className="px-5 py-4">BHK</th>
                  <th className="px-5 py-4">Price range</th>
                  <th className="px-5 py-4">Listings</th>
                  <th className="px-5 py-4">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, index) => (
                  <tr
                    key={contact.id}
                    className={cn(
                      'border-b border-white/[0.02] transition-colors hover:bg-[var(--bg-elevated)]',
                      index === contacts.length - 1 && 'border-b-0',
                    )}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[13px] font-bold text-[var(--accent)]">
                          {(contact.display_name || contact.phone)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {contact.display_name || formatPhone(contact.phone)}
                          </p>
                          {contact.source_groups.length > 0 ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                              <Building2 className="h-3 w-3" />
                              {contact.source_groups.length} group{contact.source_groups.length === 1 ? '' : 's'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-[13px] text-[var(--text-secondary)]">
                        <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        {formatPhone(contact.phone)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {contact.inferred_areas.length > 0 ? (
                          contact.inferred_areas.slice(0, 3).map((area) => (
                            <span
                              key={area}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                            >
                              <MapPin className="h-3 w-3" />
                              {area}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)]">—</span>
                        )}
                        {contact.inferred_areas.length > 3 ? (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            +{contact.inferred_areas.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {contact.asset_types.length > 0 ? (
                          contact.asset_types.slice(0, 3).map((asset) => (
                            <span
                              key={asset}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                            >
                              <Hash className="h-3 w-3" />
                              {asset}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)]">—</span>
                        )}
                        {contact.asset_types.length > 3 ? (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            +{contact.asset_types.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {contact.price_range_low || contact.price_range_high ? (
                        <span className="inline-flex items-center gap-1 text-[13px] text-[var(--text-secondary)]">
                          <BadgeIndianRupee className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                          {formatPrice(contact.price_range_low)}
                          {contact.price_range_low !== contact.price_range_high ? (
                            <> — {formatPrice(contact.price_range_high)}</>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                        {contact.listing_count}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                        {formatDate(contact.last_seen_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : overlaps.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-16 text-center text-sm text-[var(--text-secondary)]">
          <UsersRound className="mx-auto mb-3 h-8 w-8 opacity-40" />
          No overlapping contacts yet. They will appear once the same number is seen in two or more synced groups.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Shared groups</th>
                  <th className="px-5 py-4">Areas</th>
                  <th className="px-5 py-4">BHK</th>
                  <th className="px-5 py-4">Listings</th>
                  <th className="px-5 py-4">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {overlaps.map((contact, index) => (
                  <tr
                    key={contact.id}
                    className={cn(
                      'border-b border-white/[0.02] transition-colors hover:bg-[var(--bg-elevated)]',
                      index === overlaps.length - 1 && 'border-b-0',
                    )}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[13px] font-bold text-[var(--accent)]">
                          {(contact.display_name || contact.phone)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {contact.display_name || formatPhone(contact.phone)}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                            <Phone className="h-3 w-3" />
                            {formatPhone(contact.phone)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 min-w-[260px]">
                      <div className="flex flex-col gap-1.5">
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                          <UsersRound className="h-3 w-3" />
                          {contact.group_count} groups
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {contact.source_groups.slice(0, 4).map((group) => (
                            <span
                              key={group.id}
                              className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                              title={group.name}
                            >
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{group.name}</span>
                            </span>
                          ))}
                          {contact.source_groups.length > 4 ? (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              +{contact.source_groups.length - 4}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {contact.inferred_areas.length > 0 ? (
                          contact.inferred_areas.slice(0, 3).map((area) => (
                            <span
                              key={area}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                            >
                              <MapPin className="h-3 w-3" />
                              {area}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {contact.asset_types.length > 0 ? (
                          contact.asset_types.slice(0, 3).map((asset) => (
                            <span
                              key={asset}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                            >
                              <Hash className="h-3 w-3" />
                              {asset}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                        {contact.listing_count}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                        {formatDate(contact.last_seen_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
