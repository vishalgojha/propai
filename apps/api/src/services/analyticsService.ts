import { supabase, supabaseAdmin } from '../config/supabase';
import { whatsappHealthService } from './whatsappHealthService';
import { channelService } from './channelService';

const db = supabaseAdmin || supabase;

type StreamItemRow = {
    type: string | null;
    deal_type: string | null;
    locality: string | null;
    source_phone: string | null;
    confidence_score: number | null;
    created_at: string | null;
};

type NormalizedItem = {
    type: string | null;
    dealType: string | null;
    location: string;
    sourcePhone: string;
    confidence: number;
    createdAt: string | null;
};

type DailyVolume = {
    date: string;
    supply: number;
    demand: number;
};

type HourlyActivity = {
    hour: string;
    count: number;
};

type LocationData = {
    name: string;
    supply: number;
    demand: number;
    ratio: number;
    gap: string;
};

type BrokerData = {
    phone: string;
    count: number;
    avgConfidence: number;
};

type KpiData = {
    totalStream: number;
    requirements: number;
    supply: number;
    dsRatio: number;
    activeBrokers: number;
    channelsCount: number;
};

export type AnalyticsResult = {
    kpi: KpiData;
    dailyVolume: DailyVolume[];
    hourlyActivity: HourlyActivity[];
    topLocations: LocationData[];
    topBrokers: BrokerData[];
    typeDistribution: Record<string, number>;
    health: unknown;
};

async function queryStreamItems(tenantId: string) {
    if (!db) return { data: [] as StreamItemRow[], count: 0 };

    const [streamResult, countResult] = await Promise.all([
        db
            .from('stream_items')
            .select('type, deal_type, locality, source_phone, confidence_score, created_at')
            .order('created_at', { ascending: false })
            .limit(5000),
        db
            .from('stream_items')
            .select('id', { count: 'exact', head: true }),
    ]);

    if (streamResult.error) throw streamResult.error;
    if (countResult.error) throw countResult.error;

    return {
        data: (streamResult.data || []) as StreamItemRow[],
        count: countResult.count || 0,
    };
}

function normalizeItems(rows: StreamItemRow[]): NormalizedItem[] {
    return rows.map(item => ({
        type: item.type,
        dealType: item.deal_type,
        location: item.locality || 'Unknown',
        sourcePhone: item.source_phone || 'Unknown',
        confidence: item.confidence_score || 0,
        createdAt: item.created_at,
    }));
}

function computeDailyVolume(items: NormalizedItem[]): DailyVolume[] {
    const now = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    return last7Days.map(day => {
        const dayItems = items.filter(item => item.createdAt?.startsWith(day));
        return {
            date: day,
            supply: dayItems.filter(i => i.type !== 'Requirement').length,
            demand: dayItems.filter(i => i.type === 'Requirement').length,
        };
    });
}

function computeHourlyActivity(items: NormalizedItem[]): HourlyActivity[] {
    const today = new Date().toISOString().split('T')[0];

    return Array.from({ length: 14 }, (_, i) => {
        const hour = i + 8;
        const count = items.filter(item => {
            if (!item.createdAt?.startsWith(today)) return false;
            return new Date(item.createdAt).getHours() === hour;
        }).length;
        return { hour: `${hour}h`, count };
    });
}

function computeTopLocations(items: NormalizedItem[]): LocationData[] {
    const locationMap = new Map<string, { supply: number; demand: number }>();

    items.forEach(item => {
        const loc = item.location || 'Unknown';
        if (!locationMap.has(loc)) {
            locationMap.set(loc, { supply: 0, demand: 0 });
        }
        const entry = locationMap.get(loc)!;
        if (item.type === 'Requirement') {
            entry.demand += 1;
        } else {
            entry.supply += 1;
        }
    });

    return Array.from(locationMap.entries())
        .map(([name, data]) => ({
            name,
            supply: data.supply,
            demand: data.demand,
            ratio: data.supply > 0 ? +(data.demand / data.supply).toFixed(2) : 0,
            gap: data.demand > data.supply * 0.35 ? 'hot' :
                data.supply > data.demand * 3 ? 'oversupply' : 'balanced',
        }))
        .sort((a, b) => (b.supply + b.demand) - (a.supply + a.demand))
        .slice(0, 10);
}

function computeTopBrokers(items: NormalizedItem[]): BrokerData[] {
    const brokerMap = new Map<string, { count: number; totalConfidence: number }>();

    items.forEach(item => {
        const phone = item.sourcePhone || 'Unknown';
        if (!brokerMap.has(phone)) {
            brokerMap.set(phone, { count: 0, totalConfidence: 0 });
        }
        const entry = brokerMap.get(phone)!;
        entry.count += 1;
        entry.totalConfidence += item.confidence || 0;
    });

    return Array.from(brokerMap.entries())
        .map(([phone, data]) => ({
            phone,
            count: data.count,
            avgConfidence: data.count > 0 ? Math.round(data.totalConfidence / data.count) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

function computeTypeDistribution(items: NormalizedItem[]): Record<string, number> {
    return items.reduce((acc: Record<string, number>, item) => {
        const type = item.dealType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
}

function computeDsRatio(dailyVolume: DailyVolume[]): number {
    return dailyVolume.length > 0
        ? +(dailyVolume.reduce((sum, d) => sum + d.demand, 0) / Math.max(1, dailyVolume.reduce((sum, d) => sum + d.supply, 0))).toFixed(1)
        : 0;
}

export async function getAnalytics(tenantId: string): Promise<AnalyticsResult> {
    const [health, channels, streamData] = await Promise.all([
        whatsappHealthService.getHealth(tenantId).catch(() => null),
        channelService.listChannels(tenantId).catch(() => []),
        queryStreamItems(tenantId),
    ]);

    const items = normalizeItems(streamData.data);
    const dailyVolume = computeDailyVolume(items);
    const hourlyActivity = computeHourlyActivity(items);
    const topLocations = computeTopLocations(items);
    const topBrokers = computeTopBrokers(items);
    const typeDistribution = computeTypeDistribution(items);
    const dsRatio = computeDsRatio(dailyVolume);

    return {
        kpi: {
            totalStream: streamData.count || items.length,
            requirements: items.filter(i => i.type === 'Requirement').length,
            supply: items.filter(i => i.type !== 'Requirement').length,
            dsRatio,
            activeBrokers: topBrokers.length,
            channelsCount: (channels || []).length,
        },
        dailyVolume,
        hourlyActivity,
        topLocations,
        topBrokers,
        typeDistribution,
        health,
    };
}
