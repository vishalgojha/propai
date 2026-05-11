import type { IncomingMessageRecord, WhatsAppRuntimeHooks } from '@vishalgojha/whatsapp-baileys-runtime';
import { supabase, supabaseAdmin } from '../config/supabase';
import { emailNotificationService } from '../services/emailNotificationService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { sessionEventService } from '../services/sessionEventService';
import type { GroupMentionListingMatch } from '../services/brokerWorkflowService';

const db = supabaseAdmin || supabase;
const AI_SENDER = 'AI';
const recentSelfChatReplies = new Map<string, number>();

function makeSelfChatReplyKey(tenantId: string, sessionLabel: string | undefined, remoteJid: string, text: string) {
    return `${tenantId}:${sessionLabel || 'default'}:${remoteJid}:${text.trim()}`;
}

function rememberSelfChatReply(tenantId: string, sessionLabel: string | undefined, remoteJid: string, text: string) {
    const key = makeSelfChatReplyKey(tenantId, sessionLabel, remoteJid, text);
    const now = Date.now();
    recentSelfChatReplies.set(key, now);

    for (const [entryKey, timestamp] of recentSelfChatReplies.entries()) {
        if (now - timestamp > 60_000) {
            recentSelfChatReplies.delete(entryKey);
        }
    }
}

function isRecentSelfChatReply(tenantId: string, sessionLabel: string | undefined, remoteJid: string, text: string) {
    const key = makeSelfChatReplyKey(tenantId, sessionLabel, remoteJid, text);
    const timestamp = recentSelfChatReplies.get(key);
    if (!timestamp) {
        return false;
    }

    if (Date.now() - timestamp > 60_000) {
        recentSelfChatReplies.delete(key);
        return false;
    }

    return true;
}

async function sendViaTenantSession(tenantId: string, remoteJid: string, text: string) {
    const { sessionManager } = require('./SessionManager');
    const client = await sessionManager.getSession(tenantId);
    if (!client) {
        throw new Error('No active WhatsApp session found');
    }

    await client.sendText(remoteJid, text);
}

function normalizeComparablePhone(value?: string | null) {
    const digits = String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
    return digits.slice(-10);
}

async function triggerAgent(tenantId: string, remoteJid: string, text: string, sessionLabel?: string) {
    const { agentExecutor } = require('../services/AgentExecutor');
    const { sessionManager } = require('./SessionManager');

    console.log('[SelfChat Debug] triggerAgent START', { tenantId, remoteJid, sessionLabel, textPreview: text?.substring(0, 50) });

    try {
        const response = await agentExecutor.processMessage(tenantId, remoteJid, text, sessionLabel);

        console.log('[SelfChat Debug] Agent response received', { responsePreview: response?.substring(0, 50) });

        const client = await sessionManager.getSession(tenantId, sessionLabel);
        if (!client) {
            throw new Error('No active WhatsApp session found');
        }

        await client.sendText(remoteJid, response);
        rememberSelfChatReply(tenantId, sessionLabel, remoteJid, response);

        await db.from('messages').insert({
            tenant_id: tenantId,
            remote_jid: remoteJid,
            text: response,
            sender: AI_SENDER,
            timestamp: new Date().toISOString(),
        });

        console.log('[SelfChat Debug] Agent response sent successfully');
        await whatsappHealthService.appendEvent(
            tenantId,
            sessionLabel || 'default',
            'agent_reply_sent',
            'PropAI agent replied on WhatsApp.',
            { remoteJid, selfChat: true },
        );
    } catch (error) {
        console.error('[SelfChat Debug] Agent execution FAILED:', error);
        await whatsappHealthService.appendEvent(
            tenantId,
            sessionLabel || 'default',
            'agent_reply_failed',
            error instanceof Error ? error.message : 'Agent execution failed',
            { remoteJid, selfChat: true },
        ).catch(() => undefined);

        try {
            await emailNotificationService.sendCrashReport({
                subject: 'PropAI Agent Crash Report',
                error: error instanceof Error ? error.message : String(error),
                context: { tenantId, remoteJid, sessionLabel, textPreview: text?.substring(0, 100) },
            });
        } catch (e) {
            console.error('[SelfChat Debug] Failed to send crash report:', e);
        }

        const client = await sessionManager.getSession(tenantId, sessionLabel);
        if (client) {
            await client.sendText(remoteJid, 'Sorry, something went wrong. A crash report has been sent to support@propai.live. Please try again.');
        }
    }
}

