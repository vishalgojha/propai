import { describe, expect, it } from 'vitest';
import { normalizeIndianPhoneNumber, toIndianWhatsAppNumber } from '../src/utils/phoneNormalization';

describe('phoneNormalization', () => {
    it('normalizes Indian mobile numbers to 10 digits', () => {
        expect(normalizeIndianPhoneNumber('+91 98200-56789')).toBe('9820056789');
        expect(normalizeIndianPhoneNumber('91 9820 056789')).toBe('9820056789');
        expect(normalizeIndianPhoneNumber('09820056789')).toBe('9820056789');
    });

    it('rejects invalid or non-mobile numbers', () => {
        expect(normalizeIndianPhoneNumber('12345')).toBeNull();
        expect(normalizeIndianPhoneNumber('519820056789')).toBeNull();
        expect(normalizeIndianPhoneNumber(null)).toBeNull();
    });

    it('builds WhatsApp-ready numbers', () => {
        expect(toIndianWhatsAppNumber('+91 9820056789')).toBe('919820056789');
        expect(toIndianWhatsAppNumber('abc')).toBeNull();
    });
});
