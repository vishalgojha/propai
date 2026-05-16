import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    from,
    upsert,
} = vi.hoisted(() => ({
    from: vi.fn(),
    upsert: vi.fn(),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: null,
    supabaseAdmin: {
        from,
    },
}));

vi.mock('../src/services/identityService', () => ({
    pushRecentAction: vi.fn(),
}));

vi.mock('../src/services/emailNotificationService', () => ({
    emailNotificationService: {
        sendWelcomeEmail: vi.fn(),
    },
}));

import { saveOnboarding } from '../src/controllers/identityController';
import { emailNotificationService } from '../src/services/emailNotificationService';

function createResponse() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe('identityController saveOnboarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        from.mockReset();
        upsert.mockReset();

        from.mockImplementation((table: string) => {
            if (table === 'broker_identity') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        })),
                    })),
                    upsert: vi.fn(() => ({
                        select: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    broker_id: 'user-1',
                                    full_name: 'Vishal',
                                    agency_name: 'PropAI Realty',
                                    localities: ['Bandra West', 'Andheri West'],
                                    onboarding_completed: true,
                                },
                                error: null,
                            }),
                        })),
                    })),
                };
            }

            if (table === 'profiles') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: {
                                    email: 'vishal@example.com',
                                    full_name: 'Vishal',
                                    phone: '+91 98200 56180',
                                },
                                error: null,
                            }),
                        })),
                    })),
                };
            }

            if (table === 'broker_activity') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: {
                                    phone: '9820056180',
                                    name: null,
                                    agency: null,
                                    localities: [{ locality: 'Bandra West', count: 4, last_seen: '2026-05-10T00:00:00.000Z' }],
                                    first_seen: '2026-05-10T00:00:00.000Z',
                                },
                                error: null,
                            }),
                        })),
                    })),
                    upsert,
                };
            }

            throw new Error(`Unexpected table ${table}`);
        });

        upsert.mockResolvedValue({ error: null });
    });

    it('links and enriches broker activity using profile phone when onboarding payload has no mobile field', async () => {
        const req = {
            user: { id: 'user-1' },
            body: {
                full_name: 'Vishal',
                agency_name: 'PropAI Realty',
                localities: ['Bandra West', 'Andheri West'],
                onboarding_completed: true,
            },
        } as any;
        const res = createResponse();

        await saveOnboarding(req, res as any);

        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            phone: '9820056180',
            user_id: 'user-1',
            name: 'Vishal',
            agency: 'PropAI Realty',
            localities: [
                { locality: 'Bandra West', count: 4, last_seen: '2026-05-10T00:00:00.000Z' },
                expect.objectContaining({ locality: 'Andheri West', count: 0 }),
            ],
        }), { onConflict: 'phone' });

        expect(emailNotificationService.sendWelcomeEmail).toHaveBeenCalledWith({
            to: 'vishal@example.com',
            fullName: 'Vishal',
        });
        expect(res.json).toHaveBeenCalledWith({
            data: expect.objectContaining({
                broker_id: 'user-1',
                onboarding_completed: true,
            }),
            brokerActivity: expect.objectContaining({
                phone: '9820056180',
                user_id: 'user-1',
            }),
        });
    });
});
