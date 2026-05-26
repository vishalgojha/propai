import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ZapIcon, ListingIcon, RequirementIcon, MessageCircleIcon, PlusIcon, XIcon, CheckIcon, AlertTriangleIcon } from '../lib/icons';

type TabId = 'listings' | 'requirements';
type PostMode = 'listing' | 'requirement' | null;
type DealType = 'rent' | 'sale' | 'lease';

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
const fieldClass =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)]';

const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK'];
const FURNISHING_OPTIONS = ['Unfurnished', 'Semi-Furnished', 'Fully-Furnished'];
const DEAL_OPTIONS: { value: DealType; label: string }[] = [
  { value: 'rent', label: 'Rent' },
  { value: 'sale', label: 'Sale' },
  { value: 'lease', label: 'Lease' },
];

// Inline validation helpers (no AI — pure regex/rule)
const BHK_RE = /^[1-9]\s*BHK$/i;
const PRICE_RE = /^\d{4,10}$/;

type FieldFeedback = { ok: boolean; message: string } | null;

function validateLocalityInput(value: string): FieldFeedback {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.length < 2) return null;
  // Check against known locality colloquial names (defined in mumbai-localities.ts on backend)
  // On frontend we do a simple heuristic check — the backend does authoritative validation
  const knownLocalities = [
    'bandra', 'andheri', 'juhu', 'versova', 'powai', 'vikhroli', 'ghatkopar', 'mulund',
    'thane', 'borivali', 'malad', 'goregaon', 'kandivali', 'dahisar', 'mira road', 'bhayander',
    'worli', 'lower parel', 'prabhadevi', 'dadar', 'sion', 'kurla', 'chembur', 'vashi', 'nerul',
    'kharghar', 'panvel', 'airoli', 'ghansoli', 'dombivali', 'kalyan', 'oshiwara', 'lokhandwala',
    'hiranandani', 'khar', 'santacruz', 'vile parle', 'colaba', 'nariman point', 'malabar hill',
    'marine drive', 'mahalaxmi', 'tardeo', 'wadala', 'mahim', 'shivaji park', 'byculla', 'parel',
  ];
  const matched = knownLocalities.some((l) => v.includes(l) || l.includes(v));
  if (!matched) return { ok: false, message: 'Locality not recognized — type a known Mumbai locality' };
  return { ok: true, message: 'Recognized locality' };
}

function validateBhkInput(value: string): FieldFeedback {
  if (!value) return null;
  if (!BHK_RE.test(value.trim())) return { ok: false, message: 'BHK missing — please specify 1/2/3/4/5 BHK' };
  return { ok: true, message: 'BHK looks good' };
}

