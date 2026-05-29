import React from 'react';
import { RefreshCw, Search, MapPin, Loader2 } from 'lucide-react';
import { handleApiError } from '../services/api';
import { fetchAndSaveLiveIgr, fetchIgrSearch, fetchBuildingNames, type IgrTransaction, type IgrSearchResponse } from '../services/igrApi';
import { cn } from '../lib/utils';

const panelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]';
const inputClass = 'w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent-border)]';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatInr(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatSqft(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('en-IN')} sqft`;
}

function formatRate(transaction: IgrTransaction) {
  if (transaction.consideration_amount != null && transaction.area_sqft != null && transaction.area_sqft > 0) {
    return `₹${Math.round(transaction.consideration_amount / transaction.area_sqft).toLocaleString('en-IN')}/sqft`;
  }
  return 'Rate unavailable';
}

function buildTransactionTitle(item: IgrTransaction) {
  return [item.building_name, item.village_locality].filter(Boolean).join(' · ') || item.doc_number || 'Transaction';
}

export default function IgrView() {
  const [buildingName, setBuildingName] = React.useState('');
  const [locality, setLocality] = React.useState('');
  const [months, setMonths] = React.useState(6);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [liveMessage, setLiveMessage] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<IgrSearchResponse | null>(null);
  const [suggestions, setSuggestions] = React.useState<Array<{ name: string; count: number }>>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  const loadSearch = React.useCallback(async (building?: string, place?: string) => {
    const effectiveBuilding = String(building ?? buildingName).trim();
    const effectiveLocality = String(place ?? locality).trim();

    if (!effectiveBuilding && !effectiveLocality) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSearching(true);
    setError(null);
    try {
      const data = await fetchIgrSearch(effectiveBuilding || undefined, effectiveLocality || undefined, months, 10);
      setPayload(data);
    } catch (reason) {
      setError(handleApiError(reason));
      setPayload(null);
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, [buildingName, locality, months]);

  const latest = payload?.latestTransaction || payload?.transactions?.[0] || null;

  const triggerLiveFetch = async () => {
    const effectiveBuilding = buildingName.trim();
    const effectiveLocality = locality.trim();
    if (!effectiveBuilding && !effectiveLocality) {
      setError('Enter a building name or locality first.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setLiveMessage(null);
    try {
      const result = await fetchAndSaveLiveIgr(effectiveBuilding || undefined, effectiveLocality || undefined);
      if (!result.success) {
        setError(result.error || 'Latest transaction refresh failed.');
        return;
      }

      setLiveMessage(
        result.saved
          ? `Latest transaction refreshed${result.docNumber ? ` as ${result.docNumber}` : ''} from ${result.sourceUrl || 'live source'}.`
          : `Latest transaction source reached at ${result.sourceUrl || 'unknown source'}, but nothing was saved.`,
      );
      await loadSearch(effectiveBuilding, effectiveLocality);
    } catch (reason) {
      setError(handleApiError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadSearch();
  };

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = buildingName.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const names = await fetchBuildingNames(trimmed);
        setSuggestions(names);
        setShowSuggestions(names.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [buildingName]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectSuggestion = (name: string) => {
    setBuildingName(name);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const savedCount = payload?.transactions?.length || 0;
  const localityAvg = payload?.localityStats?.avg_price_per_sqft
    ? `₹${payload.localityStats.avg_price_per_sqft.toLocaleString('en-IN')}/sqft`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[95vw] flex-col gap-4 p-3 md:p-4">
      {/* Compact toolbar */}
      <div className="flex items-center justify-between gap-4 rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-[15px] font-bold text-[var(--text-primary)]">Transactions</span>
          </div>
          <div className="h-5 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
            <span>Saved: <span className="font-semibold text-[var(--text-primary)]">{savedCount}</span></span>
            {localityAvg ? (
              <>
                <span className="h-4 w-px bg-[var(--border)]" />
                <span>Locality avg: <span className="font-semibold text-[var(--text-primary)]">{localityAvg}</span></span>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void triggerLiveFetch()}
          disabled={submitting}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh latest
        </button>
      </div>

      {/* Form + Latest result row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tight form */}
        <form className={panelClass} onSubmit={submitSearch}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Building</label>
              <div className="relative">
                <input
                  value={buildingName}
                  onChange={(event) => setBuildingName(event.target.value)}
                  onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
                  placeholder="Kalpataru Magnus"
                  className={inputClass}
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 ? (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-1 shadow-lg"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => selectSuggestion(s.name)}
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-[12px] text-[var(--text-primary)] transition hover:bg-[var(--accent-dim)]"
                      >
                        <span>{s.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{s.count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Locality</label>
              <input
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                placeholder="Bandra East"
                className={inputClass}
              />
            </div>
            <div className="w-24 shrink-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lookback</label>
              <select
                value={months}
                onChange={(event) => setMonths(Number(event.target.value))}
                className={inputClass}
              >
                {[3, 6, 12, 24].map((option) => (
                  <option key={option} value={option}>{option}m</option>
                ))}
              </select>
            </div>
            <div className="flex shrink-0 items-center gap-2 pb-0.5">
              <button
                type="submit"
                disabled={searching}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-primary)] transition hover:border-[color:var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setBuildingName('');
                  setLocality('');
                  setPayload(null);
                  setError(null);
                  setLiveMessage(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Reset
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-[12px] border border-[color:var(--red)]/30 bg-[rgba(224,112,112,0.08)] px-4 py-2.5 text-[12px] text-[var(--red)]">{error}</div>
          ) : null}
          {liveMessage ? (
            <div className="mt-3 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2.5 text-[12px] text-[var(--accent)]">{liveMessage}</div>
          ) : null}
        </form>

        {/* Latest transaction inline */}
        <div className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Latest transaction</p>
            <button
              type="button"
              onClick={() => void loadSearch()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh latest
            </button>
          </div>

          {loading ? (
            <div className="mt-3 rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[12px] text-[var(--text-secondary)]">
              Loading transaction data...
            </div>
          ) : latest ? (
            <div className="mt-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-primary)]">{buildTransactionTitle(latest)}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {formatDate(latest.registration_date)} · {latest.sro_office || latest.district || 'Unknown'}
                  </p>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                  latest.source === 'igr_live'
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                )}>
                  {latest.source || 'igr'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Consideration</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{formatInr(latest.consideration_amount)}</p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Area</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{formatSqft(latest.area_sqft)}</p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Rate</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{formatRate(latest)}</p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Locality</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{latest.village_locality || '—'}</p>
                </div>
              </div>
              {latest.property_description ? (
                <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">{latest.property_description}</p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-[var(--text-muted)]">
                <span>Doc: {latest.doc_number || '—'}</span>
                <span>Scraped: {formatDate(latest.scraped_at)}</span>
              </div>
              {payload?.localityStats ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">6m avg rate</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{payload.localityStats.avg_price_per_sqft ? `₹${payload.localityStats.avg_price_per_sqft.toLocaleString('en-IN')}/sqft` : '—'}</p>
                  </div>
                  <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Txns</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{String(payload.localityStats.transaction_count)}</p>
                  </div>
                  <div className="rounded-[10px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Median</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-primary)]">{formatInr(payload.localityStats.median_consideration)}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[12px] text-[var(--text-secondary)]">
              Enter a building or locality to load saved transaction records.
            </div>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Results</p>
            <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{savedCount} row{savedCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        {payload?.transactions?.length ? (
          <div className="mt-3 grid gap-2">
            {payload.transactions.map((item) => (
              <article key={`${item.doc_number || item.scraped_at || item.building_name}-${item.registration_date || ''}`} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{buildTransactionTitle(item)}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                      {formatDate(item.registration_date)} · {item.sro_office || item.district || 'Unknown'} · {item.source || 'igr'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5 text-[10px] text-[var(--text-secondary)]">
                    <span className="rounded-full border border-[color:var(--border)] px-2.5 py-0.5">{formatInr(item.consideration_amount)}</span>
                    <span className="rounded-full border border-[color:var(--border)] px-2.5 py-0.5">{formatSqft(item.area_sqft)}</span>
                    <span className="rounded-full border border-[color:var(--border)] px-2.5 py-0.5">{formatRate(item)}</span>
                  </div>
                </div>
                {item.property_description ? (
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{item.property_description}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-[12px] text-[var(--text-secondary)]">
            No saved transactions matched this search yet.
          </div>
        )}
      </div>
    </div>
  );
}
