import { describe, expect, it } from 'vitest';
import { sanitizeForWhatsApp } from '../src/whatsapp/sanitizer';

describe('sanitizeForWhatsApp', () => {
    it('converts markdown formatting into WhatsApp-safe formatting', () => {
        const input = '**bold** __italic__ ~~strike~~';
        expect(sanitizeForWhatsApp(input)).toBe('*bold* _italic_ ~strike~');
    });

    it('converts bold markdown at the start of the message', () => {
        const input = '**Hello Vishal!** How can I help?';
        expect(sanitizeForWhatsApp(input)).toBe('*Hello Vishal!* How can I help?');
    });

    it('removes heading and blockquote prefixes', () => {
        const input = '# Heading\n> quoted line';
        expect(sanitizeForWhatsApp(input)).toBe('Heading\nquoted line');
    });

    it('removes code fences and preserves content', () => {
        const input = '```const answer = 42;```';
        expect(sanitizeForWhatsApp(input)).toBe('const answer = 42;');
    });

    it('normalizes markdown bullets into WhatsApp bullets', () => {
        const input = '- first\n* second';
        expect(sanitizeForWhatsApp(input)).toBe('• first\n• second');
    });

    it('unwraps markdown links into raw urls', () => {
        const input = 'See [listing](https://example.com/listing)';
        expect(sanitizeForWhatsApp(input)).toBe('See https://example.com/listing');
    });

    it('collapses excessive blank lines and trims per line', () => {
        const input = '  hello  \n\n\n  world  ';
        expect(sanitizeForWhatsApp(input)).toBe('hello\n\nworld');
    });
});
