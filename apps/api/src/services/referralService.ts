import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const REFERRAL_STORE_FILE = path.join(process.cwd(), 'data', 'referrals.json');
const APP_ORIGIN = process.env.APP_ORIGIN || process.env.APP_URL || 'https://app.propai.live';
const ASSISTANT_DISPLAY_NUMBER = '+91 7021045254';
const ASSISTANT_WA_LINK = 'https://wa.me/917021045254';

type ReferralParticipant = {
    tenantId: string;
    email: string | null;
    fullName: string | null;
    code: string;
    referredByTenantId: string | null;
    referredByCode: string | null;
    referredAt: string | null;
    rewardMonthsGranted: number;
    createdAt: string;
    updatedAt: string;
};

type ReferralRecord = {
    referrerTenantId: string;
    referredTenantId: string;
    referredEmail: string | null;
    referredFullName: string | null;
    createdAt: string;
    qualifiedAt: string | null;
};

type ReferralStore = {
    participants: Record<string, ReferralParticipant>;
    referrals: ReferralRecord[];
};

export type ReferralSummary = {
    code: string;
    link: string;
    referredByCode: string | null;
    referredByTenantId: string | null;
    qualifiedReferrals: number;
    pendingReferrals: number;
    progressToNextReward: number;
    freeMonthsEarned: number;
    assistantNumber: string;
    assistantWaLink: string;
    shareMessage: string;
};

function normalizeCode(value?: string | null) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function buildReferralCode(tenantId: string) {
    const digest = crypto.createHash('sha1').update(tenantId).digest('hex').slice(0, 8).toUpperCase();
    return `PROP${digest}`;
}

async function readStore(): Promise<ReferralStore> {
    try {
        const raw = await fs.readFile(REFERRAL_STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return {
                participants: parsed.participants || {},
                referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
            };
        }
    } catch {
        // Ignore missing file / parse failures.
    }

    return { participants: {}, referrals: [] };
}

