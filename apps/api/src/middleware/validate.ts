import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const details = result.error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return res.status(400).json({ error: 'Validation failed', details });
        }
        (req as unknown as Record<string, unknown>)[source] = result.data;
        next();
    };
}

export const phoneSchema = z.string().transform(v => v.split('').filter(c => c >= '0' && c <= '9').join('')).pipe(z.string().min(10).max(15));

export const jidSchema = z.string().transform(v => v.trim()).pipe(z.string().min(1));
