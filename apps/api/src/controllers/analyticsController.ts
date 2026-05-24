import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { getErrorMessage, getErrorStatus, getTenantId, isOwnerSuperAdminEmail } from '../utils/controllerHelpers';
import { parseIndianLocation } from '../utils/locationParser';
import '../types/express';

const db = supabaseAdmin || supabase;
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_PERIODS = new Set([7, 14, 30]);

type DemandSignal = 'high_demand' | 'balanced' | 'oversupplied';

type StreamInsightRow = {
    id: string;
    type: string | null;
    locality: string | null;
    bhk: string | null;
    broker_name?: string | null;
    source_phone: string | null;
    confidence_score: number | string | null;
    created_at: string | null;
    is_read?: boolean | null;
    channel_items?: { id?: string | null; tenant_id?: string | null }[] | null;
};

function isMissingIngestionStatusError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('ingestion_status') && (
        normalized.includes('does not exist') ||
        normalized.includes('schema cache') ||
        normalized.includes('column')
    );
}

function isMissingEmbeddedChannelItemsError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('channel_items') && (
        normalized.includes('relationship') ||
        normalized.includes('schema cache') ||
        normalized.includes('could not find')
    );
}

function isMissingOptionalColumnError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return (normalized.includes('broker_name') || normalized.includes('is_read')) && (
        normalized.includes('does not exist') ||
        normalized.includes('schema cache') ||
        normalized.includes('column')
    );
}

function parseDays(value: unknown) {
    const parsed = Number(value || 30);
    return VALID_PERIODS.has(parsed) ? parsed : 30;
}

async function canReadAllAccounts(req: Request) {
    const email = String(req.user?.email || '').trim().toLowerCase();
    if (isOwnerSuperAdminEmail(email)) return true;
    if (!supabaseAdmin || !req.user?.id) return false;

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('app_role')
        .eq('id', req.user.id)
        .maybeSingle();

    if (error) throw error;
    return data?.app_role === 'super_admin' || data?.app_role === 'admin';
}

async function queryStreamItems(tenantId: string, periodStart: string, allAccounts: boolean) {
    const baseSelect = 'id, type, locality, bhk, broker_name, source_phone, confidence_score, created_at, is_read';
    const safeSelect = 'id, type, locality, bhk, source_phone, confidence_score, created_at';
    const withMatchesSelect = `${baseSelect}, channel_items(id, tenant_id)`;
    const safeWithMatchesSelect = `${safeSelect}, channel_items(id, tenant_id)`;

    const run = (acceptedOnly: boolean, includeMatches: boolean, safeColumns = false) => {
        let query = db
            .from('stream_items')
            .select(safeColumns ? (includeMatches ? safeWithMatchesSelect : safeSelect) : (includeMatches ? withMatchesSelect : baseSelect))
            .gte('created_at', periodStart)
            .order('created_at', { ascending: false })
            .limit(10000);

        if (!allAccounts) {
            query = query.eq('tenant_id', tenantId);
        }

        if (acceptedOnly) {
            query = query.eq('ingestion_status', 'accepted');
        }

        return query;
    };

    let result = await run(true, true);

    if (result.error && isMissingIngestionStatusError(result.error.message)) {
        result = await run(false, true);
    }

    if (result.error && isMissingEmbeddedChannelItemsError(result.error.message)) {
        result = await run(true, false);
        if (result.error && isMissingIngestionStatusError(result.error.message)) {
            result = await run(false, false);
        }
    }

    if (result.error && isMissingOptionalColumnError(result.error.message)) {
        result = await run(true, true, true);
        if (result.error && isMissingIngestionStatusError(result.error.message)) {
            result = await run(false, true, true);
        }
        if (result.error && isMissingEmbeddedChannelItemsError(result.error.message)) {
            result = await run(true, false, true);
            if (result.error && isMissingIngestionStatusError(result.error.message)) {
                result = await run(false, false, true);
            }
        }
    }

    if (result.error) throw result.error;
    return ((result.data || []) as unknown) as StreamInsightRow[];
}

