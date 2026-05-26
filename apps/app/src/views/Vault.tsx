import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ZapIcon, ListingIcon, RequirementIcon, MessageCircleIcon, PlusIcon, XIcon, AlertTriangleIcon } from '../lib/icons';

type TabId = 'listings' | 'requirements';
type IntakeMode = 'listing' | 'requirement';

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

const LISTING_SCHEMA = [
  { field: 'location', question: 'What location should we extract?', hint: 'Use the locality or area from the message.' },
  { field: 'bhk', question: 'What BHK should we extract?', hint: 'Example: 1 BHK, 2 BHK, 3 BHK.' },
  { field: 'price', question: 'What price should we extract?', hint: 'Use the final numeric asking price.' },
  { field: 'carpet_area', question: 'What carpet area should we extract?', hint: 'Optional if not mentioned.' },
  { field: 'furnishing', question: 'What furnishing should we extract?', hint: 'Unfurnished, semi-furnished, or fully-furnished.' },
  { field: 'possession_date', question: 'What possession date should we extract?', hint: 'Optional if not mentioned.' },
  { field: 'contact_number', question: 'What contact number should we extract?', hint: 'Use the broker or owner phone if present.' },
];

const REQUIREMENT_SCHEMA = [
  { field: 'location_pref', question: 'What location preference should we extract?', hint: 'Use the buyer’s target locality or area.' },
  { field: 'budget', question: 'What budget should we extract?', hint: 'Use the maximum budget or target range.' },
  { field: 'timeline', question: 'What timeline should we extract?', hint: 'Example: immediate, this month, next month.' },
  { field: 'possession', question: 'What possession requirement should we extract?', hint: 'Example: ready, within 30 days, flexible.' },
  { field: 'contact_number', question: 'What contact number should we extract?', hint: 'Use the buyer phone if present.' },
];

export const VaultView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('listings');
  const [listings, setListings] = useState<VaultListing[]>([]);
  const [requirements, setRequirements] = useState<VaultRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode | null>(null);

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

  const startIntake = useCallback((mode: IntakeMode) => {
    setIntakeMode(mode);
    const schema = mode === 'listing' ? LISTING_SCHEMA : REQUIREMENT_SCHEMA;
    const prompt = [
      `Start a new ${mode} intake.`,
      `Use the parser schema fields exactly in this order: ${schema.map((item) => item.field).join(', ')}.`,
      'Ask exactly one question at a time, wait for the answer, and never render a form.',
      ...schema.map((item, index) => `${index + 1}. [${item.field}] ${item.question} (${item.hint})`),
      'Keep the interaction deterministic and schema-driven.',
    ].join(' ');
    askPulse(prompt);
  }, []);

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
      {canPost && !intakeMode && (
        <div className="flex gap-3">
          <button className={ghostButtonClass} onClick={() => startIntake('listing')}>
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            Open Listing Intake
          </button>
          <button className={ghostButtonClass} onClick={() => startIntake('requirement')}>
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            Open Requirement Intake
          </button>
        </div>
      )}
      {!canPost && !intakeMode && (
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

      {intakeMode && (
        <div className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent)]">
              {intakeMode === 'listing' ? 'Listing Parser Schema' : 'Requirement Parser Schema'}
            </p>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={() => setIntakeMode(null)}>
              <XIcon className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-[12px] text-[var(--text-secondary)]">
              Pulse will ask these parser-schema questions one at a time, in this exact order.
            </p>
            <div className="grid gap-3">
              {(intakeMode === 'listing' ? LISTING_SCHEMA : REQUIREMENT_SCHEMA).map((item, index) => (
                <div key={item.field} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Question {index + 1}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">{item.question}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              This keeps intake deterministic and aligned with the backend parser schema.
            </p>
            <button className={accentButtonClass} onClick={() => startIntake(intakeMode)}>
              <MessageCircleIcon className="h-4 w-4" strokeWidth={1.5} />
              Start schema flow
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
