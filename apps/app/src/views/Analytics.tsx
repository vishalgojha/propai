import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import {
  DailySupplyDemandChart,
  NetDemandChart,
  UnitGapChart,
  TypeDistributionChart,
  VelocityLineChart,
} from './AnalyticsCharts';

type TabId = 'pulse' | 'supply' | 'velocity' | 'brokers' | 'inventory';
type Days = 1 | 3 | 7 | 14 | 30;

type IntelligenceResult = {
  scope?: 'all_accounts' | 'workspace';
  validRows?: number;
  activeBrokerCount?: number;
  marketPulse: {
    locality: string;
    listings: number;
    requirements: number;
    demandSignal: 'high_demand' | 'balanced' | 'oversupplied';
    topBhk: string | null;
  }[];
  configurationDemand: {
    configuration: string;
    listings: number;
    requirements: number;
    gap: number;
  }[];
  velocity: {
    date: string;
    newListings: number;
    newRequirements: number;
    netDemand: number;
  }[];
  brokerLeaderboard: {
    brokerName: string;
    phone: string;
    listingCount: number;
    requirementCount: number;
    lastActiveAt: string;
    recentItems?: {
      id: string;
      type: string;
      locality: string;
      configuration: string | null;
      createdAt: string;
    }[];
  }[];
  myInventory: {
    totalListings: number;
    totalRequirements: number;
    unreadCount: number;
    matchedCount: number;
    byType: Record<string, number>;
    byLocality: { locality: string; count: number }[];
  };
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'pulse', label: 'Market Pulse' },
  { id: 'supply', label: 'Observed Activity' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'brokers', label: 'Brokers' },
  { id: 'inventory', label: 'Inventory' },
];

