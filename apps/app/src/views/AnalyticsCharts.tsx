import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

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
  Filler,
);

export const TT = {
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

export const SC = {
  x: {
    grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
    ticks: { color: '#7c7972', font: { family: 'DM Mono', size: 9 }, maxRotation: 0 },
    border: { display: false },
  },
  y: {
    grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
    ticks: { color: '#7c7972', font: { family: 'DM Mono', size: 9 } },
    border: { display: false },
  },
};

type DailyVolume = { date: string; supply: number; demand: number };
type BhkDemand = { bhk: string; listings: number; requirements: number; gap: number };
type VelocityPoint = { date: string; newListings: number; newRequirements: number; netDemand: number };

const legend = {
  labels: {
    color: '#a09d96',
    font: { family: 'DM Mono', size: 9 },
    boxWidth: 8,
    usePointStyle: true,
    padding: 12,
  },
};

const dateLabel = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export function DailySupplyDemandChart({ rows }: { rows: DailyVolume[] }) {
  const data = {
    labels: rows.map((row) => dateLabel(row.date)),
    datasets: [
      {
        label: 'Supply',
        data: rows.map((row) => row.supply),
        backgroundColor: 'rgba(106,176,232,0.5)',
        borderRadius: 4,
        stack: 'volume',
      },
      {
        label: 'Demand',
        data: rows.map((row) => row.demand),
        backgroundColor: 'rgba(232,201,122,0.75)',
        borderRadius: 4,
        stack: 'volume',
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', ...legend }, tooltip: TT },
        scales: { x: { ...SC.x, stacked: true }, y: { ...SC.y, stacked: true, beginAtZero: true } },
      }}
    />
  );
}

export function BhkGapChart({ rows }: { rows: BhkDemand[] }) {
  const data = {
    labels: rows.map((row) => row.bhk),
    datasets: [
      {
        label: 'Gap',
        data: rows.map((row) => row.gap),
        backgroundColor: rows.map((row) => row.gap >= 0 ? 'rgba(62,232,138,0.68)' : 'rgba(224,112,112,0.68)'),
        borderColor: rows.map((row) => row.gap >= 0 ? 'rgba(62,232,138,0.9)' : 'rgba(224,112,112,0.9)'),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TT,
            callbacks: {
              afterLabel: (context: any) => {
                const row = rows[context.dataIndex];
                return row ? `Listings: ${row.listings} / Requirements: ${row.requirements}` : '';
              },
            },
          },
        },
        scales: {
          x: { ...SC.x, beginAtZero: true },
          y: SC.y,
        },
      }}
    />
  );
}

export function TypeDistributionChart({ values }: { values: Record<string, number> }) {
  const labels = Object.keys(values || {});
  const data = {
    labels,
    datasets: [
      {
        data: labels.map((label) => values[label]),
        backgroundColor: [
          'rgba(62,232,138,0.72)',
          'rgba(106,176,232,0.7)',
          'rgba(232,201,122,0.8)',
          'rgba(224,112,112,0.68)',
          'rgba(167,139,250,0.68)',
        ],
        borderColor: '#0c0c0e',
        borderWidth: 3,
      },
    ],
  };

  return (
    <Doughnut
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { display: true, position: 'bottom', ...legend }, tooltip: TT },
      }}
    />
  );
}

export function VelocityLineChart({ rows }: { rows: VelocityPoint[] }) {
  const data = {
    labels: rows.map((row) => dateLabel(row.date)),
    datasets: [
      {
        label: 'New listings',
        data: rows.map((row) => row.newListings),
        borderColor: 'rgba(106,176,232,0.95)',
        backgroundColor: 'rgba(106,176,232,0.14)',
        fill: true,
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: 'New requirements',
        data: rows.map((row) => row.newRequirements),
        borderColor: 'rgba(232,201,122,0.95)',
        backgroundColor: 'rgba(232,201,122,0.16)',
        fill: true,
        tension: 0.36,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  };

  return (
    <Line
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', ...legend }, tooltip: TT },
        scales: { x: SC.x, y: { ...SC.y, beginAtZero: true } },
      }}
    />
  );
}

export function NetDemandChart({ rows }: { rows: VelocityPoint[] }) {
  const positive = rows.map((row) => Math.max(0, row.netDemand));
  const negative = rows.map((row) => Math.min(0, row.netDemand));
  const data = {
    labels: rows.map((row) => dateLabel(row.date)),
    datasets: [
      {
        label: 'Demand exceeding supply',
        data: positive,
        borderColor: 'rgba(62,232,138,0.95)',
        backgroundColor: 'rgba(62,232,138,0.16)',
        fill: 'origin',
        tension: 0.35,
        pointRadius: 0,
      },
      {
        label: 'Supply exceeding demand',
        data: negative,
        borderColor: 'rgba(224,112,112,0.95)',
        backgroundColor: 'rgba(224,112,112,0.16)',
        fill: 'origin',
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };

  return (
    <Line
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', ...legend }, tooltip: TT },
        scales: {
          x: SC.x,
          y: {
            ...SC.y,
            grid: {
              color: (context: any) => context.tick.value === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.05)',
              drawTicks: false,
            },
          },
        },
      }}
    />
  );
}

export default function AnalyticsCharts() {
  return null;
}