async function sendAutomatedReply(tenantId: string, remoteJid: string, text: string, sessionLabel?: string) {
    const { sessionManager } = require('./SessionManager');
    const client = await sessionManager.getSession(tenantId, sessionLabel);
    if (!client) {
        throw new Error('No active WhatsApp session found');
    }

    await client.sendText(remoteJid, text);
    rememberSelfChatReply(tenantId, sessionLabel, remoteJid, text);
    await db.from('messages').insert({
        tenant_id: tenantId,
        remote_jid: remoteJid,
        text,
        sender: AI_SENDER,
        timestamp: new Date().toISOString(),
    });
}

async function isDirectParsingEnabled(tenantId: string, sessionLabel?: string) {
    if (!sessionLabel) {
        return false;
    }

    const { data } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', sessionLabel)
        .maybeSingle();

    const sessionData = (data?.session_data && typeof data.session_data === 'object')
        ? data.session_data as Record<string, any>
        : {};

    return sessionData.parseDirectMessages === true || sessionData.parse_direct_messages === true;
}

async function isSelfChatEnabled(tenantId: string, sessionLabel?: string) {
    if (!sessionLabel) {
        return false;
    }

    const { data } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', sessionLabel)
        .maybeSingle();

    const sessionData = (data?.session_data && typeof data.session_data === 'object')
        ? data.session_data as Record<string, any>
        : {};

    return sessionData.selfChatEnabled === true || sessionData.self_chat_enabled === true;
}

async function notifyBroker(tenantId: string, message: string) {
    try {
        const { data: profile } = await db
            .from('profiles')
            .select('phone')
            .eq('id', tenantId)
            .maybeSingle();

        if (!profile?.phone) return;

        const brokerJid = `${profile.phone.replace(/^\+/, '')}@s.whatsapp.net`;
        await sendViaTenantSession(tenantId, brokerJid, message);
    } catch (err) {
        console.error('[notifyBroker] Failed:', err);
    }
}

async function handleVerificationReply(remoteJid: string) {
    const phone = remoteJid.split('@')[0];
    const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .single();

    if (!profile) {
        return false;
    }

    await db
        .from('profiles')
        .update({ phone_verified: true })
        .eq('id', profile.id);

    return true;
}

type LifecycleEmailInput = {
    tenantId: string;
    label: string;
    status: 'connected' | 'disconnected';
    phoneNumber?: string | null;
    fallbackEmail?: string | null;
    fallbackFullName?: string | null;
};

export async function sendWhatsAppLifecycleEmail(input: LifecycleEmailInput) {
    const { tenantId, label, status, phoneNumber, fallbackEmail, fallbackFullName } = input;

    if (tenantId === 'system') {
        return;
    }

    const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('email, full_name')
        .eq('id', tenantId)
        .maybeSingle();

    if (profileError) {
        console.error('[WhatsAppEmail] Failed to load profile for lifecycle email:', profileError);
    }

    const recipientEmail = profile?.email || fallbackEmail || null;
    const recipientName = profile?.full_name || fallbackFullName || null;

    if (!recipientEmail) {
        return;
    }

    const { data: sessionRow, error: sessionError } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', label)
        .maybeSingle();

    if (sessionError) {
        console.error('[WhatsAppEmail] Failed to load session row for lifecycle email:', sessionError);
    }

    const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
        ? sessionRow.session_data as Record<string, any>
        : {};
    const lastNotifiedStatus = typeof sessionData.lastNotifiedStatus === 'string'
        ? sessionData.lastNotifiedStatus
        : null;

    if (lastNotifiedStatus === status) {
        return;
    }

    const delivery = await emailNotificationService.sendWhatsAppStatusEmail({
        to: recipientEmail,
        fullName: recipientName,
        phoneNumber: phoneNumber || sessionData.phoneNumber || null,
        label,
        status,
    });

    if ('success' in delivery && delivery.success === false) {
        return;
    }

    const nextSessionData = {
        ...sessionData,
        lastNotifiedStatus: status,
        lastStatusEmailAt: new Date().toISOString(),
    };

    const { error: updateError } = await db
        .from('whatsapp_sessions')
        .update({ session_data: nextSessionData })
        .eq('tenant_id', tenantId)
        .eq('label', label);

    if (updateError) {
        console.error('[WhatsAppEmail] Failed to persist lifecycle notification marker:', updateError);
    }
}

