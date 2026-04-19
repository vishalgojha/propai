import { z } from 'zod';

export const BillingTools = {
    check_subscription: {
        description: 'Check the current plan, status, and renewal date for the broker.',
        schema: z.object({}),
    },
    upgrade_plan: {
        description: 'Initiate a plan upgrade. Returns a Razorpay payment link.',
        schema: z.object({
            plan: z.enum(['Pro', 'Team']),
        }),
    },
    cancel_subscription: {
        description: 'Set the current subscription to cancel at the end of the billing cycle.',
        schema: z.object({}),
    },
};
