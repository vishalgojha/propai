import React from 'react';
import {
  BadgeIndianRupee,
  Building2,
  Check,
  Clock,
  Copy,
  Hash,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation, useNavigate, useSearchParams } from '../lib/router';
import backendApi, { handleApiError } from '../services/api';
import { fetchBrokerContactOverlaps, fetchBrokerContacts, type BrokerContact, type BrokerContactOverlap } from '../services/brokerContactApi';
import {
  acceptSyndicationInvite,
  createSyndicationInvite,
  listSyndicationPartners,
  revokeSyndication,
  type SyndicationPartner,
} from '../services/syndicationApi';
import { ENDPOINTS } from '../services/endpoints';

type BrokerNetworkView = 'contacts' | 'overlaps' | 'partners';

const brokerNetworkPathForView = (view: BrokerNetworkView) => `/broker-network/${view}`;

const brokerNetworkViewFromPath = (pathname: string): BrokerNetworkView => {
  if (pathname.endsWith('/partners')) return 'partners';
  if (pathname.endsWith('/overlaps')) return 'overlaps';
  return 'contacts';
};

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return '—';
};

const getBrokerLabel = (contact: { display_name: string | null; phone: string }): string => {
  if (contact.display_name) return contact.display_name;
  const formattedPhone = formatPhone(contact.phone);
  return formattedPhone === '—' ? 'Broker' : formattedPhone;
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

const normalizePhoneDigits = (value: string): string => value.replace(/\D/g, '');

const isLikelyIndianPhone = (value: string): boolean => {
  const digits = normalizePhoneDigits(value);
  return /^[6-9]\d{9}$/.test(digits) || /^91[6-9]\d{9}$/.test(digits);
};

const buildBrokerWhatsAppLink = (phone: string): string | null => {
  if (!isLikelyIndianPhone(phone)) return null;
  const digits = normalizePhoneDigits(phone);
  const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  const message = 'Hi, I found your number on PropAI and wanted to connect.';
  return `https://wa.me/91${normalized}?text=${encodeURIComponent(message)}`;
};

const extractToken = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get('token')?.trim() || trimmed;
  } catch {
    return trimmed;
  }
};

function resolveActiveSessionLabel(data: any): string | null {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const preferredLabel = String(data?.selectedSessionLabel || data?.preferredOutboundSessionLabel || '').trim();

  if (preferredLabel) {
    return preferredLabel;
  }

  const activeSession =
    sessions.find((session: any) => String(session?.status || '') === 'connected')
    || sessions.find((session: any) => String(session?.status || '') === 'connecting')
    || sessions.find((session: any) => String(session?.status || '') === 'reconnecting')
    || sessions[0]
    || null;

  return String(activeSession?.label || '').trim() || null;
}

