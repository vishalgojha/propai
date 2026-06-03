import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ZapIcon, ListingIcon, RequirementIcon, MessageCircleIcon, AlertTriangleIcon } from '../lib/icons';
import { splitMultiListing } from '../lib/vaultSplitter';

type TabId = 'listings' | 'requirements';
type VaultEntryType = 'listing' | 'requirement';

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

type VaultDraftPreview = {
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
  rawText: string;
  missing: string[];
  sourceHint: string;
};

const panelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 md:p-5';
const panelLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]';
const accentButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#020f07] shadow-[0_8px_20px_rgba(62,232,138,0.15)] transition-all duration-150 hover:-translate-y-[0.5px] hover:brightness-95';
const ghostButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';

const FREEFORM_INPUT_HINT = `Paste broker text here. One listing or requirement per block is fine.

Example:
2 bhk for sale in DLH Mamta
580 carpet
Price 2.30 cr
1 car parking
With OC

Need 3 bhk on rent in Bandra West
Budget 2.5 lakh`;

const BROKER_DECORATION_PATTERN = /[\p{Extended_Pictographic}\u200d\uFE0F]/gu;
const BROKER_SYMBOL_PATTERN = /[•·▪▫◆◇★☆⬤◉○●⬛⬜◼◻⬢⬡⬆⬇⬅➡↔↕]/gu;
const normalizeDraftText = (value: string) =>
  String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .normalize('NFKC');