function getStreamKind(type?: string | null): 'listing' | 'requirement' | null {
    const normalized = String(type || '').toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('requirement') || normalized.includes('wanted') || normalized.includes('demand')) {
        return 'requirement';
    }
    if (normalized.includes('listing') || normalized.includes('sale') || normalized.includes('rent') || normalized.includes('supply')) {
        return 'listing';
    }
    return null;
}

function toNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function cleanLabel(value: unknown, fallback: string) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
}

function normalizeBhk(value: unknown) {
    const text = String(value || '').trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const number = Number(match[1]);
    if (!Number.isFinite(number)) return null;
    if (number >= 4) return '4+ BHK';
    return `${Math.round(number)} BHK`;
}

function getTopBhk(counts: Map<string, number>) {
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;
}

function getDemandSignal(listings: number, requirements: number): DemandSignal {
    if (requirements > listings) return 'high_demand';
    if (listings > requirements * 2) return 'oversupplied';
    return 'balanced';
}

function getDateKey(value?: string | null) {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp).toISOString().slice(0, 10);
}

function dateKeysForPeriod(days: number) {
    const today = new Date();
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(today.getTime() - (days - 1 - index) * DAY_MS);
        return date.toISOString().slice(0, 10);
    });
}

function phoneFallback(phone: string) {
    const digits = phone.replace(/\D/g, '');
    return digits ? `Unknown (${digits.slice(-5)})` : 'Unknown broker';
}

