import { getSupabaseClient } from '@/lib/supabase';

export const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function apiUrl(path: string): string {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(
    path: string,
    init: RequestInit = {}
): Promise<Response> {
    const headers = new Headers(init.headers);
    const supabase = getSupabaseClient();

    if (supabase) {
        const {
            data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`);
        }
    }

    return fetch(apiUrl(path), {
        ...init,
        headers,
    });
}
