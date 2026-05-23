import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../src/middleware/validate';

function createResponse() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe('validate middleware', () => {
    it('overrides getter-only query objects with validated values', () => {
        const req: any = {};
        Object.defineProperty(req, 'query', {
            get: () => ({ page: '2' }),
            enumerable: true,
            configurable: true,
        });
        const res = createResponse();
        const next = vi.fn();

        validate(
            z.object({
                page: z.coerce.number().int().default(1),
                limit: z.coerce.number().int().default(20),
            }),
            'query',
        )(req, res as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(req.query).toEqual({ page: 2, limit: 20 });
        expect(res.status).not.toHaveBeenCalled();
    });
});
