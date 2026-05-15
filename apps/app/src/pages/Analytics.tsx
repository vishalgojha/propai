import React, { Suspense, useEffect, useState } from 'react';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

const AnalyticsCharts = React.lazy(() => import('./AnalyticsCharts'));

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'volume' | 'demandsupply' | 'locations' | 'brokers'>('volume');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [sessionLabel]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await backendApi.get(ENDPOINTS.channels.analytics, {
        params: sessionLabel ? { sessionLabel } : {},
      });
      setData(response.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: 'volume' | 'demandsupply' | 'locations' | 'brokers') => {
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div className="p-6 text-[var(--text-secondary)] text-[12px]">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400 text-[12px]">
        Error: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="ap">
      <div className="ap-header flex justify-between items-center mb-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div>
          <div className="ap-heading text-[20px] font-bold text-[#f0ede6] tracking-[-0.02em]">
            <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-[#6bcf8f] mr-1.5 animate-pulse"></span>
            Stream Analytics
          </div>
          <div className="ap-sub font-mono text-[10px] text-[#4a4845] mt-0.5">PropAI · Market Intelligence</div>
        </div>
      </div>

      <div className="kpi-row grid grid-cols-4 gap-2.5 mb-5">
        <div className="kpi bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-3.5">
          <div className="kpi-lbl font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-2">Total Stream</div>
          <div className="kpi-val text-[26px] font-bold text-[#f0ede6] tracking-[-0.03em] leading-none mb-1">{data.kpi.totalStream.toLocaleString()}</div>
        </div>
        <div className="kpi bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-3.5">
          <div className="kpi-lbl font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-2">Requirements</div>
          <div className="kpi-val text-[26px] font-bold text-[#f0ede6] tracking-[-0.03em] leading-none mb-1">{data.kpi.requirements}</div>
        </div>
        <div className="kpi bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-3.5">
          <div className="kpi-lbl font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-2">D/S Ratio</div>
          <div className="kpi-val text-[26px] font-bold text-[#f0ede6] tracking-[-0.03em] leading-none mb-1">{data.kpi.dsRatio}x</div>
          <div className="kpi-d font-mono text-[10px] text-[#e07070]">Supply heavy</div>
        </div>
        <div className="kpi bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-3.5">
          <div className="kpi-lbl font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-2">Active Brokers</div>
          <div className="kpi-val text-[26px] font-bold text-[#f0ede6] tracking-[-0.03em] leading-none mb-1">{data.kpi.activeBrokers}</div>
        </div>
      </div>

      <div className="tabs flex gap-1 mb-4 bg-[#141416] p-1 rounded-[10px] border border-[rgba(255,255,255,0.05)]">
        {['volume', 'demandsupply', 'locations', 'brokers'].map((tab) => (
          <button
            key={tab}
            className={`tab flex-1 font-mono text-[10px] tracking-[0.06em] uppercase py-1.5 px-2 text-center rounded-[7px] cursor-pointer border-none ${
              activeTab === tab ? 'bg-[#e8c97a] text-[#0c0c0e] font-medium' : 'bg-transparent text-[#4a4845]'
            }`}
            onClick={() => switchTab(tab as any)}
          >
            {tab === 'volume' ? 'Volume' : tab === 'demandsupply' ? 'Demand vs Supply' : tab === 'locations' ? 'Locations' : 'Brokers'}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="p-4 text-[var(--text-secondary)] text-[12px]">Loading charts...</div>}>
        <AnalyticsCharts activeTab={activeTab} data={data} />
      </Suspense>
    </div>
  );
};

export default Analytics;
