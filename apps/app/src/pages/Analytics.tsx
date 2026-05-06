import React, { useState, useEffect, useRef } from 'react';
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const DAYS7 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TT = {
  backgroundColor: '#1e1e22',
  titleColor: '#e8e6e0',
  bodyColor: '#a09d96',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 6,
  titleFont: { family: 'Syne', size: 11 },
  bodyFont: { family: 'DM Mono', size: 10 },
};
const SC = {
  x: { grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false }, ticks: { color: '#3a3835', font: { family: 'DM Mono', size: 9 }, maxRotation: 0 }, border: { display: false } },
  y: { grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false }, ticks: { color: '#3a3835', font: { family: 'DM Mono', size: 9 } }, border: { display: false } },
};

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

  const dailyVolumeData = {
    labels: data.dailyVolume.map((d: any) => DAYS7[new Date(d.date).getDay()]),
    datasets: [
      { label: 'Supply', data: data.dailyVolume.map((d: any) => d.supply), backgroundColor: 'rgba(106,176,232,0.5)', borderRadius: 3, stack: 's' },
      { label: 'Demand', data: data.dailyVolume.map((d: any) => d.demand), backgroundColor: 'rgba(232,201,122,0.75)', borderRadius: 3, stack: 's' },
    ],
  };

  const hourlyData = {
    labels: data.hourlyActivity.map((h: any) => h.hour),
    datasets: [{
      data: data.hourlyActivity.map((h: any) => h.count),
      borderColor: '#e8c97a',
      backgroundColor: 'rgba(232,201,122,0.07)',
      borderWidth: 1.5,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
    }],
  };

  const typeDistData = {
    labels: Object.keys(data.typeDistribution || {}),
    datasets: [{
      data: Object.values(data.typeDistribution || {}),
      backgroundColor: ['rgba(107,207,143,0.7)', 'rgba(106,176,232,0.7)', 'rgba(232,201,122,0.8)'],
      borderColor: '#0c0c0e',
      borderWidth: 3,
    }],
  };

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

      {activeTab === 'volume' && (
        <div className="tab-content">
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div className="panel bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-4">
              <div className="panel-label font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-3.5">Daily volume — 7 days</div>
              <div className="chart-wrap relative h-[180px]">
                <Bar data={dailyVolumeData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { color: '#a09d96', font: { family: 'DM Mono', size: 9 }, boxWidth: 8, usePointStyle: true, padding: 12 } }, tooltip: TT }, scales: SC }} />
              </div>
            </div>
            <div className="panel bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-4">
              <div className="panel-label font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-3.5">Hourly activity today</div>
              <div className="chart-wrap relative h-[180px]">
                <Line data={hourlyData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TT }, scales: SC }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'demandsupply' && (
        <div className="tab-content">
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div className="panel bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-4">
              <div className="panel-label font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-3.5">Listing type split</div>
              <div className="chart-wrap relative h-[180px]">
                <Doughnut data={typeDistData} options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { color: '#a09d96', font: { family: 'DM Mono', size: 9 }, boxWidth: 8, usePointStyle: true, padding: 10 } }, tooltip: TT } }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="tab-content">
          <div className="panel bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-4 mb-2.5">
            <div className="panel-label font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-3.5">Supply vs Demand by Location</div>
            {data.topLocations.map((loc: any) => (
              <div key={loc.name} className="loc-row flex items-center gap-2 py-2 border-b border-[rgba(255,255,255,0.03)] last:border-none">
                <div className="loc-name text-[11px] text-[#a09d96] w-24 flex-shrink-0">{loc.name}</div>
                <div className="loc-bars flex-1 flex flex-col gap-0.5">
                  <div className="loc-bar-row flex items-center gap-1.5">
                    <div className="loc-dot w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#6ab0e8]"></div>
                    <div className="loc-track flex-1 h-1 bg-[rgba(255,255,255,0.04)] rounded-sm overflow-hidden">
                      <div className="loc-fill h-full rounded-sm bg-[#6ab0e8] opacity-60" style={{ width: `${Math.min(100, (loc.supply / (data.topLocations[0]?.supply || 1)) * 100)}%` }}></div>
                    </div>
                    <div className="loc-num font-mono text-[9px] text-[#3a3835] w-6 text-right">{loc.supply}</div>
                  </div>
                  <div className="loc-bar-row flex items-center gap-1.5">
                    <div className="loc-dot w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#e8c97a]"></div>
                    <div className="loc-track flex-1 h-1 bg-[rgba(255,255,255,0.04)] rounded-sm overflow-hidden">
                      <div className="loc-fill h-full rounded-sm bg-[#e8c97a] opacity-80" style={{ width: `${Math.min(100, (loc.demand / (data.topLocations[0]?.supply || 1)) * 100)}%` }}></div>
                    </div>
                    <div className="loc-num font-mono text-[9px] text-[#3a3835] w-6 text-right">{loc.demand}</div>
                  </div>
                </div>
                <div className={`badge font-mono text-[9px] px-1.5 py-0.5 rounded-[10px] flex-shrink-0 ${
                  loc.gap === 'hot' ? 'bg-[rgba(107,207,143,0.12)] text-[#6bcf8f]' : 
                  loc.gap === 'balanced' ? 'bg-[rgba(232,201,122,0.12)] text-[#e8c97a]' : 
                  'bg-[rgba(224,112,112,0.12)] text-[#e07070]'
                }`}>{loc.gap}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'brokers' && (
        <div className="tab-content">
          <div className="panel bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-[10px] p-4 mb-2.5">
            <div className="panel-label font-mono text-[9px] text-[#3a3835] uppercase tracking-[0.1em] mb-3.5">Top Brokers by Volume</div>
            {data.topBrokers.map((b: any, i: number) => (
              <div key={b.phone} className="broker-row flex items-center gap-2 py-1.5 border-b border-[rgba(255,255,255,0.03)] last:border-none">
                <div className="bav w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0" style={{
                  background: i === 0 ? 'rgba(107,207,143,0.12)' : i === 1 ? 'rgba(232,201,122,0.12)' : 'rgba(106,176,232,0.12)',
                  color: i === 0 ? '#6bcf8f' : i === 1 ? '#e8c97a' : '#6ab0e8',
                }}>{b.phone.slice(-2)}</div>
                <div className="bname flex-1 text-[11px] text-[#a09d96]">{b.phone}</div>
                <div className="btrack w-14 h-1 bg-[rgba(255,255,255,0.04)] rounded-sm overflow-hidden">
                  <div className="bfill h-full rounded-sm bg-[#e8c97a] opacity-50" style={{ width: `${(b.count / (data.topBrokers[0]?.count || 1)) * 100}%` }}></div>
                </div>
                <div className="bcount font-mono text-[10px] text-[#4a4845] w-6 text-right">{b.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
