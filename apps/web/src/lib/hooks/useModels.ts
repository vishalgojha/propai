'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    speed: 'fast' | 'medium' | 'slow';
    cost: 'free' | 'cheap' | 'expensive';
    contextWindow: number;
    isLocal?: boolean;
}

export function useModels() {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchModels = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/ai/models');
            if (!res.ok) throw new Error('Failed to fetch models');
            const data = await res.json();
            setModels(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    return { models, loading, error, refresh: fetchModels };
}
