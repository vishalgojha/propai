import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        full_name?: string | null;
        name?: string | null;
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
        is_impersonation?: boolean;
        impersonated_by?: string;
      };
      tenantId?: string;
    }
  }
}