export const BrokerNetwork: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = React.useState<BrokerContact[]>([]);
  const [overlaps, setOverlaps] = React.useState<BrokerContactOverlap[]>([]);
  const [sessionLabel, setSessionLabel] = React.useState<string | null>(null);
  const initialView = brokerNetworkViewFromPath(location.pathname);
  const [activeView, setActiveView] = React.useState<BrokerNetworkView>(initialView);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [partners, setPartners] = React.useState<SyndicationPartner[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = React.useState(false);
  const [partnerError, setPartnerError] = React.useState<string | null>(null);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = React.useState(false);
  const [acceptToken, setAcceptToken] = React.useState('');
  const [acceptResult, setAcceptResult] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setContacts([]);
    setOverlaps([]);
    try {
      let activeSessionLabel: string | null = null;

      try {
        const statusResponse = await backendApi.get(ENDPOINTS.whatsapp.status);
        activeSessionLabel = resolveActiveSessionLabel(statusResponse.data);
      } catch {
        activeSessionLabel = null;
      }

      setSessionLabel(activeSessionLabel);

      const [contactResult, overlapResult] = await Promise.allSettled([
        fetchBrokerContacts({ sessionLabel: activeSessionLabel }),
        fetchBrokerContactOverlaps({ sessionLabel: activeSessionLabel }),
      ]);

      if (contactResult.status === 'fulfilled') {
        setContacts(contactResult.value);
      }

      if (overlapResult.status === 'fulfilled') {
        setOverlaps(overlapResult.value);
      }

      const loadErrors = [contactResult, overlapResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => handleApiError(result.reason));

      if (loadErrors.length > 0) {
        setError(loadErrors[0]);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadPartners = React.useCallback(async () => {
    setIsLoadingPartners(true);
    setPartnerError(null);
    try {
      const data = await listSyndicationPartners();
      setPartners([...data.outgoing, ...data.incoming]);
    } catch (err) {
      setPartnerError(handleApiError(err));
    } finally {
      setIsLoadingPartners(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  React.useEffect(() => {
    setActiveView(brokerNetworkViewFromPath(location.pathname));

    const token = searchParams.get('token');
    if (token) {
      setAcceptToken(token);
      setActiveView('partners');
    }
  }, [location.pathname, searchParams]);

  const selectView = React.useCallback((view: BrokerNetworkView) => {
    setActiveView(view);
    const nextSearch = searchParams.toString();
    const nextUrl = nextSearch ? `${brokerNetworkPathForView(view)}?${nextSearch}` : brokerNetworkPathForView(view);
    navigate(nextUrl);
  }, [navigate, searchParams]);

  const handleCreateInvite = React.useCallback(async () => {
    setPartnerError(null);
    setInviteLink(null);
    try {
      const result = await createSyndicationInvite(['rent', 'sale']);
      setInviteLink(result.inviteLink);
      await loadPartners();
    } catch (err) {
      setPartnerError(handleApiError(err));
    }
  }, [loadPartners]);

  const handleAcceptInvite = React.useCallback(async () => {
    const token = extractToken(acceptToken);
    if (!token) return;

    setPartnerError(null);
    setAcceptResult(null);
    try {
      const result = await acceptSyndicationInvite(token);
      setAcceptResult(`Connected with ${result.partnerName}`);
      setAcceptToken('');
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('token');
        return next;
      }, { replace: true });
      navigate('/broker-network/partners', { replace: true });
      await loadPartners();
    } catch (err) {
      setPartnerError(handleApiError(err));
    }
  }, [acceptToken, loadPartners, navigate, setSearchParams]);

  const handleRevoke = React.useCallback(async (id: string) => {
    setPartnerError(null);
    try {
      await revokeSyndication(id);
      await loadPartners();
    } catch (err) {
      setPartnerError(handleApiError(err));
    }
  }, [loadPartners]);

  const copyInviteLink = React.useCallback(() => {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 2000);
  }, [inviteLink]);

  const totalListings = contacts.reduce((sum, c) => sum + c.listing_count, 0);
  const overlappingGroupLinks = overlaps.reduce((sum, contact) => sum + contact.group_count, 0);
  const activePartners = partners.filter((partner) => partner.status === 'active').length;
  const pendingPartners = partners.filter((partner) => partner.status === 'pending').length;

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
              Brokers extracted from WhatsApp group broadcasts and participant lists across all broker workspaces — {contacts.length} unique contact{contacts.length === 1 ? '' : 's'}, {overlaps.length} overlapping contact{overlaps.length === 1 ? '' : 's'}, {totalListings} listing{totalListings === 1 ? '' : 's'} parsed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => activeView === 'partners' ? void loadPartners() : void load()}
            disabled={activeView === 'partners' ? isLoadingPartners : isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', (activeView === 'partners' ? isLoadingPartners : isLoading) && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-[18px] border border-[color:rgba(62,232,138,0.18)] bg-[rgba(62,232,138,0.06)] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
          Broker contact data is shown for legitimate brokerage outreach only. If you want a number or group reviewed for removal, email <a className="font-semibold text-[var(--accent)] hover:underline" href="mailto:support@propai.live">support@propai.live</a>.
          Please review the <Link className="font-semibold text-[var(--accent)] hover:underline" to="/terms">Terms &amp; Conditions</Link> before using this workspace.
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
            data-action="broker-network-tab-contacts"
            onClick={() => selectView('contacts')}
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
            data-action="broker-network-tab-overlaps"
            onClick={() => selectView('overlaps')}
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
          <button
            type="button"
            data-action="broker-network-tab-partners"
            onClick={() => selectView('partners')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors md:flex-none',
              activeView === 'partners'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Partners
          </button>
        </div>
        {activeView === 'overlaps' ? (
          <div className="text-[12px] text-[var(--text-secondary)]">
            {overlaps.length} contact{overlaps.length === 1 ? '' : 's'} across {overlappingGroupLinks} group membership link{overlappingGroupLinks === 1 ? '' : 's'}
          </div>
        ) : activeView === 'partners' ? (
          <div className="text-[12px] text-[var(--text-secondary)]">
            {activePartners} active partner{activePartners === 1 ? '' : 's'}
            {pendingPartners > 0 ? `, ${pendingPartners} pending` : ''}
          </div>
        ) : null}
      </div>

      {activeView !== 'partners' && isLoading ? (
        <div className="flex items-center justify-center gap-3 px-5 py-20 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading broker contacts...
        </div>
      ) : activeView === 'partners' ? (
        <div className="space-y-4">
          {partnerError ? (
            <div className="rounded-[16px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {partnerError}
            </div>
          ) : null}

          {acceptResult ? (
            <div className="rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]">
              {acceptResult}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Invite a partner</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Generate a private link for a trusted broker. Active partners can pull your shared listing feed.</p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-all hover:brightness-95"
                >
                  <LinkIcon className="h-4 w-4" />
                  Generate
                </button>
              </div>

              {inviteLink ? (
                <div className="mt-4 rounded-[12px] border border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.06)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">Share invite</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-primary)]">
                      {inviteLink}
                    </code>
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] font-bold text-[var(--accent)] transition-all hover:bg-[var(--bg-hover)]"
                    >
                      {inviteCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {inviteCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Accept a partner invite</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Paste a full invite link or token from another broker workspace.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={acceptToken}
                  onChange={(event) => setAcceptToken(event.target.value)}
                  placeholder="Paste token or invite link"
                  className="min-w-0 flex-1 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
                <button
                  type="button"
                  onClick={handleAcceptInvite}
                  disabled={!extractToken(acceptToken)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-all hover:brightness-95 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                  Accept
                </button>
              </div>
            </div>
          </div>

          {isLoadingPartners ? (
            <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading syndication partners...
            </div>
          ) : partners.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-16 text-center text-sm text-[var(--text-secondary)]">
              <ShieldCheck className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No syndication partners yet. Invite a trusted broker or accept an invite to start sharing listings.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      <th className="px-5 py-4">Partner</th>
                      <th className="px-5 py-4">Direction</th>
                      <th className="px-5 py-4">Scope</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Connected</th>
                      <th className="px-5 py-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((partner, index) => (
                      <tr
                        key={partner.id}
                        className={cn(
                          'border-b border-white/[0.02] transition-colors hover:bg-[var(--bg-elevated)]',
                          index === partners.length - 1 && 'border-b-0',
                        )}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[13px] font-bold text-[var(--accent)]">
                              {(partner.partnerName || 'P')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--text-primary)]">{partner.partnerName || 'Partner'}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{partner.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-[var(--text-secondary)]">
                            {partner.direction === 'outgoing' ? 'You invited them' : 'They invited you'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {partner.scope.map((scope) => (
                              <span key={scope} className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                                {scope}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn(
                            'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                            partner.status === 'active'
                              ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                              : partner.status === 'pending'
                                ? 'border-[color:rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] text-[var(--amber)]'
                                : 'border-red-500/30 bg-red-500/10 text-red-300',
                          )}>
                            {partner.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[12px] text-[var(--text-secondary)]">
                            {formatDate(partner.acceptedAt || partner.createdAt)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {partner.status !== 'revoked' ? (
                            <button
                              type="button"
                              onClick={() => void handleRevoke(partner.id)}
                              className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-300 transition-all hover:bg-red-500 hover:text-black"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                          {getBrokerLabel(contact)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {getBrokerLabel(contact)}
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
                      <a
                        href={buildBrokerWhatsAppLink(contact.phone) || undefined}
                        target={buildBrokerWhatsAppLink(contact.phone) ? '_blank' : undefined}
                        rel={buildBrokerWhatsAppLink(contact.phone) ? 'noreferrer' : undefined}
                        className={cn(
                          'inline-flex items-center gap-1 text-[13px] transition-colors',
                          buildBrokerWhatsAppLink(contact.phone)
                            ? 'text-[var(--accent)] hover:underline'
                            : 'text-[var(--text-secondary)] pointer-events-none',
                        )}
                      >
                        <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        {formatPhone(contact.phone)}
                      </a>
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
                          {getBrokerLabel(contact)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {getBrokerLabel(contact)}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                            <Phone className="h-3 w-3" />
                            {formatPhone(contact.phone)}
                          </p>
                          <a
                            href={buildBrokerWhatsAppLink(contact.phone) || undefined}
                            target={buildBrokerWhatsAppLink(contact.phone) ? '_blank' : undefined}
                            rel={buildBrokerWhatsAppLink(contact.phone) ? 'noreferrer' : undefined}
                            className={cn(
                              'mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors',
                              buildBrokerWhatsAppLink(contact.phone)
                                ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)] hover:brightness-110'
                                : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] pointer-events-none',
                            )}
                          >
                            Connect on WhatsApp
                          </a>
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
