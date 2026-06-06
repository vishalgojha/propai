import { describe, expect, it } from 'vitest';
import { resolveProcessRole, shouldRunApiSurface, shouldRunWhatsAppRuntime } from '../src/runtime/processRole';

describe('processRole', () => {
    it('defaults to all for empty or unknown values', () => {
        expect(resolveProcessRole(undefined)).toBe('all');
        expect(resolveProcessRole(null)).toBe('all');
        expect(resolveProcessRole('')).toBe('all');
        expect(resolveProcessRole('unknown')).toBe('all');
    });

    it('maps worker aliases to whatsapp role', () => {
        expect(resolveProcessRole('whatsapp')).toBe('whatsapp');
        expect(resolveProcessRole('worker')).toBe('whatsapp');
        expect(resolveProcessRole('ingestion')).toBe('whatsapp');
    });

    it('returns the correct feature gates for each role', () => {
        expect(shouldRunApiSurface('all')).toBe(true);
        expect(shouldRunWhatsAppRuntime('all')).toBe(true);

        expect(shouldRunApiSurface('api')).toBe(true);
        expect(shouldRunWhatsAppRuntime('api')).toBe(false);

        expect(shouldRunApiSurface('whatsapp')).toBe(false);
        expect(shouldRunWhatsAppRuntime('whatsapp')).toBe(true);
    });
});
