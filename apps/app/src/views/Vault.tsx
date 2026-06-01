import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ZapIcon, ListingIcon, RequirementIcon, MessageCircleIcon, PlusIcon, AlertTriangleIcon } from '../lib/icons';

type TabId = 'listings' | 'requirements';
type VaultEntryType = 'listing' | 'requirement';

type VaultEntry = {
  id: string;
  type: VaultEntryType;
  locality: string;
  bhk: string;
  dealType: 'rent' | 'sale' | 'lease';
  price: string;
  budget: string;
  furnishing: string;
  areaSqft: string;
  notes: string;
};

type VaultListing = {
  id: string;
  structured_data: Record<string, unknown>;
  raw_text: string;
  created_at: string;
};

type VaultRequirement = {
  lead_id: string;
  name: string;
  phone: string;
  location_hint: string;
  locality_canonical: string;
  budget: string;
  raw_text: string;
  created_at: string;
};

const panelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 md:p-5';
const panelLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]';
const accentButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#020f07] shadow-[0_8px_20px_rgba(62,232,138,0.15)] transition-all duration-150 hover:-translate-y-[0.5px] hover:brightness-95';
const ghostButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';

const createVaultEntry = (type: VaultEntryType): VaultEntry => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  locality: '',
  bhk: '',
  dealType: 'rent',
  price: '',
  budget: '',
  furnishing: '',
  areaSqft: '',
  notes: '',
});

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function describeListing(item: VaultListing): string {
  const sd = item.structured_data || {};
  const parts: string[] = [];
  if (sd.bhk) parts.push(String(sd.bhk));
  if (sd.property_use) parts.push(String(sd.property_use));
  if (sd.locality || sd.location) parts.push(String(sd.locality || sd.location));
  if (sd.price_label || sd.price) parts.push(String(sd.price_label || sd.price));
  return parts.length > 0 ? parts.join(' · ') : item.raw_text?.slice(0, 80) || 'Listing';
}

function describeRequirement(item: VaultRequirement): string {
  const parts: string[] = [];
  if (item.name) parts.push(item.name);
  if (item.locality_canonical || item.location_hint) parts.push(item.locality_canonical || item.location_hint);
  if (item.budget) parts.push(item.budget);
  return parts.length > 0 ? parts.join(' · ') : item.raw_text?.slice(0, 80) || 'Requirement';
}