const PERIODS: Days[] = [1, 3, 7, 14, 30];
const panelClass = 'bg-[var(--bg-elevated)] border border-[color:var(--border)] rounded-[10px] p-4';
const panelLabelClass = 'font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-[0.1em] mb-3';
const statNumberClass = 'text-[28px] font-bold text-[var(--text-primary)] tabular-nums';
const statLabelClass = 'text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)] mt-1';

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('pulse');
  const [days, setDays] = useState<Days>(30);
  const [intelData, setIntelData] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [brokerLimit, setBrokerLimit] = useState(20);
  const [selectedBrokerPhone, setSelectedBrokerPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      setIntelError(null);

      try {
        const response = await backendApi.get('/analytics/intelligence', { params: { days } });
        if (cancelled) return;
        setIntelData(response.data as IntelligenceResult);
      } catch (reason) {
        if (cancelled) return;
        const message = handleApiError(reason);
        setIntelError(message);
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [days, user?.token]);

  const marketPulse = useMemo(
    () => [...(intelData?.marketPulse || [])].sort((left, right) => (right.listings + right.requirements) - (left.listings + left.requirements)),
    [intelData?.marketPulse],
  );
  const unitDemand = useMemo(() => intelData?.configurationDemand || [], [intelData?.configurationDemand]);
  const selectedBroker = useMemo(
    () => (intelData?.brokerLeaderboard || []).find((broker) => broker.phone === selectedBrokerPhone) || null,
    [intelData?.brokerLeaderboard, selectedBrokerPhone],
  );
  const dailyVolume = useMemo(
    () => (intelData?.velocity || []).map((row) => ({
      date: row.date,
      supply: row.newListings,
      demand: row.newRequirements,
    })),
    [intelData?.velocity],
  );
  const totalListings = intelData?.myInventory?.totalListings || 0;
  const totalRequirements = intelData?.myInventory?.totalRequirements || 0;
  const supplyDemandRatio = totalListings > 0 ? totalRequirements / totalListings : 0;
  const inventoryScopeLabel = intelData?.scope === 'all_accounts' ? 'All Accounts' : 'My';
  const observedRowsLabel = formatInteger(intelData?.validRows);

  if (loading) {
    return <div className="p-6 text-[12px] text-[var(--text-secondary)]">Loading intelligence...</div>;
  }

  if (error) {
    return <div className="p-6 text-[12px] text-[var(--red)]">Error: {error}</div>;
  }

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-[color:var(--border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Intelligence</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            PropAI · {intelData?.scope === 'all_accounts' ? 'All account signals' : 'Workspace signals'} · {observedRowsLabel} observed rows
          </p>
          <p className="mt-2 max-w-2xl text-[12px] leading-6 text-[var(--text-secondary)]">
            This view shows what the system has actually seen in broker data. It is a signal summary, not a guaranteed market truth.
          </p>
        </div>
        <div className="flex w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-1 sm:w-auto">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setDays(period)}
              className={cn(
                'min-w-14 flex-1 rounded-[7px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition sm:flex-none',
                days === period
                  ? 'border border-[color:var(--accent)] text-[var(--accent)]'
                  : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {period}d
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Observed Rows" value={formatInteger(intelData?.validRows)} />
        <KpiCard label="Observed Requirements" value={formatInteger(totalRequirements)} />
        <KpiCard label="Observed Ratio" value={`${formatRatio(supplyDemandRatio)}x`} />
        <KpiCard label="Active Brokers" value={formatInteger(intelData?.activeBrokerCount ?? intelData?.brokerLeaderboard?.length)} />
      </section>

      <nav className="overflow-x-auto rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-1">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-[7px] border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition',
                activeTab === tab.id
                  ? 'border-[color:var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === 'pulse' && (
        <TabState error={intelError} empty={!marketPulse.length}>
          <section data-tour="intelligence-locality" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {marketPulse.map((item) => (
              <article
                key={item.locality}
                className={panelClass}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-bold text-[var(--text-primary)]">{item.locality}</h2>
                  <DemandBadge signal={item.demandSignal} />
                </div>
                <div className="my-4 border-t border-[color:var(--border)]" />
                <div className="grid grid-cols-2 gap-3">
                  <MiniMetric label="Listings" value={formatInteger(item.listings)} />
                  <MiniMetric label="Requirements" value={formatInteger(item.requirements)} />
                </div>
                <div className="mt-4 text-[12px] text-[var(--text-secondary)]">
                  Top unit: {item.topBhk || 'Mixed inventory'}
                </div>
              </article>
            ))}
          </section>
        </TabState>
      )}

      {activeTab === 'supply' && (
        <TabState error={intelError} empty={!intelData}>
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ChartPanel label="Daily observed listings vs requirements">
              <DailySupplyDemandChart rows={dailyVolume} />
            </ChartPanel>
              <ChartPanel label="Unit-size gap from observed rows" dataTour="intelligence-configuration">
              <UnitGapChart rows={unitDemand} />
            </ChartPanel>
          </section>
          <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <ChartPanel label="Listing type split">
              <TypeDistributionChart values={intelData?.myInventory?.byType || {}} />
            </ChartPanel>
            <div className={panelClass}>
              <div className={panelLabelClass}>Unit mix detail</div>
              <p className="mb-3 text-[11px] text-[var(--text-muted)]">
                Residential BHK is one slice. Commercial and mixed inventory should be read alongside type split and locality pulse.
              </p>
              <div className="space-y-2">
                {unitDemand.map((row) => (
                  <div key={row.configuration} className="grid grid-cols-[70px_1fr_56px] items-center gap-3 text-[12px]">
                    <span className="font-semibold text-[var(--text-secondary)]">{row.configuration}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                      <div
                        className={cn('h-full rounded-full', row.gap >= 0 ? 'bg-[var(--accent)]' : 'bg-[var(--red)]')}
                        style={{ width: `${Math.min(100, Math.max(8, (Math.abs(row.gap) / Math.max(1, row.listings, row.requirements)) * 100))}%` }}
                      />
                    </div>
                    <span className={cn('font-mono tabular-nums', row.gap >= 0 ? 'text-[var(--accent)]' : 'text-[var(--red)]')}>
                      {row.gap > 0 ? '+' : ''}{row.gap}
                    </span>
                    <span />
                    <span className="text-[11px] text-[var(--text-muted)]">listings: {row.listings} / requirements: {row.requirements}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </TabState>
      )}

      {activeTab === 'velocity' && (
        <TabState error={intelError} empty={!intelData?.velocity?.length}>
          <section className="space-y-3">
            <ChartPanel label="New listings and requirements">
              <VelocityLineChart rows={intelData?.velocity || []} />
            </ChartPanel>
            <ChartPanel label="Net demand">
              <NetDemandChart rows={intelData?.velocity || []} />
            </ChartPanel>
            <VelocityCallout rows={intelData?.velocity || []} />
          </section>
        </TabState>
      )}

      {activeTab === 'brokers' && (
        <TabState error={intelError} empty={!intelData?.brokerLeaderboard?.length}>
          <section className={cn(panelClass, 'overflow-hidden p-0')}>
            <div className="grid min-w-[680px] grid-cols-[1.5fr_120px_140px_130px] border-b border-[color:var(--border)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <span>Broker</span>
              <span>Listings</span>
              <span>Requirements</span>
              <span>Last Active</span>
            </div>
            <div className="overflow-x-auto">
              {(intelData?.brokerLeaderboard || []).slice(0, brokerLimit).map((broker) => (
                <button
                  key={broker.phone}
                  type="button"
                  onClick={() => setSelectedBrokerPhone(broker.phone)}
                  className="grid min-w-[680px] w-full grid-cols-[1.5fr_120px_140px_130px] border-b border-[color:var(--border)] px-4 py-3 text-left text-[12px] transition last:border-b-0 hover:bg-[var(--bg-surface)]"
                >
                  <span className="font-semibold text-[var(--text-primary)]">{displayBrokerName(broker)}</span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">{broker.listingCount}</span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">{broker.requirementCount}</span>
                  <span className="text-[var(--text-muted)]">{formatTimeAgo(broker.lastActiveAt)}</span>
                </button>
              ))}
            </div>
          </section>
          {(intelData?.brokerLeaderboard || []).length > brokerLimit && (
            <button
              type="button"
              onClick={() => setBrokerLimit((current) => current + 20)}
              className="rounded-[10px] border border-[color:var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              Load more
            </button>
          )}
          {selectedBroker && (
            <BrokerPanel broker={selectedBroker} onClose={() => setSelectedBrokerPhone(null)} />
          )}
        </TabState>
      )}

      {activeTab === 'inventory' && (
        <TabState error={intelError} empty={!intelData?.myInventory}>
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_0.8fr_1fr]">
            <div className="grid grid-cols-2 gap-3">
              <InventoryStat label={`${inventoryScopeLabel} Listings`} value={formatInteger(intelData?.myInventory?.totalListings)} />
              <InventoryStat label={`${inventoryScopeLabel} Requirements`} value={formatInteger(intelData?.myInventory?.totalRequirements)} />
              <InventoryStat label="Unread" value={formatInteger(intelData?.myInventory?.unreadCount)} />
            </div>
            <ChartPanel label="My listings by type">
              <TypeDistributionChart values={intelData?.myInventory?.byType || {}} />
            </ChartPanel>
            <div className={panelClass}>
              <div className={panelLabelClass}>Locality breakdown</div>
              <div className="space-y-2">
                {(intelData?.myInventory?.byLocality || []).map((row) => {
                  const total = Math.max(1, (intelData?.myInventory?.totalListings || 0) + (intelData?.myInventory?.totalRequirements || 0));
                  return (
                    <div key={row.locality} className="grid grid-cols-[1fr_52px_52px] items-center gap-3 text-[12px]">
                      <span className="truncate text-[var(--text-secondary)]">{row.locality}</span>
                      <span className="font-mono tabular-nums text-[var(--text-primary)]">{row.count}</span>
                      <span className="font-mono tabular-nums text-[var(--text-muted)]">{Math.round((row.count / total) * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          {(intelData?.myInventory?.unreadCount || 0) > 0 && (
            <div className={cn(panelClass, 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
              <p className="text-[13px] text-[var(--text-secondary)]">You have {intelData?.myInventory?.unreadCount} unread items</p>
              <Link
                to="/inbox"
                className="inline-flex rounded-[10px] border border-[color:var(--accent)] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]"
              >
                Go to Inbox
              </Link>
            </div>
          )}
        </TabState>
      )}
    </div>
  );
};

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={panelClass}>
      <div className={panelLabelClass}>{label}</div>
      <div className={statNumberClass}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={statNumberClass}>{value}</div>
      <div className={statLabelClass}>{label}</div>
    </div>
  );
}

function InventoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={panelClass}>
      <div className={statNumberClass}>{value}</div>
      <div className={statLabelClass}>{label}</div>
    </div>
  );
}

function ChartPanel({ label, children, dataTour }: { label: string; children: React.ReactNode; dataTour?: string }) {
  return (
    <div data-tour={dataTour} className={panelClass}>
      <div className={panelLabelClass}>{label}</div>
      <div className="relative h-[300px] min-h-[260px]">{children}</div>
    </div>
  );
}

function TabState({ error, empty, children }: { error?: string | null; empty?: boolean; children: React.ReactNode }) {
  if (error) {
    return <div className={cn(panelClass, 'text-[12px] text-[var(--red)]')}>{error}</div>;
  }

  if (empty) {
    return <div className={cn(panelClass, 'text-[12px] text-[var(--text-secondary)]')}>No analytics data is available for this period.</div>;
  }

  return <>{children}</>;
}

function DemandBadge({ signal }: { signal: IntelligenceResult['marketPulse'][number]['demandSignal'] }) {
  const className =
    signal === 'high_demand'
      ? 'border-[rgba(62,232,138,0.35)] bg-[rgba(62,232,138,0.12)] text-[var(--accent)]'
      : signal === 'balanced'
        ? 'border-amber-400/30 bg-amber-500/10 text-[var(--amber)]'
        : 'border-red-400/30 bg-red-500/10 text-[var(--red)]';

  return (
    <span className={cn('rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em]', className)}>
      {signal === 'high_demand' ? 'High Demand' : signal === 'oversupplied' ? 'Oversupplied' : 'Balanced'}
    </span>
  );
}

function VelocityCallout({ rows }: { rows: IntelligenceResult['velocity'] }) {
  const trend = rows.slice(-7);
  const avgNetDemand = trend.length ? trend.reduce((sum, row) => sum + row.netDemand, 0) / trend.length : 0;
  const tone = avgNetDemand > 0 ? 'demand' : avgNetDemand < 0 ? 'supply' : 'balanced';
  const message =
    tone === 'demand'
      ? 'Observed requirements have outpaced observed listings for the past 7 days'
      : tone === 'supply'
        ? 'Observed listings have outpaced observed requirements for the past 7 days'
        : 'Observed listings and requirements are balanced this week';

  return (
    <div
      className={cn(
        panelClass,
        tone === 'demand'
          ? 'border-[rgba(62,232,138,0.35)] text-[var(--accent)]'
          : tone === 'supply'
            ? 'border-red-400/30 text-[var(--red)]'
            : 'border-amber-400/30 text-[var(--amber)]',
      )}
    >
      <div className={panelLabelClass}>Insight</div>
      <p className="text-[15px] font-semibold">{message}</p>
    </div>
  );
}

function BrokerPanel({
  broker,
  onClose,
}: {
  broker: IntelligenceResult['brokerLeaderboard'][number];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md border-l border-[color:var(--border)] bg-[var(--bg-base)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={panelLabelClass}>Broker activity</div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">{displayBrokerName(broker)}</h2>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{maskPhone(broker.phone)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[color:var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <InventoryStat label="Listings" value={formatInteger(broker.listingCount)} />
          <InventoryStat label="Requirements" value={formatInteger(broker.requirementCount)} />
        </div>

        <div className="mt-6">
          <div className={panelLabelClass}>Recent items</div>
          <div className="space-y-2">
            {(broker.recentItems || []).length ? (
              (broker.recentItems || []).map((item) => (
                <div key={item.id} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{item.locality}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{formatTimeAgo(item.createdAt)}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                    {item.type} · {item.configuration || 'Configuration n/a'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)]">No recent item detail is available for this broker.</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function displayBrokerName(broker: IntelligenceResult['brokerLeaderboard'][number]) {
  const name = String(broker.brokerName || '').trim();
  if (name && !/^unknown/i.test(name)) return name;
  return phoneFallback(broker.phone);
}

function phoneFallback(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `Unknown (${digits.slice(-5)})` : 'Unknown broker';
}

function maskPhone(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return 'No phone';
  return `•••••${digits.slice(-5)}`;
}

function formatTimeAgo(value?: string | null) {
  if (!value) return 'Recently';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Recently';
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatInteger(value?: number | null) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatRatio(value?: number | null) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export default Analytics;