function isEmojiOnly(text: string) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu;
    return Boolean(text.match(emojiRegex)) && text.replace(/[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '').length === 0;
}

function isRealEstateMessage(text: string): boolean {
    const lower = text.toLowerCase();
    const keywords = [
        // Indian real estate core terms
        'bhk', 'flat', 'apartment', 'villa', 'plot', 'floor', 'terrace',
        // Indian transaction terms
        'rent', 'sale', 'resale', 'lease', 'buy', 'sell', 'booking', 'token', 'advance', 'deposit',
        'emi', 'loan', 'budget', 'price', 'crore', 'cr', 'lakh',
        // Indian property types
        'property', 'residential', 'commercial', 'office space', 'shop', 'warehouse', 'farmhouse', 'land',
        // Indian area/location terms
        'carpet area', 'sqft', 'sq ft', 'sq.ft', 'square feet', 'area', 'gaj', 'bigha', 'katha', 'cent', 'acre',
        // Indian real estate process
        'rera', 'registry', 'stamp duty', 'circle rate', 'agreement', 'possession', 'handover',
        'ready to move', 'under construction', 'new launch', 'site visit', 'floor plan',
        // Indian housing terms
        'society', 'gated', 'amenities', 'maintenance', 'furnished', 'parking', 'builder', 'broker',
        'investment', 'roi',
    ];
    return keywords.some(k => lower.includes(k));
}

function normalizeJid(value?: string | null) {
    const jid = String(value || '').trim();
    const suffixIndex = jid.indexOf('@');
    const separatorIndex = jid.indexOf(':');
    const withoutDevice = separatorIndex >= 0 && suffixIndex > separatorIndex
        ? `${jid.slice(0, separatorIndex)}${jid.slice(suffixIndex)}`
        : jid;

    if (withoutDevice.endsWith('@s.whatsapp.net')) {
        const phone = normalizeComparablePhone(withoutDevice.slice(0, withoutDevice.indexOf('@')));
        return phone ? `${phone}@s.whatsapp.net` : '';
    }

    return withoutDevice;
}

