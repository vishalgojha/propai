import { describe, expect, it } from 'vitest';
import { normalizePhoneFromJid } from '../src/utils/whatsappJidPhone';

describe('normalizePhoneFromJid', () => {
    it('keeps standard WhatsApp phone JIDs', () => {
        expect(normalizePhoneFromJid('919820056180@s.whatsapp.net')).toBe('9820056180');
        expect(normalizePhoneFromJid('919820056180@c.us')).toBe('9820056180');
    });

    it('accepts LID participant JIDs when they contain a phone-like identifier', () => {
        expect(normalizePhoneFromJid('49984863002831@lid')).toBe('49984863002831');
    });
});