const stripBrokerDecorations = (value: string) =>
  normalizeDraftText(value)
    .replace(BROKER_DECORATION_PATTERN, ' ')
    .replace(BROKER_SYMBOL_PATTERN, ' ')
    .replace(/[|]{2,}/g, ' ')
    .replace(/[<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanDraftLines = (value: string) =>
  normalizeDraftText(value)
    .split('\n')
    .map((line) => stripBrokerDecorations(line).trim())
    .filter(Boolean)
    .filter((line) => {
      const lowered = line.toLowerCase();
      if (lowered.startsWith('forwarded')) return false;
      if (lowered.startsWith('>')) return false;
      if (lowered.startsWith('sent from')) return false;
      if (lowered.startsWith('from:')) return false;
      if (/^(regards|thanks|thank you|cheers|warm regards|kind regards|best)\b/i.test(lowered)) return false;
      return /[\p{L}\p{N}]/u.test(line);
    });

const inferDealType = (text: string): VaultDraftPreview['dealType'] => {
  const lowered = text.toLowerCase();
  if (/\b(lease|leasable|leave and license|leave & license|l&l|ll)\b/i.test(lowered)) return 'lease';
  if (/\b(sale|sell|outright|buy)\b/i.test(lowered)) return 'sale';
  return 'rent';
};

const inferType = (text: string): VaultEntryType => {
  const lowered = text.toLowerCase();
  if (/\b(requirement|requirement|need|wanted|looking for|wanted|searching|client wants|want)\b/i.test(lowered)) {
    return 'requirement';
  }
  return 'listing';
};

const inferBhk = (text: string) => {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*bhk\b|\b(\d+(?:\.\d+)?)bhk\b/i);
  return match?.[1] || match?.[2] ? `${match[1] || match[2]} BHK` : '';
};

const inferAreaSqft = (text: string) => {
  const match = text.match(/\b(\d{2,5}(?:,\d{3})?(?:\.\d+)?)\s*(?:sq\s*ft|sqft|sft|sf|carpet|carpet area)\b/i);
  return match ? String(Number(match[1].replace(/,/g, ''))) : '';
};

const inferPriceOrBudget = (text: string, dealType: VaultDraftPreview['dealType']) => {
  const lines = cleanDraftLines(text);
  const candidateLines = lines.length > 0 ? lines : [String(text || '')];
  const prioritizedPatterns = [
    /(?:price|budget|deposit|rent|lease|sale|asking|offer|quote)\b[^0-9₹]*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/i,
    /(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/i,
  ];

  let match: RegExpMatchArray | null = null;
  for (const line of candidateLines) {
    const lowered = line.toLowerCase();
    const isPriceLike = /\b(price|budget|deposit|rent|lease|sale|asking|offer|quote|amount|token|renting)\b/i.test(lowered)
      || /(?:₹|rs\.?|inr)/i.test(lowered)
      || /\b(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/i.test(lowered);
    if (!isPriceLike) {
      continue;
    }

    for (const pattern of prioritizedPatterns) {
      const candidate = line.match(pattern);
      if (candidate) {
        match = candidate;
        break;
      }
    }

    if (match) {
      break;
    }
  }

  if (!match) {
    return '';
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return '';

  const unit = String(match[2] || '').toLowerCase();
  let numeric = amount;
  if (unit === 'cr' || unit === 'crore' || unit === 'crores') numeric = amount * 10000000;
  else if (unit === 'lakh' || unit === 'lakhs' || unit === 'lac' || unit === 'lacs' || unit === 'l') numeric = amount * 100000;
  else if (unit === 'k' || unit === 'thousand') numeric = amount * 1000;

  if (numeric >= 10000000) {
    return `₹${(numeric / 10000000).toFixed(2).replace(/\.00$/, '')} Cr${dealType === 'rent' ? '/mo' : ''}`;
  }
  if (numeric >= 100000) {
    return `₹${(numeric / 100000).toFixed(1).replace(/\.0$/, '')} Lakh${dealType === 'rent' ? '/mo' : ''}`;
  }
  if (numeric >= 1000) {
    return `₹${Math.round(numeric / 1000)}k${dealType === 'rent' ? '/mo' : ''}`;
  }
  return `₹${Math.round(numeric).toLocaleString('en-IN')}${dealType === 'rent' ? '/mo' : ''}`;
};

const inferFurnishing = (text: string) => {
  const lowered = text.toLowerCase();
  if (/\bfully[-\s]?furnished\b/i.test(lowered)) return 'Fully furnished';
  if (/\bsemi[-\s]?furnished\b/i.test(lowered)) return 'Semi-furnished';
  if (/\bunfurnished\b/i.test(lowered)) return 'Unfurnished';
  if (/\bbare shell\b/i.test(lowered)) return 'Bareshell';
  return '';
};

const inferLocality = (text: string) => {
  const lines = cleanDraftLines(text);
  const firstLine = lines[0] || '';
  const tailMatch = firstLine.match(/\b(?:in|at|near|opp(?:osite)?|beside|adj(?:acent)?\s+to)\b\s+(.+)$/i);
  const candidateSource = tailMatch?.[1] || firstLine;
  const candidate = candidateSource
    .replace(/^[\-•\d.)\s]+/, '')
    .replace(/\b(?:for rent|for sale|for lease|rent|sale|lease|requirement|require|wanted|looking for|need|available)\b/ig, ' ')
    .replace(/\b(\d+(?:\.\d+)?\s*bhk)\b/ig, ' ')
    .replace(/\b(\d{2,5}(?:,\d{3})?(?:\.\d+)?\s*(?:sq\s*ft|sqft|sft|sf|carpet|carpet area))\b/ig, ' ')
    .replace(/\b(price|budget|deposit)\b.*$/i, ' ')
    .replace(/\b(on|in|at)\b\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate || candidate.length < 3) return '';

  const cleaned = candidate
    .replace(/^[^a-zA-Z0-9]+/, '')
    .replace(/[.,;:]+$/, '')
    .trim();

  if (!cleaned || cleaned.length < 3) return '';
  if (/^(need|wanted|looking|client|available|flat|office|shop|warehouse|sale|rent|lease)$/i.test(cleaned)) return '';
  return cleaned;
};

const summarizePreviewStatus = (item: VaultDraftPreview) => {
  if (item.missing.length > 0) {
    return `Missing ${item.missing.join(', ')}.`;
  }

  const found = [
    item.locality ? 'locality' : '',
    item.bhk ? 'BHK' : '',
    item.type === 'listing' ? (item.price ? 'price' : '') : (item.budget ? 'budget' : ''),
    item.areaSqft ? 'area' : '',
    item.furnishing ? 'furnishing' : '',
  ].filter(Boolean);

  return found.length > 0
    ? `Ready: found ${found.join(', ')}.`
    : 'Ready to post.';
};

const splitVaultDraftBlocks = (rawText: string) => {
  const source = normalizeDraftText(rawText).trim();
  if (!source) return [];

  const paragraphBlocks = source.split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);
  if (paragraphBlocks.length > 1) {
    return paragraphBlocks.flatMap((block) => splitMultiListing(block));
  }

  return splitMultiListing(source);
};

const parseVaultDraft = (rawText: string): VaultDraftPreview[] => {
  const blocks = splitVaultDraftBlocks(rawText);
  if (!blocks.length) return [];

  return blocks
    .map((block, index) => {
      const cleanedLines = cleanDraftLines(block);
      const cleanText = cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
      const type = inferType(cleanText);
      const dealType = inferDealType(cleanText);
      const bhk = inferBhk(cleanText);
      const locality = inferLocality(cleanText);
      const areaSqft = inferAreaSqft(cleanText);
      const priceOrBudget = inferPriceOrBudget(cleanText, dealType);
      const furnishing = inferFurnishing(cleanText);
      const notes = cleanedLines.slice(1).join('\n').trim();
      const missing: string[] = [];

      if (!locality) missing.push('locality');
      if (!bhk && type === 'listing') missing.push('BHK');
      if (!priceOrBudget) missing.push(type === 'listing' ? 'price' : 'budget');
      if (type === 'listing' && !areaSqft) missing.push('area');

      return {
        id: `${index}-${block.slice(0, 32)}`,
        type,
        locality,
        bhk,
        dealType,
        price: type === 'listing' ? priceOrBudget : '',
        budget: type === 'requirement' ? priceOrBudget : '',
        furnishing,
        areaSqft,
        notes,
        rawText: cleanText,
        missing,
        sourceHint: cleanedLines[0] || 'Broker text',
      };
    })
    .filter((item) => item.rawText.length > 0);
};

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
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [freeformDraft, setFreeformDraft] = useState('');

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

  const clearDraft = useCallback(() => {
    setFreeformDraft('');
    setPostError(null);
    setPostSuccess(null);
  }, []);

  const submitEntries = useCallback(async () => {
    const parsed = parseVaultDraft(freeformDraft);
    if (parsed.length === 0) {
      setPostError('Paste broker text first. Pulse needs at least one listing or requirement block to parse.');
      return;
    }

    const invalid = parsed.find((item) => item.missing.length > 0);
    if (invalid) {
      setPostError(`Fill the missing ${invalid.missing.join(', ')} in the highlighted block before posting.`);
      return;
    }

    setPosting(true);
    setPostError(null);
    setPostSuccess(null);

    try {
      const response = await backendApi.post('/api/vault/post', {
        items: parsed.map((item) => ({
          type: item.type,
          locality: item.locality,
          bhk: item.bhk,
          dealType: item.dealType,
          price: item.type === 'listing' ? item.price : null,
          budget: item.type === 'requirement' ? item.budget : null,
          furnishing: item.furnishing || '',
          areaSqft: item.areaSqft || '',
          notes: item.notes || item.rawText,
        })),
      });

      const postedCount = Number(response.data?.listings || 0) + Number(response.data?.requirements || 0);
      setPostSuccess(response.data?.message || `Saved ${postedCount} manual item(s).`);
      clearDraft();
      await loadVault();
    } catch (err) {
      setPostError(handleApiError(err));
    } finally {
      setPosting(false);
    }
  }, [clearDraft, freeformDraft, loadVault]);

  const parsedDrafts = React.useMemo(() => parseVaultDraft(freeformDraft), [freeformDraft]);
  const draftSummary = React.useMemo(() => {
    const listings = parsedDrafts.filter((item) => item.type === 'listing').length;
    const requirements = parsedDrafts.filter((item) => item.type === 'requirement').length;
    const missingCount = parsedDrafts.reduce((count, item) => count + item.missing.length, 0);
    return { listings, requirements, missingCount };
  }, [parsedDrafts]);

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
                Paste broker text once. Pulse parses the rows in the background.
              </h2>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                Use this when you do not want to scan WhatsApp groups. Paste one or many listings / requirements,
                let Pulse parse the structure, and then post the cleaned batch to Vault and the shared stream in one go.
              </p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Starter / 499 is scan-only. Manual posting opens on the 1499 / 1999 paid plans and owner accounts.
              </p>
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

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-3">
              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Freeform Vault</p>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">Paste raw broker text or multiple blocks</p>
                  </div>
                  <div className="text-right text-[10px] text-[var(--text-muted)]">
                    <p>{draftSummary.listings} listings</p>
                    <p>{draftSummary.requirements} requirements</p>
                  </div>
                </div>
                <textarea
                  value={freeformDraft}
                  onChange={(event) => setFreeformDraft(event.target.value)}
                  placeholder={FREEFORM_INPUT_HINT}
                  rows={14}
                  className="mt-4 w-full rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
                />
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5">
                    Paste one broker message or many separated by blank lines.
                  </span>
                  <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5">
                    Pulse highlights missing locality, BHK, price/budget, and area before posting.
                  </span>
                </div>
              </div>

              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Parse preview</p>
                {parsedDrafts.length === 0 ? (
                  <p className="mt-2 text-[12px] text-[var(--text-secondary)]">Paste broker text above to see parsed rows and missing details.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {parsedDrafts.map((item, index) => (
                      <div key={item.id} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                              Parsed row {index + 1}
                            </p>
                            <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                              {item.type === 'listing' ? 'Listing' : 'Requirement'} · {item.dealType.toUpperCase()}
                            </p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                            item.missing.length > 0
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          }`}>
                            {item.missing.length > 0 ? 'Needs detail' : 'Ready'}
                          </span>
                        </div>

                        <p
                          className={`mt-2 text-[11px] ${
                            item.missing.length > 0 ? 'text-amber-300' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {summarizePreviewStatus(item)}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                            {item.locality || 'Locality missing'}
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                            {item.bhk || 'BHK missing'}
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                            {item.type === 'listing' ? (item.price || 'Price missing') : (item.budget || 'Budget missing')}
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                            {item.areaSqft ? `${item.areaSqft} sqft` : 'Area missing'}
                          </span>
                          {item.furnishing ? (
                            <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                              {item.furnishing}
                            </span>
                          ) : null}
                        </div>

                        {item.missing.length > 0 ? (
                          <p className="mt-3 text-[11px] text-amber-300">
                            Fill these before posting: {item.missing.join(', ')}.
                          </p>
                        ) : (
                          <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
                            Ready to post. Pulse will keep the cleaned row and raw text together.
                          </p>
                        )}
                        <details className="mt-3">
                          <summary className="cursor-pointer text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                            Show cleaned broker text
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] leading-6 text-[var(--text-primary)]">
                            {item.rawText}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">What Pulse checks</p>
                <ul className="mt-3 space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                  <li>• Locality / micro-market</li>
                  <li>• BHK or requirement size</li>
                  <li>• Price or budget</li>
                  <li>• Area and furnishing when present</li>
                  <li>• It keeps the raw broker note for review</li>
                </ul>
                <div className="mt-4 flex flex-col gap-2 text-[11px] text-[var(--text-secondary)]">
                  <p className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                    If something is missing, Pulse will highlight it here before posting.
                  </p>
                  <p className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                    You can paste messy broker copy. The parser cleans it and the backend validates it again.
                  </p>
                </div>
              </div>

              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Batch status</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Parsed</p>
                    <p className="mt-1 text-[20px] font-bold text-[var(--text-primary)]">{parsedDrafts.length}</p>
                  </div>
                  <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Needs detail</p>
                    <p className="mt-1 text-[20px] font-bold text-[var(--text-primary)]">{draftSummary.missingCount}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={clearDraft}
                  >
                    Clear draft
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
                <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                  Starter / 499 remains scan-only. Paid posting plans can use this composer.
                </p>
              </div>
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
              ? 'Listings appear here when Pulse parses WhatsApp inventory or when a paid posting plan submits them manually.'
              : 'Requirements appear here when Pulse parses buyer intent or when a paid posting plan submits them manually.'}
          </p>
          <div className="mx-auto mt-4 max-w-2xl rounded-[14px] border border-[color:var(--border)] bg-[var(--bg)] px-4 py-3 text-left">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">
              Plan split
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Starter / 499</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                  Scan-only. It can read WhatsApp streams, but it does not open Vault manual posting.
                </p>
              </div>
              <div className="rounded-[12px] border border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.06)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">1499 / 1999 paid plans</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                  Manual posting is available here. Add listings or requirements in one batch and push them into Vault.
                </p>
              </div>
            </div>
          </div>
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