function normalizeMentionToken(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function extractMessageContext(rawMessage: any) {
    const message = rawMessage?.message || {};
    return (
        message?.extendedTextMessage?.contextInfo ||
        message?.imageMessage?.contextInfo ||
        message?.videoMessage?.contextInfo ||
        message?.buttonsResponseMessage?.contextInfo ||
        {}
    ) as Record<string, any>;
}

function extractPropAIMentionQuery(
    event: IncomingMessageRecord,
    _botJids: string[],
): string | null {
    const rawMessage = (event.rawMessage || {}) as any;
    const contextInfo = extractMessageContext(rawMessage);
    const mentionedJids = [
        ...(Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : []),
        ...(Array.isArray(contextInfo?.groupMentions) ? contextInfo.groupMentions.map((entry: any) => entry?.jid || entry?.participant || '') : []),
    ]
        .map(normalizeJid)
        .filter((jid): jid is string => Boolean(jid));

    const quotedParticipant = normalizeJid(
        contextInfo?.participant ||
        contextInfo?.remoteJid ||
        contextInfo?.quotedParticipant ||
        contextInfo?.stanzaIdParticipant,
    );

    const mentionTargets = new Set([
        '917021045254@s.whatsapp.net',
        '7021045254@s.whatsapp.net',
    ]);

    const text = String(event.text || '').trim();
    const lower = normalizeMentionToken(text);
    const hasTextMention = /(^|\s)@propai\b/i.test(text) || /(^|\s)(?:\+?91)?7021045254\b/.test(text) || /(^|\s)(?:\+?91)?917021045254\b/.test(text);
    const hasDirectMention = mentionedJids.some((jid) => mentionTargets.has(jid));
    const hasQuotedMention = Boolean(quotedParticipant) && mentionTargets.has(quotedParticipant);

    if (!hasTextMention && !hasDirectMention && !hasQuotedMention) {
        return null;
    }

    const directTextQuery = text
        .replace(/.*?@propai[\s:,\-]*/i, '')
        .replace(/.*?(?:\+?91)?7021045254[\s:,\-]*/i, '')
        .replace(/.*?(?:\+?91)?917021045254[\s:,\-]*/i, '')
        .trim();

    if (directTextQuery) {
        return directTextQuery;
    }

    if (hasDirectMention) {
        const withoutFirstMentionToken = text
            .replace(/^@\S+\s*/, '')
            .replace(/^(?:\+?91)?7021045254\s*/, '')
            .replace(/^(?:\+?91)?917021045254\s*/, '')
            .trim();
        if (withoutFirstMentionToken) {
            return withoutFirstMentionToken;
        }
    }

    if (hasQuotedMention && lower) {
        return text;
    }

    return null;
}

function formatGroupMentionMatches(matches: GroupMentionListingMatch[]) {
    const lines = ['Top matching listings:'];

    matches.slice(0, 3).forEach((match, index) => {
        const detailParts = [
            match.bhk,
            match.location,
            match.priceLabel,
            match.areaSqft ? `${Math.round(match.areaSqft)} sqft` : null,
        ].filter(Boolean);

        lines.push(
            '',
            `${index + 1}. ${match.title}`,
            detailParts.join(' | '),
            `Broker: ${match.brokerName || 'Unknown broker'}`,
            `Contact: ${match.brokerPhone || match.sourcePhone || 'Not available'}`,
        );
    });

    return lines.join('\n');
}

async function handleGroupMentionSearch(tenantId: string, remoteJid: string, query: string, sessionLabel?: string) {
    const { brokerWorkflowService } = require('../services/brokerWorkflowService');
    const matches = await brokerWorkflowService.matchListingToRequirements(tenantId, query, 3);

    if (!matches.length) {
        await sendAutomatedReply(tenantId, remoteJid, "No matching listings found right now. I'll notify you when something comes in.", sessionLabel);
        return;
    }

    await sendAutomatedReply(tenantId, remoteJid, formatGroupMentionMatches(matches), sessionLabel);
}

async function getBotJids(tenantId: string, sessionLabel?: string): Promise<string[]> {
    let query = db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId);

    if (sessionLabel) {
        query = query.eq('label', sessionLabel);
    }

    const { data } = await query
        .order('last_sync', { ascending: false })
        .limit(1)
        .maybeSingle();
    const sessionData = data?.session_data as { phoneNumber?: string | null; lidJid?: string | null } | null | undefined;
    const jids = [
        sessionData?.phoneNumber ? `${sessionData.phoneNumber}@s.whatsapp.net` : null,
        sessionData?.lidJid,
    ].map(normalizeJid).filter((jid): jid is string => Boolean(jid));
    return jids;
}

