import React, { useEffect, useState, useCallback } from 'react';
import backendApi from '../services/api';
import { CheckCircleIcon, XIcon, RefreshIcon, AlertTriangleIcon } from '../lib/icons';

interface FlaggedParse {
    id: string;
    raw_text: string;
    ai_extracted: any;
    confidence: number;
    flag_reason: string;
    status: string;
    created_at: string;
}

export default function FlaggedParses() {
    const [items, setItems] = useState<FlaggedParse[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [actionId, setActionId] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const res = await backendApi.get('/api/intelligence/flagged?status=pending&limit=50');
            setItems(res.data.data || []);
            setTotal(res.data.count || 0);
        } catch (e: any) {
            console.error(e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetch(); }, [fetch]);

    const review = async (id: string, status: 'reviewed' | 'dismissed') => {
        setActionId(id);
        try {
            await backendApi.post(`/api/intelligence/flagged/${id}/review`, { status });
            setItems((prev) => prev.filter((i) => i.id !== id));
        } catch (e: any) {
            console.error(e);
        }
        setActionId(null);
    };

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Flagged Parses</h1>
                <button onClick={fetch} style={{ background: 'none', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshIcon /> Refresh
                </button>
            </div>

            {total > 0 && (
                <p style={{ color: '#888', marginBottom: 16 }}>{total} pending review</p>
            )}

            {loading ? (
                <p style={{ color: '#888' }}>Loading...</p>
            ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
                    <AlertTriangleIcon style={{ width: 40, height: 40, marginBottom: 12 }} />
                    <p>No flagged parses. All clear!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {items.map((item) => {
                        const extracted = item.ai_extracted || {};
                        return (
                            <div key={item.id} style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 16 }}>
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>RAW MESSAGE</div>
                                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.raw_text}</p>
                                </div>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                                    <div>
                                        <span style={{ color: '#666' }}>AI:</span>{' '}
                                        {extracted.bhk || '?'} | {extracted.locality || '?'} | {extracted.type || '?'}
                                    </div>
                                    <div>
                                        <span style={{ color: '#666' }}>Price:</span> {extracted.price_label || 'N/A'}
                                    </div>
                                    <div>
                                        <span style={{ color: '#666' }}>Conf:</span>{' '}
                                        <span style={{ color: item.confidence < 0.3 ? '#f44' : '#ea0' }}>
                                            {Math.round(item.confidence * 100)}%
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: '#666' }}>Flags:</span> {item.flag_reason}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => review(item.id, 'reviewed')}
                                        disabled={actionId === item.id}
                                        style={{ background: '#1a6d3c', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                                    >
                                        <CheckCircleIcon /> Accept
                                    </button>
                                    <button
                                        onClick={() => review(item.id, 'dismissed')}
                                        disabled={actionId === item.id}
                                        style={{ background: '#333', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                                    >
                                        <XIcon /> Dismiss
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