export const VaultView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('listings');
  const [listings, setListings] = useState<VaultListing[]>([]);
  const [requirements, setRequirements] = useState<VaultRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>(() => [createVaultEntry('listing')]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const plan = user?.subscription?.plan || 'Free';
  const isSuperAdmin = user?.appRole === 'super_admin';
  const canUseManualPosting = isSuperAdmin || plan === 'Pro';

  const loadVault = useCallback(() => {
    if (!user?.token) return Promise.resolve();
    let mounted = true;
    setLoading(true);
    setError(null);

    return backendApi
      .get<{ listings: VaultListing[]; requirements: VaultRequirement[] }>('/api/vault')
      .then((res) => {
        if (!mounted) return;
        setListings(res.data?.listings ?? []);
        setRequirements(res.data?.requirements ?? []);
      })
      .catch((err) => {
        if (mounted) setError(handleApiError(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
  }, [user?.token]);

  useEffect(() => {
    if (!user?.token) return;
    void loadVault();
  }, [loadVault, user?.token]);

  const askPulse = (context: string) => {
    navigate(`/agent?prompt=${encodeURIComponent(context)}`);
  };

  const activeItems = tab === 'listings' ? listings : requirements;

  const updateEntry = useCallback((id: string, patch: Partial<VaultEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }, []);

  const addEntry = useCallback((type: VaultEntryType) => {
    setEntries((current) => [...current, createVaultEntry(type)]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((current) => (current.length > 1 ? current.filter((entry) => entry.id !== id) : current));
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([createVaultEntry('listing')]);
    setPostError(null);
    setPostSuccess(null);
  }, []);

  const submitEntries = useCallback(async () => {
    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      locality: entry.locality.trim(),
      bhk: entry.bhk.trim(),
      furnishing: entry.furnishing.trim(),
      notes: entry.notes.trim(),
      price: entry.price.trim(),
      budget: entry.budget.trim(),
    }));

    const missing = normalizedEntries.find((entry) =>
      !entry.locality || !entry.bhk || !entry.dealType || (entry.type === 'listing' ? !entry.price : !entry.budget),
    );

    if (missing) {
      setPostError('Fill locality, BHK, deal type, and price/budget for every row before posting.');
      return;
    }

    setPosting(true);
    setPostError(null);
    setPostSuccess(null);

    try {
      const response = await backendApi.post('/api/vault/post', {
        items: normalizedEntries,
      });

      const postedCount = Number(response.data?.listings || 0) + Number(response.data?.requirements || 0);
      setPostSuccess(response.data?.message || `Saved ${postedCount} manual item(s).`);
      clearEntries();
      await loadVault();
    } catch (err) {
      setPostError(handleApiError(err));
    } finally {
      setPosting(false);
    }
  }, [clearEntries, entries, loadVault]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      {/* Ask Pulse bar */}
      <div className={panelClass}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
            <ZapIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Ask Pulse about your vault</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              Search, analyse, or match your saved records against the market.
            </p>
          </div>
          <button
            className={accentButtonClass}
            onClick={() => askPulse(tab === 'listings' ? 'Show me my listings' : 'Show me my requirements')}
          >
            <MessageCircleIcon className="h-4 w-4" strokeWidth={1.5} />
            Ask Pulse
          </button>
        </div>
      </div>

      {canUseManualPosting ? (
        <div className={`${panelClass} space-y-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <p className={panelLabelClass}>Manual posting</p>
              <h2 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                Post multiple listings and requirements in one batch.
              </h2>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                Use this when you do not want to scan WhatsApp groups. Add as many rows as needed, then post them to the vault and shared stream in one go.
              </p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Starter / 499 is scan-only. Manual posting opens on the 1499 / 1999 paid plans and owner accounts.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={ghostButtonClass} onClick={() => addEntry('listing')}>
                <PlusIcon className="h-4 w-4" strokeWidth={2} />
                Add listing
              </button>
              <button className={ghostButtonClass} onClick={() => addEntry('requirement')}>
                <PlusIcon className="h-4 w-4" strokeWidth={2} />
                Add requirement
              </button>
            </div>
          </div>

          {postError ? (
            <div className="rounded-[14px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-200">
              {postError}
            </div>
          ) : null}

          {postSuccess ? (
            <div className="rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--accent)]">
              {postSuccess}
            </div>
          ) : null}

          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div key={entry.id} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Row {index + 1}
                    </p>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                      {entry.type === 'listing' ? 'Listing' : 'Requirement'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    disabled={entries.length === 1}
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Type</span>
                    <select
                      value={entry.type}
                      onChange={(event) => updateEntry(entry.id, { type: event.target.value as VaultEntryType })}
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                    >
                      <option value="listing">Listing</option>
                      <option value="requirement">Requirement</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Locality</span>
                    <input
                      type="text"
                      value={entry.locality}
                      onChange={(event) => updateEntry(entry.id, { locality: event.target.value })}
                      placeholder="Bandra West"
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">BHK</span>
                    <input
                      type="text"
                      value={entry.bhk}
                      onChange={(event) => updateEntry(entry.id, { bhk: event.target.value })}
                      placeholder="2 BHK"
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Deal type</span>
                    <select
                      value={entry.dealType}
                      onChange={(event) => updateEntry(entry.id, { dealType: event.target.value as VaultEntry['dealType'] })}
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                    >
                      <option value="rent">Rent</option>
                      <option value="sale">Sale</option>
                      <option value="lease">Lease</option>
                    </select>
                  </label>
                  {entry.type === 'listing' ? (
                    <>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Price</span>
                        <input
                          type="text"
                          value={entry.price}
                          onChange={(event) => updateEntry(entry.id, { price: event.target.value })}
                          placeholder="2.8 Cr"
                          className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Area (sqft)</span>
                        <input
                          type="text"
                          value={entry.areaSqft}
                          onChange={(event) => updateEntry(entry.id, { areaSqft: event.target.value })}
                          placeholder="580"
                          className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Furnishing</span>
                        <input
                          type="text"
                          value={entry.furnishing}
                          onChange={(event) => updateEntry(entry.id, { furnishing: event.target.value })}
                          placeholder="Semi-furnished"
                          className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                        />
                      </label>
                      <div />
                    </>
                  ) : (
                    <>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Budget</span>
                        <input
                          type="text"
                          value={entry.budget}
                          onChange={(event) => updateEntry(entry.id, { budget: event.target.value })}
                          placeholder="2.5 Cr"
                          className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                        />
                      </label>
                      <div />
                    </>
                  )}
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Notes</span>
                    <textarea
                      value={entry.notes}
                      onChange={(event) => updateEntry(entry.id, { notes: event.target.value })}
                      placeholder="Extra details, parking, OC, building name, caller note..."
                      rows={3}
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-[11px] text-[var(--text-muted)]">
              Batch posting saves every listing and requirement to Vault in one submission.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ghostButtonClass} onClick={clearEntries}>
                Clear all
              </button>
              <button
                type="button"
                className={accentButtonClass}
                onClick={() => void submitEntries()}
                disabled={posting}
              >
                {posting ? 'Posting...' : 'Post batch'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${panelClass} flex items-center gap-3 border-[var(--amber)]`}>
          <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--amber)]" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Manual Vault posting unavailable</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              Starter / 499 is scan-only. Upgrade to a paid posting plan to batch post listings and requirements from Vault.
            </p>
          </div>
          <button className={accentButtonClass} onClick={() => navigate('/pricing')}>
            Upgrade
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-1">
        <button
          className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[12px] font-semibold transition-all duration-150 ${
            tab === 'listings'
              ? 'bg-[var(--accent)] text-[#020f07] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setTab('listings')}
        >
          <ListingIcon className="h-4 w-4" strokeWidth={1.5} />
          My Listings
          {listings.length > 0 && (
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tab === 'listings' ? 'bg-black/10' : 'bg-[var(--bg-hover)]'}`}>
              {listings.length}
            </span>
          )}
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[12px] font-semibold transition-all duration-150 ${
            tab === 'requirements'
              ? 'bg-[var(--accent)] text-[#020f07] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setTab('requirements')}
        >
          <RequirementIcon className="h-4 w-4" strokeWidth={1.5} />
          My Requirements
          {requirements.length > 0 && (
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tab === 'requirements' ? 'bg-black/10' : 'bg-[var(--bg-hover)]'}`}>
              {requirements.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : error ? (
        <div className={`${panelClass} text-center`}>
          <p className="text-[13px] text-[var(--text-danger)]">{error}</p>
        </div>
      ) : activeItems.length === 0 ? (
        <div className={`${panelClass} py-16 text-center`}>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {tab === 'listings' ? 'No saved listings yet.' : 'No saved requirements yet.'}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {tab === 'listings'
              ? 'Listings you save or create through Pulse will appear here.'
              : 'Buyer requirements you capture through Pulse will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {activeItems.map((item) => (
            <div
              key={(item as VaultListing).id || (item as VaultRequirement).lead_id}
              className={`${panelClass} flex items-start gap-3 transition-all duration-150 hover:border-[color:var(--border-strong)]`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border)] bg-[var(--bg)] text-[var(--text-muted)]">
                {tab === 'listings' ? <ListingIcon className="h-4 w-4" strokeWidth={1.5} /> : <RequirementIcon className="h-4 w-4" strokeWidth={1.5} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {tab === 'listings' ? describeListing(item as VaultListing) : describeRequirement(item as VaultRequirement)}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{formatDate((item as any).created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Ask Pulse */}
      {!loading && activeItems.length > 0 && (
        <div className="flex justify-center pt-2">
          <button className={accentButtonClass} onClick={() => askPulse(tab === 'listings' ? `Analyse my ${listings.length} saved listings — which ones need attention?` : `Match my ${requirements.length} buyer requirements against available inventory`)}>
            <ZapIcon className="h-4 w-4" strokeWidth={1.5} />
            Ask Pulse about {tab === 'listings' ? 'my listings' : 'my requirements'}
          </button>
        </div>
      )}
    </div>
  );
};
