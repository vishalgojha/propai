import React from 'react';
import { RefreshCw, Search, MapPin, Sparkles, Loader2 } from 'lucide-react';
import { handleApiError } from '../services/api';
import { fetchAndSaveLiveIgr, fetchIgrSearch, type IgrTransaction, type IgrSearchResponse } from '../services/igrApi';
import { cn } from '../lib/utils';

const panelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]';
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
  return [item.building_name, item.village_locality].filter(Boolean).join(' · ') || item.doc_number || 'IGR transaction';
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
        setError(result.error || 'Live IGR fetch failed.');
        return;
      }

      setLiveMessage(
        result.saved
          ? `Live IGR result saved${result.docNumber ? ` as ${result.docNumber}` : ''} from ${result.sourceUrl || 'live source'}.`
          : `Live IGR source reached at ${result.sourceUrl || 'unknown source'}, but nothing was saved.`,
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div className="rounded-[18px] border border-[color:var(--accent-border)] bg-[linear-gradient(135deg,rgba(8,16,20,0.98),rgba(10,13,17,0.96))] p-6 shadow-[0_0_0_1px_rgba(62,232,138,0.08),0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              <MapPin className="h-3.5 w-3.5" />
              Maharashtra IGR
            </div>
            <h1 className="mt-4 text-[30px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Live registration rates, saved into your workspace
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Search a building or locality, review the latest saved IGR transactions, and fetch fresh live records when the database is missing the match.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Saved source', payload?.transactions?.length || 0],
              ['Latest rate', latest ? formatRate(latest) : '—'],
              ['Locality avg', payload?.localityStats?.avg_price_per_sqft ? `₹${payload.localityStats.avg_price_per_sqft.toLocaleString('en-IN')}/sqft` : '—'],
              ['Live save', liveMessage ? 'Ready' : 'Use button'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <form className={panelClass} onSubmit={submitSearch}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Search saved IGR</p>
              <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">Lookup by building or locality</h2>
            </div>
            <button
              type="button"
              onClick={() => void triggerLiveFetch()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Fetch live IGR
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Building name</label>
              <input
                value={buildingName}
                onChange={(event) => setBuildingName(event.target.value)}
                placeholder="Kalpataru Magnus"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Locality</label>
              <input
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                placeholder="Bandra East"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lookback months</label>
              <select
                value={months}
                onChange={(event) => setMonths(Number(event.target.value))}
                className={inputClass}
              >
                {[3, 6, 12, 24].map((option) => (
                  <option key={option} value={option}>{option} months</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg)] px-4 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:border-[color:var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search saved data
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
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              Reset
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-[12px] border border-[color:var(--red)]/30 bg-[rgba(224,112,112,0.08)] px-4 py-3 text-[12px] text-[var(--red)]">
              {error}
            </div>
          ) : null}
          {liveMessage ? (
            <div className="mt-4 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--accent)]">
              {liveMessage}
            </div>
          ) : null}
          <div className="mt-4 rounded-[12px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-[11px] leading-6 text-[var(--text-secondary)]">
            Live fetch pulls a current GRAS/IGR source, extracts the transaction, and upserts it into <span className="text-[var(--text-primary)]">igr_transactions</span> for future lookups.
          </div>
        </form>

        <div className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Latest IGR</p>
              <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">Most recent matching transaction</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadSearch()}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]">
                Loading IGR data...
              </div>
            ) : latest ? (
              <>
                <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{buildTransactionTitle(latest)}</p>
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                        {formatDate(latest.registration_date)} · {latest.sro_office || latest.district || 'Unknown district'}
                      </p>
                    </div>
                    <span className={cn(
                      'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                      latest.source === 'igr_live'
                        ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                        : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                    )}>
                      {latest.source || 'igr'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Metric label="Consideration" value={formatInr(latest.consideration_amount)} />
                    <Metric label="Area" value={formatSqft(latest.area_sqft)} />
                    <Metric label="Rate" value={formatRate(latest)} />
                    <Metric label="Locality" value={latest.village_locality || '—'} />
                  </div>

                  {latest.property_description ? (
                    <p className="mt-4 text-[12px] leading-6 text-[var(--text-secondary)]">
                      {latest.property_description}
                    </p>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
                    <span>Doc: {latest.doc_number || '—'}</span>
                    <span>Scraped: {formatDate(latest.scraped_at)}</span>
                  </div>
                </div>

                {payload?.localityStats ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Metric label="6m avg rate" value={payload.localityStats.avg_price_per_sqft ? `₹${payload.localityStats.avg_price_per_sqft.toLocaleString('en-IN')}/sqft` : '—'} />
                    <Metric label="Transactions" value={String(payload.localityStats.transaction_count)} />
                    <Metric label="Median consideration" value={formatInr(payload.localityStats.median_consideration)} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]">
                Enter a building or locality to load saved IGR records.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Results</p>
            <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">Saved transactions and recent lookups</h2>
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {payload?.transactions?.length || 0} row{(payload?.transactions?.length || 0) === 1 ? '' : 's'}
          </div>
        </div>

        {payload?.transactions?.length ? (
          <div className="mt-4 grid gap-3">
            {payload.transactions.map((item) => (
              <article key={`${item.doc_number || item.scraped_at || item.building_name}-${item.registration_date || ''}`} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{buildTransactionTitle(item)}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                      {formatDate(item.registration_date)} · {item.sro_office || item.district || 'Unknown district'} · {item.source || 'igr'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                    <span className="rounded-full border border-[color:var(--border)] px-3 py-1">{formatInr(item.consideration_amount)}</span>
                    <span className="rounded-full border border-[color:var(--border)] px-3 py-1">{formatSqft(item.area_sqft)}</span>
                    <span className="rounded-full border border-[color:var(--border)] px-3 py-1">{formatRate(item)}</span>
                  </div>
                </div>
                {item.property_description ? (
                  <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">{item.property_description}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]">
            No saved IGR transactions matched this search yet.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