async function writeStore(store: ReferralStore) {
    await fs.mkdir(path.dirname(REFERRAL_STORE_FILE), { recursive: true });
    await fs.writeFile(REFERRAL_STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function buildShareMessage(summary: ReferralSummary) {
    return [
        `Use my PropAI referral link to start your 3-day free trial: ${summary.link}`,
        'Plans: Trial 3 days free, Solo ₹999/mo (2 WhatsApp devices), Team ₹2999/mo (5 devices).',
        `When 3 referred brokers complete payment, I get 1 free month on PropAI.`,
        `Need help? Message the PropAI Assistant on WhatsApp: ${ASSISTANT_DISPLAY_NUMBER} (${ASSISTANT_WA_LINK})`,
    ].join(' ');
}

export class ReferralService {
    async ensureParticipant(tenantId: string, email?: string | null, fullName?: string | null) {
        const store = await readStore();
        const existing = store.participants[tenantId];
        const now = new Date().toISOString();
        const code = existing?.code || buildReferralCode(tenantId);

        store.participants[tenantId] = {
            tenantId,
            email: existing?.email || email || null,
            fullName: existing?.fullName || fullName || null,
            code,
            referredByTenantId: existing?.referredByTenantId || null,
            referredByCode: existing?.referredByCode || null,
            referredAt: existing?.referredAt || null,
            rewardMonthsGranted: existing?.rewardMonthsGranted || 0,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };

        await writeStore(store);
        return store.participants[tenantId];
    }

    async getSummary(tenantId: string, email?: string | null, fullName?: string | null): Promise<ReferralSummary> {
        const participant = await this.ensureParticipant(tenantId, email, fullName);
        const store = await readStore();
        const referrals = store.referrals.filter((item) => item.referrerTenantId === tenantId);
        const qualifiedReferrals = referrals.filter((item) => Boolean(item.qualifiedAt)).length;
        const pendingReferrals = referrals.length - qualifiedReferrals;
        const progressToNextReward = qualifiedReferrals % 3;
        const summary: ReferralSummary = {
            code: participant.code,
            link: `${APP_ORIGIN}/ref/${participant.code}`,
            referredByCode: participant.referredByCode,
            referredByTenantId: participant.referredByTenantId,
            qualifiedReferrals,
            pendingReferrals,
            progressToNextReward,
            freeMonthsEarned: participant.rewardMonthsGranted || 0,
            assistantNumber: ASSISTANT_DISPLAY_NUMBER,
            assistantWaLink: ASSISTANT_WA_LINK,
            shareMessage: '',
        };
        summary.shareMessage = buildShareMessage(summary);
        return summary;
    }

    async resolveCode(code?: string | null) {
        const normalized = normalizeCode(code);
        if (!normalized) {
            return null;
        }

        const store = await readStore();
        const participant = Object.values(store.participants).find((entry) => normalizeCode(entry.code) === normalized) || null;
        if (!participant) {
            return null;
        }

        return {
            code: participant.code,
            tenantId: participant.tenantId,
            fullName: participant.fullName,
            email: participant.email,
            link: `${APP_ORIGIN}/ref/${participant.code}`,
        };
    }

    async applyReferralCode(tenantId: string, referralCode?: string | null, email?: string | null, fullName?: string | null) {
        const normalized = normalizeCode(referralCode);
        if (!normalized) {
            return this.getSummary(tenantId, email, fullName);
        }

        const participant = await this.ensureParticipant(tenantId, email, fullName);
        const store = await readStore();
        store.participants[tenantId] = participant;
        const referrer = Object.values(store.participants).find((entry) => normalizeCode(entry.code) === normalized) || null;
        if (!referrer || referrer.tenantId === tenantId) {
            return this.getSummary(tenantId, email, fullName);
        }

        const existing = store.participants[tenantId];
        if (!existing?.referredByTenantId) {
            store.participants[tenantId] = {
                ...existing,
                referredByTenantId: referrer.tenantId,
                referredByCode: referrer.code,
                referredAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const alreadyTracked = store.referrals.some(
                (item) => item.referrerTenantId === referrer.tenantId && item.referredTenantId === tenantId,
            );

            if (!alreadyTracked) {
                store.referrals.push({
                    referrerTenantId: referrer.tenantId,
                    referredTenantId: tenantId,
                    referredEmail: email || existing?.email || null,
                    referredFullName: fullName || existing?.fullName || null,
                    createdAt: new Date().toISOString(),
                    qualifiedAt: null,
                });
            }

            await writeStore(store);
        }

        return this.getSummary(tenantId, email, fullName);
    }

    async qualifyPaidReferral(tenantId: string) {
        const store = await readStore();
        const participant = store.participants[tenantId];
        if (!participant?.referredByTenantId) {
            return null;
        }

        const referral = store.referrals.find(
            (item) => item.referrerTenantId === participant.referredByTenantId && item.referredTenantId === tenantId,
        );

        if (!referral || referral.qualifiedAt) {
            return null;
        }

        referral.qualifiedAt = new Date().toISOString();
        const referrer = store.participants[participant.referredByTenantId];
        if (!referrer) {
            await writeStore(store);
            return null;
        }

        const qualifiedCount = store.referrals.filter(
            (item) => item.referrerTenantId === referrer.tenantId && Boolean(item.qualifiedAt),
        ).length;
        const targetRewardMonths = Math.floor(qualifiedCount / 3);
        const rewardDelta = Math.max(0, targetRewardMonths - (referrer.rewardMonthsGranted || 0));

        if (rewardDelta > 0) {
            referrer.rewardMonthsGranted = targetRewardMonths;
            referrer.updatedAt = new Date().toISOString();
            await this.extendSubscriptionByMonths(referrer.tenantId, rewardDelta);
        }

        await writeStore(store);
        return {
            referrerTenantId: referrer.tenantId,
            rewardMonthsGranted: rewardDelta,
            qualifiedCount,
        };
    }

    private async extendSubscriptionByMonths(tenantId: string, months: number) {
        if (months <= 0) return;

        const { data } = await db
            .from('subscriptions')
            .select('tenant_id, plan, status, created_at, renewal_date')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        const baseDate = data?.renewal_date ? new Date(data.renewal_date) : new Date();
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + months * 30);

        await db
            .from('subscriptions')
            .upsert({
                tenant_id: tenantId,
                plan: data?.plan || 'Solo',
                status: data?.status || 'active',
                created_at: data?.created_at || new Date().toISOString(),
                renewal_date: nextDate.toISOString(),
            }, { onConflict: 'tenant_id' });
    }
}

export const referralService = new ReferralService();