function validatePriceInput(value: string, dealType: DealType, locality: string): FieldFeedback {
  const v = value.replace(/[,\s]/g, '');
  if (!v) return null;
  if (!PRICE_RE.test(v)) return { ok: false, message: 'Enter a valid numeric price (e.g. 8500000)' };
  const num = Number(v);

  // Rough sanity bands (frontend only — backend has detailed per-locality bands)
  const bands: Record<DealType, { min: number; max: number }> = {
    rent: { min: 5000, max: 500000 },
    sale: { min: 1000000, max: 300000000 },
    lease: { min: 60000, max: 6000000 },
  };
  const band = bands[dealType];
  if (num < band.min) return { ok: false, message: `Price seems low for ${dealType} — minimum typical is ₹${band.min.toLocaleString('en-IN')}` };
  if (num > band.max) return { ok: false, message: `Price seems high for ${dealType} — maximum typical is ₹${band.max.toLocaleString('en-IN')}` };

  return { ok: true, message: `Price looks reasonable for ${locality || 'this area'}` };
}

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

  // Post form state
  const [postMode, setPostMode] = useState<PostMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Form fields
  const [fLocality, setFLocality] = useState('');
  const [fBhk, setFBhk] = useState('');
  const [fDealType, setFDealType] = useState<DealType>('rent');
  const [fPrice, setFPrice] = useState('');
  const [fFurnishing, setFFurnishing] = useState('');
  const [fArea, setFArea] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fBudget, setFBudget] = useState('');

  // Inline feedback
  const [fbLocality, setFbLocality] = useState<FieldFeedback>(null);
  const [fbBhk, setFbBhk] = useState<FieldFeedback>(null);
  const [fbPrice, setFbPrice] = useState<FieldFeedback>(null);

  const plan = user?.subscription?.plan || 'Free';
  const canPost = plan === 'Starter' || plan === 'Pro';

  useEffect(() => {
    if (!user?.token) return;
    let mounted = true;

    backendApi
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

    return () => { mounted = false; };
  }, [user?.token]);

  const askPulse = (context: string) => {
    navigate(`/agent?prompt=${encodeURIComponent(context)}`);
  };

  const activeItems = tab === 'listings' ? listings : requirements;

  // Validation callbacks
  const onLocalityChange = useCallback((v: string) => {
    setFLocality(v);
    setFbLocality(validateLocalityInput(v));
  }, []);

  const onBhkChange = useCallback((v: string) => {
    setFBhk(v);
    setFbBhk(validateBhkInput(v));
  }, []);

  const onPriceChange = useCallback((v: string) => {
    setFPrice(v);
    setFbPrice(validatePriceInput(v, fDealType, fLocality));
  }, [fDealType, fLocality]);

  const resetForm = () => {
    setPostMode(null);
    setFLocality('');
    setFBhk('');
    setFDealType('rent');
    setFPrice('');
    setFFurnishing('');
    setFArea('');
    setFNotes('');
    setFBudget('');
    setFbLocality(null);
    setFbBhk(null);
    setFbPrice(null);
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitSuccess(null);

    // Final validation
    const errors: string[] = [];
    if (!fLocality.trim()) errors.push('Locality is required');
    if (!fBhk.trim()) errors.push('BHK is required');
    if (!fPrice.trim()) errors.push('Price is required');
    if (postMode === 'listing' && !fFurnishing) errors.push('Furnishing is required');

    if (errors.length > 0) {
      setSubmitError(errors.join('. '));
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        type: postMode,
        locality: fLocality.trim(),
        bhk: fBhk.trim(),
        dealType: fDealType,
        price: Number(fPrice.replace(/[,\s]/g, '')),
        notes: fNotes.trim() || undefined,
      };
      if (postMode === 'listing') {
        payload.furnishing = fFurnishing;
        payload.areaSqft = fArea ? Number(fArea) : undefined;
      } else {
        payload.budget = fBudget ? Number(fBudget.replace(/[,\s]/g, '')) : undefined;
      }

      const res = await backendApi.post('/api/vault/post', payload);
      setSubmitSuccess(res.data?.message || 'Posted successfully!');
      resetForm();

      // Refresh listings/requirements
      const refresh = await backendApi.get<{ listings: VaultListing[]; requirements: VaultRequirement[] }>('/api/vault');
      setListings(refresh.data?.listings ?? []);
      setRequirements(refresh.data?.requirements ?? []);
    } catch (err: any) {
      setSubmitError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const feedbackRow = (fb: FieldFeedback) => {
    if (!fb) return null;
    return (
      <p className={`mt-1 flex items-center gap-1 text-[11px] ${fb.ok ? 'text-[var(--accent)]' : 'text-[var(--amber)]'}`}>
        {fb.ok ? <CheckIcon className="h-3 w-3" strokeWidth={2} /> : <AlertTriangleIcon className="h-3 w-3" strokeWidth={2} />}
        {fb.message}
      </p>
    );
  };

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

      {/* Post buttons */}
      {canPost && !postMode && (
        <div className="flex gap-3">
          <button className={ghostButtonClass} onClick={() => setPostMode('listing')}>
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            Post Listing
          </button>
          <button className={ghostButtonClass} onClick={() => setPostMode('requirement')}>
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            Post Requirement
          </button>
        </div>
      )}
      {!canPost && !postMode && (
        <div className={`${panelClass} flex items-center gap-3 border-[var(--amber)]`}>
          <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--amber)]" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Upgrade to post listings</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              Starter plan (₹499/mo) lets you post up to 50 listings and 50 requirements to the global stream.
            </p>
          </div>
          <button className={accentButtonClass} onClick={() => navigate('/pricing')}>
            Upgrade
          </button>
        </div>
      )}

      {/* Post form */}
      {postMode && (
        <div className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <p className={`text-[12px] font-bold uppercase tracking-[0.06em] ${postMode === 'listing' ? 'text-[var(--accent)]' : 'text-[var(--accent)]'}`}>
              {postMode === 'listing' ? 'New Listing' : 'New Requirement'}
            </p>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={resetForm}>
              <XIcon className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Locality */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Locality *</label>
              <input
                className={`${fieldClass} mt-1`}
                placeholder="e.g. Bandra West, Powai, Thane..."
                value={fLocality}
                onChange={(e) => onLocalityChange(e.target.value)}
              />
              {feedbackRow(fbLocality)}
            </div>

            {/* BHK */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">BHK *</label>
              <select className={`${fieldClass} mt-1`} value={fBhk} onChange={(e) => onBhkChange(e.target.value)}>
                <option value="">Select BHK</option>
                {BHK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {feedbackRow(fbBhk)}
            </div>

            {/* Deal Type */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Type *</label>
              <div className="mt-1 flex gap-1 rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg)] p-1">
                {DEAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      fDealType === opt.value
                        ? 'bg-[var(--accent)] text-[#020f07]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    onClick={() => setFDealType(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                {postMode === 'requirement' ? 'Budget *' : 'Price *'}
              </label>
              <input
                className={`${fieldClass} mt-1`}
                placeholder={fDealType === 'rent' ? 'e.g. 25000' : 'e.g. 8500000'}
                value={postMode === 'requirement' ? fBudget : fPrice}
                onChange={(e) => postMode === 'requirement' ? setFBudget(e.target.value) : onPriceChange(e.target.value)}
              />
              {postMode === 'listing' && feedbackRow(fbPrice)}
            </div>

            {/* Furnishing (listing only) */}
            {postMode === 'listing' && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Furnishing *</label>
                <select className={`${fieldClass} mt-1`} value={fFurnishing} onChange={(e) => setFFurnishing(e.target.value)}>
                  <option value="">Select</option>
                  {FURNISHING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}

            {/* Area sqft (listing only) */}
            {postMode === 'listing' && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Area sqft</label>
                <input
                  className={`${fieldClass} mt-1`}
                  placeholder="e.g. 850"
                  value={fArea}
                  onChange={(e) => setFArea(e.target.value)}
                />
              </div>
            )}

            {/* Contact (auto-filled) */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Contact</label>
              <div className={`${fieldClass} mt-1 flex items-center text-[var(--text-muted)]`}>
                {user?.full_name || user?.email || 'Auto-filled from profile'}
              </div>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Notes</label>
              <textarea
                className={`${fieldClass} mt-1 min-h-[60px] resize-none`}
                placeholder="Any additional details..."
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
              />
            </div>
          </div>

          {submitError && (
            <p className="text-[12px] text-[var(--text-danger)]">{submitError}</p>
          )}
          {submitSuccess && (
            <p className="flex items-center gap-1 text-[12px] text-[var(--accent)]">
              <CheckIcon className="h-4 w-4" strokeWidth={2} />
              {submitSuccess}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button className={ghostButtonClass} onClick={resetForm}>Cancel</button>
            <button className={accentButtonClass} disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Posting...' : `Post ${postMode === 'listing' ? 'Listing' : 'Requirement'}`}
            </button>
          </div>
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
