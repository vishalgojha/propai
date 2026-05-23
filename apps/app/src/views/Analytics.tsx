import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { formatPriceNumeric } from '../lib/formatPrice';
import {
  BhkGapChart,
  DailySupplyDemandChart,
  NetDemandChart,
  PriceByLocalityChart,
  TypeDistributionChart,
  VelocityLineChart,
} from './AnalyticsCharts';

type TabId = 'pulse' | 'supply' | 'price' | 'velocity' | 'brokers' | 'inventory';
type Days = 7 | 14 | 30;
type PriceSortKey = 'avgPrice' | 'count' | 'minPrice' | 'maxPrice';

type AnalyticsResult = {
  kpi: {
    totalStream: number;
    requirements: number;
    supply: number;
    dsRatio: number;
    activeBrokers: number;
    channelsCount: number;
  };
  dailyVolume: { date: string; supply: number; demand: number }[];
  hourlyActivity: { hour: string; count: number }[];
  topLocations: { name: string; supply: number; demand: number; ratio: number; gap: string }[];
  topBrokers: { phone: string; count: number; avgConfidence: number }[];
  typeDistribution: Record<string, number>;
  health: unknown;
};

type IntelligenceResult = {
  marketPulse: {
    locality: string;
    listings: number;
    requirements: number;
    demandSignal: 'high_demand' | 'balanced' | 'oversupplied';
    avgPriceNumeric: number | null;
    topBhk: string | null;
  }[];
  bhkDemand: {
    bhk: string;
    listings: number;
    requirements: number;
    gap: number;
  }[];
  priceRanges: {
    locality: string;
    bhk: string;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    count: number;
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
      bhk: string | null;
      priceNumeric: number | null;
      createdAt: string;
    }[];
  }[];
  myInventory: {
    totalListings: number;
    totalRequirements: number;
    unreadCount: number;
    matchedCount: number;
    avgConfidence: number;
    byType: Record<string, number>;
    byLocality: { locality: string; count: number }[];
  };
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'pulse', label: 'Market Pulse' },
  { id: 'supply', label: 'Supply vs Demand' },
  { id: 'price', label: 'Price Intel' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'brokers', label: 'Brokers' },
  { id: 'inventory', label: 'My Inventory' },
];

