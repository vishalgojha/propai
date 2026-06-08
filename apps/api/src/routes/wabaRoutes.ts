import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { EmbeddedSignupService } from '../services/embeddedSignupService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';

const router = Router();
const embeddedSignupService = new EmbeddedSignupService();

router.use(authMiddleware);

/**
 * POST /api/waba/exchange-token
 * Exchange short-lived token from Embedded Signup for long-lived token,
 * discover WABA accounts, and save credentials.
 */
router.post('/exchange-token', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { shortLivedToken, metaAppId, metaAppSecret } = req.body;
        if (!shortLivedToken) {
            return res.status(400).json({ error: 'shortLivedToken is required' });
        }

        const appId = metaAppId || process.env.META_APP_ID;
        const appSecret = metaAppSecret || process.env.META_APP_SECRET;

        if (!appId || !appSecret) {
            return res.status(400).json({ error: 'META_APP_ID and META_APP_SECRET must be configured' });
        }

        // Step A: Exchange token
        const tokenResult = await embeddedSignupService.exchangeToken(shortLivedToken, appId, appSecret);

        // Step B: Discover WABA accounts
        const accounts = await embeddedSignupService.getWabaAccounts(tokenResult.accessToken);

        if (accounts.length === 0) {
            return res.status(404).json({
                error: 'No WhatsApp Business Accounts found. Ensure your Meta app has "Facebook Login for Business" use case enabled.',
            });
        }

        // Step C: Save credentials for each phone number
        const savedAccounts: Array<{
            businessAccountId: string;
            businessAccountName: string;
            phoneNumberId: string;
            phoneNumber: string;
        }> = [];

        for (const account of accounts) {
            for (const phone of account.phoneNumbers) {
                await embeddedSignupService.saveCredentials({
                    tenantId: userId,
                    businessAccountId: account.businessAccountId,
                    businessAccountName: account.businessAccountName,
                    phoneNumberId: phone.phoneNumberId,
                    phoneNumber: phone.displayPhoneNumber,
                    accessToken: tokenResult.accessToken,
                    tokenExpiresAt: tokenResult.expiresIn
                        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
                        : null,
                    tokenScope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
                    metaAppId: appId,
                    embeddedSignupData: {
                        account,
                        phone,
                        tokenExpiresIn: tokenResult.expiresIn,
                    },
                });

                savedAccounts.push({
                    businessAccountId: account.businessAccountId,
                    businessAccountName: account.businessAccountName,
                    phoneNumberId: phone.phoneNumberId,
                    phoneNumber: phone.displayPhoneNumber,
                });
            }
        }

        res.json({
            success: true,
            accounts: savedAccounts,
            message: `Successfully connected ${savedAccounts.length} phone number(s)`,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to exchange token') });
    }
});

/**
 * GET /api/waba/credentials
 * Get active WABA credentials for current tenant
 */
router.get('/credentials', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const credentials = await embeddedSignupService.getCredentials(userId);
        res.json(credentials);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WABA credentials') });
    }
});

/**
 * DELETE /api/waba/credentials/:phoneNumberId
 * Disconnect a WABA account
 */
router.delete('/credentials/:phoneNumberId', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { phoneNumberId } = req.params;

        const { error } = await (await import('../config/supabase')).supabase
            .from('waba_credentials')
            .update({ is_active: false })
            .eq('tenant_id', userId)
            .eq('phone_number_id', phoneNumberId);

        if (error) {
            throw new Error(error.message);
        }

        res.json({ success: true, message: 'WABA account disconnected' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to disconnect WABA') });
    }
});

export default router;