async function processInboundMessage(event: IncomingMessageRecord) {
    const { tenantId, remoteJid, text, fromMe, label } = event;
    const isGroup = remoteJid.endsWith('@g.us');

    console.log('[SelfChat Debug] START', { tenantId, label, remoteJid, isGroup, fromMe, textPreview: text?.substring(0, 50) });

    const botJids = await getBotJids(tenantId, label);
    console.log('[SelfChat Debug] botJids resolved:', botJids);

    const rawMessage = event.rawMessage as { key?: { remoteJidAlt?: string | null } } | undefined;
    const messageJids = [remoteJid, rawMessage?.key?.remoteJidAlt]
        .map(normalizeJid)
        .filter((jid): jid is string => Boolean(jid));
    const isSelfChat = !isGroup && messageJids.some((jid) => botJids.includes(jid));
    console.log('[SelfChat Debug] isSelfChat:', isSelfChat, { fromMe, botJids, messageJids });

    // Guardrail: never treat outbound messages to other contacts as "self chat".
    // Self chat should only be the broker messaging their own QR-scanned number.
    const normalizedRemoteJid = normalizeJid(remoteJid);
    const isRemoteBotJid = Boolean(normalizedRemoteJid) && botJids.includes(normalizedRemoteJid);
    const effectiveIsSelfChat = Boolean(isSelfChat && isRemoteBotJid);

    if (effectiveIsSelfChat && fromMe && isRecentSelfChatReply(tenantId, label, remoteJid, text)) {
        return;
    }

    // Self-chat welcome message
    if (effectiveIsSelfChat && text.toUpperCase() === 'HI') {
        const { sessionManager } = require('./SessionManager');
        const client = await sessionManager.getSession(tenantId, label);
        if (client) {
            await client.sendText(remoteJid, 'Hi! 👋 This is PropAI Pulse. Send me any message and I\'ll help you with real estate insights, listings, or requirements. Your messages are processed securely through AI.');
        }
        return;
    }

    const ASSISTANT_PHONE = '7021045254'; // last 10 digits of 917021045254

    const isAssistantSession = botJids.some(
        (jid) => normalizeComparablePhone(jid) === normalizeComparablePhone(ASSISTANT_PHONE)
    );

    // isAssistantDM covers three cases:
    //   1. The connected session IS the assistant number (primary — hardcoded behaviour)
    //   2. Session label is 'Assistant'
    //   3. The remote JID IS the assistant number (legacy: someone DMing that number)
    const normalizedRemote = normalizeComparablePhone(remoteJid.replace('@s.whatsapp.net', '').replace(/^\+/, ''));
    const isAssistantDM = !isGroup && (
        isAssistantSession ||
        label === 'Assistant' ||
        normalizedRemote === normalizeComparablePhone(ASSISTANT_PHONE)
    );

    console.log('[SelfChat Debug] isAssistantSession:', isAssistantSession, 'isAssistantDM:', isAssistantDM);

    const selfChatEnabled = await isSelfChatEnabled(tenantId, label);
    if (effectiveIsSelfChat && !selfChatEnabled) {
        console.log('[SelfChat Debug] Self chat disabled for this session, skipping');
        await whatsappHealthService.appendEvent(
            tenantId,
            label || 'default',
            'self_chat_disabled',
            'Self chat message skipped because self-chat is disabled for this session.',
            { remoteJid },
        ).catch(() => undefined);
        return;
    }

    if (text.toUpperCase() === 'YES') {
        try {
            const verified = await handleVerificationReply(remoteJid);
            if (verified) {
                await sendViaTenantSession(tenantId, remoteJid, 'Verified! ✅ You now have full access to PropAI Pulse. Welcome aboard!');
                return;
            }
        } catch (error) {
            console.error('[SelfChat Debug] Verification reply error:', error);
        }
    }

    // Short-message and emoji filters do NOT apply to assistant or enabled self-chat sessions
    if (text.length < 20 && !fromMe && !effectiveIsSelfChat && !isAssistantDM) {
        console.log('[SelfChat Debug] Message too short, skipping');
        return;
    }

    if (isEmojiOnly(text) && !effectiveIsSelfChat && !isAssistantDM) {
        console.log('[SelfChat Debug] Emoji only, skipping');
        return;
    }

    if (isGroup) {
        const { data: config } = await db
            .from('group_configs')
            .select('behavior')
            .eq('tenant_id', tenantId)
            .eq('group_id', remoteJid)
            .maybeSingle();

        // Default behavior is to parse group messages unless a broker explicitly
        // disables the group (cold-start coverage > opt-in friction).
        if (config && config.behavior !== 'Listen' && config.behavior !== 'AutoReply') {
            console.log('[SelfChat Debug] Group not in Listen/AutoReply mode, skipping');
            return;
        }

        const mentionQuery = extractPropAIMentionQuery(event, botJids);
        if (mentionQuery) {
            console.log('[SelfChat Debug] PropAI group mention detected, routing to listing matcher', { mentionQuery });
            await handleGroupMentionSearch(tenantId, remoteJid, mentionQuery, label);
            return;
        }
    }

    const directParsingEnabled = await isDirectParsingEnabled(tenantId, label);

    // Direct messages are broker-controlled. Only parse them when the session
    // explicitly opts in, or when they are self-chat / assistant review lanes.
    if (!isGroup && !effectiveIsSelfChat && !isAssistantDM && !directParsingEnabled) {
        console.log('[SelfChat Debug] Direct messages not enabled for parsing, skipping');
        await whatsappHealthService.appendEvent(
            tenantId,
            label || 'default',
            'direct_message_skipped',
            'Direct message skipped because direct parsing is disabled for this session.',
            { remoteJid },
        ).catch(() => undefined);
        return;
    }

    // Relevance filter: only process real estate related messages
    if (!effectiveIsSelfChat && !isAssistantDM && !isRealEstateMessage(text)) {
        console.log(`[SelfChat Debug] Non-real-estate message, skipping: ${text.substring(0, 60)}`);
        return;
    }

    console.log('[SelfChat Debug] Calling triggerAgent...');
    try {
        await db.from('messages').insert({
            tenant_id: tenantId,
            remote_jid: remoteJid,
            text,
            sender: remoteJid.split('@')[0],
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[propaiRuntimeHooks] Failed to persist inbound message', { tenantId, remoteJid, error });
    }
    await whatsappHealthService.appendEvent(
        tenantId,
        label || 'default',
        effectiveIsSelfChat ? 'self_chat_received' : (isAssistantDM ? 'assistant_dm_received' : 'message_routed_to_agent'),
        'WhatsApp message routed to PropAI agent.',
        { remoteJid, isGroup, selfChat: effectiveIsSelfChat, assistantDm: isAssistantDM },
    ).catch(() => undefined);
    await triggerAgent(tenantId, remoteJid, text, label);
}

export function createPropAIRuntimeHooks(): WhatsAppRuntimeHooks {
    return {
        onMessage: async (event) => {
            try {
                await processInboundMessage(event);
            } catch (error) {
                console.error('Agent Execution Loop Error:', error);
            }
        },
        onConnectionUpdate: async (event) => {
            try {
                await whatsappHealthService.upsertConnectionSnapshot({
                    tenantId: event.tenantId,
                    sessionLabel: event.label,
                    phoneNumber: event.phoneNumber || null,
                    ownerName: event.ownerName || null,
                    status: event.status,
                });

                if (event.status === 'connected') {
                    void sessionEventService.log(event.tenantId, 'connected', {
                        sessionLabel: event.label,
                        phoneNumber: event.phoneNumber || null,
                    });

                    const { sessionManager } = require('./SessionManager');
                    const client = await sessionManager.getSession(event.tenantId, event.label);
                    if (client) {
                        const groups = await client.getGroups();
                        await whatsappHealthService.syncGroups(event.tenantId, event.label, groups);
                        await whatsappGroupService.syncGroups(event.tenantId, event.label, groups);
                        void sessionEventService.log(event.tenantId, 'groups_synced', {
                            sessionLabel: event.label,
                            count: groups.length,
                            groupNames: groups.slice(0, 20).map((g: { name?: string }) => g.name),
                        });
                    }
                }

                if (event.status === 'connected' || event.status === 'disconnected') {
                    if (event.status === 'disconnected') {
                        void sessionEventService.log(event.tenantId, 'disconnected', {
                            sessionLabel: event.label,
                            phoneNumber: event.phoneNumber || null,
                        });
                    }

                    await sendWhatsAppLifecycleEmail({
                        tenantId: event.tenantId,
                        label: event.label,
                        status: event.status,
                        phoneNumber: event.phoneNumber || null,
                    });
                }
            } catch (error) {
                console.error('[WhatsAppEmail] Connection update notification error:', error);
            }
        },
        onError: async (event) => {
            console.error(`WhatsApp runtime error [${event.stage}] for tenant ${event.tenantId}:`, event.error);
        },
    };
}