const PERIODS: Days[] = [7, 14, 30];
const panelClass = 'bg-[var(--bg-elevated)] border border-[color:var(--border)] rounded-[10px] p-4';
const panelLabelClass = 'font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-[0.1em] mb-3';
const statNumberClass = 'text-[28px] font-bold text-[var(--text-primary)] tabular-nums';
const statLabelClass = 'text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)] mt-1';

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('pulse');
  const [days, setDays] = useState<Days>(30);
  const [baseData, setBaseData] = useState<AnalyticsResult | null>(null);
  const [intelData, setIntelData] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [selectedLocality, setSelectedLocality] = useState('all');
  const [selectedBhk, setSelectedBhk] = useState('2 BHK');
  const [priceSort, setPriceSort] = useState<{ key: PriceSortKey; direction: 'asc' | 'desc' }>({ key: 'avgPrice', direction: 'desc' });
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
      setBaseError(null);
      setIntelError(null);

      const [base, intel] = await Promise.allSettled([
        backendApi.get(ENDPOINTS.channels.analytics),
        backendApi.get('/analytics/intelligence', { params: { days } }),
      ]);

      if (cancelled) return;

      if (base.status === 'fulfilled') {
        setBaseData(base.value.data as AnalyticsResult);
      } else {
        setBaseError(handleApiError(base.reason));
      }

      if (intel.status === 'fulfilled') {
        setIntelData(intel.value.data as IntelligenceResult);
      } else {
        setIntelError(handleApiError(intel.reason));
      }

      if (base.status === 'rejected' && intel.status === 'rejected') {
        setError('Analytics and intelligence data are unavailable right now.');
      }

      setLoading(false);
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [days, user?.token]);

  useEffect(() => {
    const bhks = uniqueBhks(intelData?.priceRanges || []);
    if (bhks.length && !bhks.includes(selectedBhk)) {
      setSelectedBhk(bhks[0]);
    }
  }, [intelData?.priceRanges, selectedBhk]);

  const marketPulse = useMemo(
    () => [...(intelData?.marketPulse || [])].sort((left, right) => (right.listings + right.requirements) - (left.listings + left.requirements)),
    [intelData?.marketPulse],
  );
  const localities = useMemo(() => uniqueLocalities(intelData?.priceRanges || []), [intelData?.priceRanges]);
  const bhks = useMemo(() => uniqueBhks(intelData?.priceRanges || []), [intelData?.priceRanges]);
  const filteredPrices = useMemo(() => {
    const filtered = (intelData?.priceRanges || []).filter((row) => selectedLocality === 'all' || row.locality === selectedLocality);
    return [...filtered].sort((left, right) => {
      const delta = Number(left[priceSort.key] || 0) - Number(right[priceSort.key] || 0);
      return priceSort.direction === 'asc' ? delta : -delta;
    });
  }, [intelData?.priceRanges, priceSort, selectedLocality]);
  const priceChartRows = useMemo(
    () => filteredPrices.filter((row) => row.bhk === selectedBhk).sort((left, right) => right.avgPrice - left.avgPrice),
    [filteredPrices, selectedBhk],
  );
  const selectedBroker = useMemo(
    () => (intelData?.brokerLeaderboard || []).find((broker) => broker.phone === selectedBrokerPhone) || null,
    [intelData?.brokerLeaderboard, selectedBrokerPhone],
  );

  const handleMarketCardClick = (locality: string) => {
    setSelectedLocality(locality);
    setActiveTab('price');
  };

  const handlePriceSort = (key: PriceSortKey) => {
    setPriceSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  if (loading) {
    return <div className="p-6 text-[12px] text-[var(--text-secondary)]">Loading analytics...</div>;
  }

  if (error) {
    return <div className="p-6 text-[12px] text-[var(--red)]">Error: {error}</div>;
  }

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-[color:var(--border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Analytics & Intelligence</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">PropAI · Market Intelligence</p>
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
        <KpiCard label="Total Stream" value={formatInteger(baseData?.kpi?.totalStream)} />
        <KpiCard label="Requirements" value={formatInteger(baseData?.kpi?.requirements)} />
        <KpiCard label="Supply/Demand Ratio" value={`${formatRatio(baseData?.kpi?.dsRatio)}x`} />
        <KpiCard label="Active Brokers" value={formatInteger(baseData?.kpi?.activeBrokers)} />
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
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {marketPulse.map((item) => (
              <button
                key={item.locality}
                type="button"
                onClick={() => handleMarketCardClick(item.locality)}
                className={cn(panelClass, 'text-left transition hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-surface)]')}
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
                  Avg {item.avgPriceNumeric ? formatPriceNumeric(item.avgPriceNumeric) : 'updating'} <span className="text-[var(--text-muted)]">·</span> Top: {item.topBhk || 'Mixed BHK'}
                </div>
              </button>
            ))}
          </section>
        </TabState>
      )}

      {activeTab === 'supply' && (
        <TabState empty={!baseData && !intelData}>
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ChartPanel label="Daily supply vs demand">
              {baseError ? <InlinePanelError message={baseError} /> : <DailySupplyDemandChart rows={baseData?.dailyVolume || []} />}
            </ChartPanel>
            <ChartPanel label="BHK demand gap">
              {intelError ? <InlinePanelError message={intelError} /> : <BhkGapChart rows={intelData?.bhkDemand || []} />}
            </ChartPanel>
          </section>
          <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <ChartPanel label="Listing type split">
              {baseError ? <InlinePanelError message={baseError} /> : <TypeDistributionChart values={baseData?.typeDistribution || {}} />}
            </ChartPanel>
            <div className={panelClass}>
              <div className={panelLabelClass}>Demand gap detail</div>
              {intelError ? <InlinePanelError message={intelError} /> : <div className="space-y-2">
                {(intelData?.bhkDemand || []).map((row) => (
                  <div key={row.bhk} className="grid grid-cols-[70px_1fr_56px] items-center gap-3 text-[12px]">
                    <span className="font-semibold text-[var(--text-secondary)]">{row.bhk}</span>
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
              </div>}
            </div>
          </section>
        </TabState>
      )}

      {activeTab === 'price' && (
        <TabState error={intelError} empty={!filteredPrices.length}>
          <section className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <select
                value={selectedLocality}
                onChange={(event) => setSelectedLocality(event.target.value)}
                className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none"
              >
                <option value="all">All localities</option>
                {localities.map((locality) => (
                  <option key={locality} value={locality}>{locality}</option>
                ))}
              </select>
              <select
                value={selectedBhk}
                onChange={(event) => setSelectedBhk(event.target.value)}
                className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none"
              >
                {bhks.map((bhk) => (
                  <option key={bhk} value={bhk}>{bhk}</option>
                ))}
              </select>
            </div>

            <div className={cn(panelClass, 'overflow-x-auto p-0')}>
              <table className="min-w-[760px] w-full border-collapse text-left text-[12px]">
                <thead className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Locality</th>
                    <th className="px-4 py-3">BHK</th>
                    <SortableHeader label="Min" sortKey="minPrice" priceSort={priceSort} onSort={handlePriceSort} />
                    <SortableHeader label="Max" sortKey="maxPrice" priceSort={priceSort} onSort={handlePriceSort} />
                    <SortableHeader label="Avg" sortKey="avgPrice" priceSort={priceSort} onSort={handlePriceSort} />
                    <SortableHeader label="Count" sortKey="count" priceSort={priceSort} onSort={handlePriceSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {filteredPrices.map((row) => (
                    <tr key={`${row.locality}-${row.bhk}`} className="hover:bg-[var(--bg-surface)]">
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{row.locality}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{row.bhk}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{formatPriceNumeric(row.minPrice)}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{formatPriceNumeric(row.maxPrice)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--text-primary)]">{formatPriceNumeric(row.avgPrice)}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ChartPanel label={`Avg price by locality · ${selectedBhk}`}>
              <PriceByLocalityChart rows={priceChartRows} />
            </ChartPanel>
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
              <InventoryStat label="My Listings" value={formatInteger(intelData?.myInventory?.totalListings)} />
              <InventoryStat label="My Requirements" value={formatInteger(intelData?.myInventory?.totalRequirements)} />
              <InventoryStat label="Unread" value={formatInteger(intelData?.myInventory?.unreadCount)} />
              <InventoryStat label="Avg Confidence" value={`${Math.round(intelData?.myInventory?.avgConfidence || 0)}%`} />
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

function ChartPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={panelClass}>
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

function InlinePanelError({ message }: { message: string }) {
  return <div className="flex h-full items-center text-[12px] text-[var(--red)]">{message}</div>;
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

function SortableHeader({
  label,
  sortKey,
  priceSort,
  onSort,
}: {
  label: string;
  sortKey: PriceSortKey;
  priceSort: { key: PriceSortKey; direction: 'asc' | 'desc' };
  onSort: (key: PriceSortKey) => void;
}) {
  const active = priceSort.key === sortKey;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('font-mono uppercase tracking-[0.08em]', active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}
      >
        {label}{active ? (priceSort.direction === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );
}

function VelocityCallout({ rows }: { rows: IntelligenceResult['velocity'] }) {
  const trend = rows.slice(-7);
  const avgNetDemand = trend.length ? trend.reduce((sum, row) => sum + row.netDemand, 0) / trend.length : 0;
  const tone = avgNetDemand > 0 ? 'demand' : avgNetDemand < 0 ? 'supply' : 'balanced';
  const message =
    tone === 'demand'
      ? 'Demand has outpaced supply for the past 7 days'
      : tone === 'supply'
        ? 'Supply has outpaced demand for the past 7 days'
        : 'Supply and demand are balanced this week';

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
                    {item.type} · {item.bhk || 'BHK n/a'} · {item.priceNumeric ? formatPriceNumeric(item.priceNumeric) : 'Price n/a'}
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

function uniqueLocalities(rows: IntelligenceResult['priceRanges']) {
  return Array.from(new Set(rows.map((row) => row.locality))).sort((left, right) => left.localeCompare(right));
}

function uniqueBhks(rows: IntelligenceResult['priceRanges']) {
  const order = ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'];
  return Array.from(new Set(rows.map((row) => row.bhk))).sort((left, right) => order.indexOf(left) - order.indexOf(right));
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
