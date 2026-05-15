import type { IncomingMessageRecord } from '@vishalgojha/whatsapp-baileys-runtime';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { emailNotificationService } from '../../services/emailNotificationService';
import type { GroupMentionListingMatch } from '../../services/brokerWorkflowService';
import { sessionEventService } from '../../services/sessionEventService';
import { whatsappHealthService } from '../../services/whatsappHealthService';
import { getWhatsAppGateway } from '../../channel-gateways/whatsapp/whatsappGatewayRegistry';

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

function normalizeComparablePhone(value?: string | null) {
    const digits = String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
    return digits.slice(-10);
}

async function sendViaTenantSession(tenantId: string, remoteJid: string, text: string, sessionLabel?: string) {
    await getWhatsAppGateway(tenantId).sendMessage({
        workspaceOwnerId: tenantId,
        sessionLabel,
        remoteJid,
        text,
    });
}

async function triggerAgent(tenantId: string, remoteJid: string, text: string, sessionLabel?: string) {
    const { agentExecutor } = require('../../services/AgentExecutor');

    try {
        const response = await agentExecutor.processMessage(tenantId, remoteJid, text, sessionLabel);
        await sendViaTenantSession(tenantId, remoteJid, response, sessionLabel);
        rememberSelfChatReply(tenantId, sessionLabel, remoteJid, response);

        await db.from('messages').insert({
            tenant_id: tenantId,
            remote_jid: remoteJid,
            text: response,
            sender: AI_SENDER,
            timestamp: new Date().toISOString(),
        });

        await whatsappHealthService.appendEvent(
            tenantId,
            sessionLabel || 'default',
            'agent_reply_sent',
            'PropAI agent replied on WhatsApp.',
            { remoteJid, selfChat: true },
        );
    } catch (error) {
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
        } catch (reportError) {
            console.error('[SelfChat Debug] Failed to send crash report:', reportError);
        }

        try {
            await sendViaTenantSession(
                tenantId,
                remoteJid,
                'Sorry, something went wrong. A crash report has been sent to support@propai.live. Please try again.',
                sessionLabel,
            );
        } catch (sendError) {
            console.error('[SelfChat Debug] Failed to send fallback response:', sendError);
        }
    }
}

async function sendAutomatedReply(tenantId: string, remoteJid: string, text: string, sessionLabel?: string) {
    await sendViaTenantSession(tenantId, remoteJid, text, sessionLabel);
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

function isEmojiOnly(text: string) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu;
    return Boolean(text.match(emojiRegex)) && text.replace(/[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '').length === 0;
}

function isRealEstateMessage(text: string): boolean {
    const lower = text.toLowerCase();
    const keywords = [
        'bhk', 'flat', 'apartment', 'villa', 'plot', 'floor', 'terrace',
        'rent', 'sale', 'resale', 'lease', 'buy', 'sell', 'booking', 'token', 'advance', 'deposit',
        'emi', 'loan', 'budget', 'price', 'crore', 'cr', 'lakh',
        'property', 'residential', 'commercial', 'office space', 'shop', 'warehouse', 'farmhouse', 'land',
        'carpet area', 'sqft', 'sq ft', 'sq.ft', 'square feet', 'area', 'gaj', 'bigha', 'katha', 'cent', 'acre',
        'rera', 'registry', 'stamp duty', 'circle rate', 'agreement', 'possession', 'handover',
        'ready to move', 'under construction', 'new launch', 'site visit', 'floor plan',
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

function extractPropAIMentionQuery(event: IncomingMessageRecord): string | null {
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
    const { brokerWorkflowService } = require('../../services/brokerWorkflowService');
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

export async function processWhatsAppInboundMessage(event: IncomingMessageRecord) {
    const { tenantId, remoteJid, text, fromMe, label } = event;
    const isGroup = remoteJid.endsWith('@g.us');
    const botJids = await getBotJids(tenantId, label);
    const rawMessage = event.rawMessage as { key?: { remoteJidAlt?: string | null } } | undefined;
    const messageJids = [remoteJid, rawMessage?.key?.remoteJidAlt]
        .map(normalizeJid)
        .filter((jid): jid is string => Boolean(jid));
    const isSelfChat = !isGroup && messageJids.some((jid) => botJids.includes(jid));
    const normalizedRemoteJid = normalizeJid(remoteJid);
    const isRemoteBotJid = Boolean(normalizedRemoteJid) && botJids.includes(normalizedRemoteJid);
    const effectiveIsSelfChat = Boolean(isSelfChat && isRemoteBotJid);

    if (effectiveIsSelfChat && fromMe && isRecentSelfChatReply(tenantId, label, remoteJid, text)) {
        return;
    }

    if (effectiveIsSelfChat && text.toUpperCase() === 'HI') {
        await sendViaTenantSession(
            tenantId,
            remoteJid,
            'Hi! 👋 This is PropAI Pulse. Send me any message and I\'ll help you with real estate insights, listings, or requirements. Your messages are processed securely through AI.',
            label,
        );
        return;
    }

    const ASSISTANT_PHONE = '7021045254';
    const isAssistantSession = botJids.some(
        (jid) => normalizeComparablePhone(jid) === normalizeComparablePhone(ASSISTANT_PHONE)
    );
    const normalizedRemote = normalizeComparablePhone(remoteJid.replace('@s.whatsapp.net', '').replace(/^\+/, ''));
    const isAssistantDM = !isGroup && (
        isAssistantSession ||
        label === 'Assistant' ||
        normalizedRemote === normalizeComparablePhone(ASSISTANT_PHONE)
    );

    const selfChatEnabled = await isSelfChatEnabled(tenantId, label);
    if (effectiveIsSelfChat && !selfChatEnabled) {
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
                await sendViaTenantSession(tenantId, remoteJid, 'Verified! ✅ You now have full access to PropAI Pulse. Welcome aboard!', label);
                return;
            }
        } catch (error) {
            console.error('[SelfChat Debug] Verification reply error:', error);
        }
    }

    if (text.length < 20 && !fromMe && !effectiveIsSelfChat && !isAssistantDM) {
        return;
    }

    if (isEmojiOnly(text) && !effectiveIsSelfChat && !isAssistantDM) {
        return;
    }

    if (isGroup) {
        const { data: config } = await db
            .from('group_configs')
            .select('behavior')
            .eq('tenant_id', tenantId)
            .eq('group_id', remoteJid)
            .maybeSingle();

        if (config && config.behavior !== 'Listen' && config.behavior !== 'AutoReply') {
            return;
        }

        const mentionQuery = extractPropAIMentionQuery(event);
        if (mentionQuery) {
            await handleGroupMentionSearch(tenantId, remoteJid, mentionQuery, label);
            return;
        }
    }

    const directParsingEnabled = await isDirectParsingEnabled(tenantId, label);
    if (!isGroup && !effectiveIsSelfChat && !isAssistantDM && !directParsingEnabled) {
        await whatsappHealthService.appendEvent(
            tenantId,
            label || 'default',
            'direct_message_skipped',
            'Direct message skipped because direct parsing is disabled for this session.',
            { remoteJid },
        ).catch(() => undefined);
        return;
    }

    if (!effectiveIsSelfChat && !isAssistantDM && !isRealEstateMessage(text)) {
        return;
    }

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