export const intelligenceHandler = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const days = parseDays(req.query.days);
    const periodStart = new Date(Date.now() - days * DAY_MS).toISOString();

    try {
        const allAccounts = await canReadAllAccounts(req);
        const rows = await queryStreamItems(tenantId, periodStart, allAccounts);

        const localityMap = new Map<string, {
            listings: number;
            requirements: number;
            bhkCounts: Map<string, number>;
        }>();
        const bhkMap = new Map<string, { listings: number; requirements: number }>();
        const velocityMap = new Map<string, { newListings: number; newRequirements: number }>();
        const brokerMap = new Map<string, {
            brokerName: string;
            phone: string;
            listingCount: number;
            requirementCount: number;
            lastActiveAt: string;
            recentItems: {
                id: string;
                type: string;
                locality: string;
                bhk: string | null;
                createdAt: string;
            }[];
        }>();
        const myByType: Record<string, number> = {};
        const myLocalityMap = new Map<string, number>();

        let totalListings = 0;
        let totalRequirements = 0;
        let unreadCount = 0;
        let matchedRequirementIds = new Set<string>();
        let confidenceTotal = 0;
        let confidenceCount = 0;

        for (const row of rows) {
            const type = cleanLabel(row.type, 'Unknown');
            const kind = getStreamKind(type);
            if (!kind) continue;

            // Only count rows whose core parsed fields are strong enough to support intelligence.
            const resolvedLoc = row.locality ? parseIndianLocation(row.locality) : null;
            if (!resolvedLoc) continue;
            const locality = resolvedLoc.locality;

            const bhk = normalizeBhk(row.bhk);
            const createdAt = row.created_at || new Date(0).toISOString();
            const requirement = kind === 'requirement';

            if (requirement) {
                totalRequirements += 1;
            } else {
                totalListings += 1;
            }

            if (row.is_read === false) {
                unreadCount += 1;
            }

            const confidence = toNumber(row.confidence_score);
            if (confidence != null) {
                confidenceTotal += confidence;
                confidenceCount += 1;
            }

            myByType[type] = (myByType[type] || 0) + 1;
            myLocalityMap.set(locality, (myLocalityMap.get(locality) || 0) + 1);

            const localityStats = localityMap.get(locality) || {
                listings: 0,
                requirements: 0,
                bhkCounts: new Map<string, number>(),
            };
            if (requirement) {
                localityStats.requirements += 1;
            } else {
                localityStats.listings += 1;
            }
            if (bhk) {
                localityStats.bhkCounts.set(bhk, (localityStats.bhkCounts.get(bhk) || 0) + 1);
            }
            localityMap.set(locality, localityStats);

            if (bhk) {
                const bhkStats = bhkMap.get(bhk) || { listings: 0, requirements: 0 };
                if (requirement) {
                    bhkStats.requirements += 1;
                } else {
                    bhkStats.listings += 1;
                }
                bhkMap.set(bhk, bhkStats);
            }

            const dateKey = getDateKey(row.created_at);
            if (dateKey) {
                const velocity = velocityMap.get(dateKey) || { newListings: 0, newRequirements: 0 };
                if (requirement) {
                    velocity.newRequirements += 1;
                } else {
                    velocity.newListings += 1;
                }
                velocityMap.set(dateKey, velocity);
            }

            const phone = cleanLabel(row.source_phone, 'Unknown');
            const brokerName = cleanLabel(row.broker_name, phoneFallback(phone));
            const broker = brokerMap.get(phone) || {
                brokerName,
                phone,
                listingCount: 0,
                requirementCount: 0,
                lastActiveAt: createdAt,
                recentItems: [],
            };
            if (requirement) {
                broker.requirementCount += 1;
            } else {
                broker.listingCount += 1;
            }
            if (new Date(createdAt).getTime() > new Date(broker.lastActiveAt).getTime()) {
                broker.lastActiveAt = createdAt;
            }
            if (broker.recentItems.length < 5) {
                broker.recentItems.push({
                    id: row.id,
                    type,
                    locality,
                    bhk,
                    createdAt,
                });
            }
            brokerMap.set(phone, broker);

            const matches = Array.isArray(row.channel_items)
                ? row.channel_items.filter((item) => allAccounts || !item.tenant_id || item.tenant_id === tenantId)
                : [];
            if (requirement && matches.length > 0) {
                matchedRequirementIds.add(row.id);
            }
        }

        const marketPulse = [...localityMap.entries()]
            .map(([locality, stats]) => ({
                locality,
                listings: stats.listings,
                requirements: stats.requirements,
                demandSignal: getDemandSignal(stats.listings, stats.requirements),
                topBhk: getTopBhk(stats.bhkCounts),
            }))
            .sort((left, right) => (right.listings + right.requirements) - (left.listings + left.requirements));

        const bhkOrder = ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'];
        const bhkDemand = bhkOrder.map((bhk) => {
            const stats = bhkMap.get(bhk) || { listings: 0, requirements: 0 };
            return {
                bhk,
                listings: stats.listings,
                requirements: stats.requirements,
                gap: stats.requirements - stats.listings,
            };
        });

        const velocity = dateKeysForPeriod(days).map((date) => {
            const stats = velocityMap.get(date) || { newListings: 0, newRequirements: 0 };
            return {
                date,
                newListings: stats.newListings,
                newRequirements: stats.newRequirements,
                netDemand: stats.newRequirements - stats.newListings,
            };
        });

        const brokerLeaderboard = [...brokerMap.values()]
            .sort((left, right) => {
                const activityDelta = (right.listingCount + right.requirementCount) - (left.listingCount + left.requirementCount);
                if (activityDelta !== 0) return activityDelta;
                return new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime();
            })
            .slice(0, 100);

        const byLocality = [...myLocalityMap.entries()]
            .map(([locality, count]) => ({ locality, count }))
            .sort((left, right) => right.count - left.count || left.locality.localeCompare(right.locality))
            .slice(0, 20);

        res.json({
            success: true,
            scope: allAccounts ? 'all_accounts' : 'workspace',
            validRows: totalListings + totalRequirements,
            marketPulse,
            bhkDemand,
            velocity,
            brokerLeaderboard,
            myInventory: {
                totalListings,
                totalRequirements,
                unreadCount,
                matchedCount: matchedRequirementIds.size,
                avgConfidence: confidenceCount > 0 ? Math.round(confidenceTotal / confidenceCount) : 0,
                byType: myByType,
                byLocality,
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load intelligence analytics') });
    }
};
