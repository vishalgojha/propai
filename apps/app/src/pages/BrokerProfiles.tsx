import React, { useEffect, useState, useCallback } from 'react';
import backendApi from '../services/api';
import { SearchIcon, RefreshIcon, BotIcon, UsersIcon } from '../lib/icons';

interface BrokerProfile {
    phone: string;
    name: string | null;
    agency: string | null;
    localities: { locality: string; count: number; last_seen: string }[];
    listing_count: number;
    requirement_count: number;
    avg_price_listing: number | null;
    avg_price_requirement: number | null;
    groups: { group_name: string; group_id: string; count: number }[];
    last_active: string | null;
    first_seen: string | null;
    total_messages: number;
    monthly_activity: Record<string, number>;
}

export default function BrokerProfiles() {
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<BrokerProfile | null>(null);

    const fetch = useCallback(async (q?: string) => {
        setLoading(true);
        try {
            const params: any = { limit: 100 };
            if (q) params.search = q;
            const res = await backendApi.get('/api/intelligence/brokers', { params });
            setBrokers(res.data.data || []);
            setTotal(res.data.count || 0);
        } catch (e: any) {
            console.error(e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetch(); }, [fetch]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetch(search);
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Broker Profiles</h1>
                <button onClick={() => fetch(search)} style={{ background: 'none', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshIcon /> Refresh
                </button>
            </div>

            <form onSubmit={handleSearch} style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ flex: 1, background: '#0d1a26', border: '1px solid #223243', borderRadius: 8, padding: '10px 14px', color: '#ccc', fontSize: 13 }}
                />
                <button type="submit" style={{ background: '#1a3a5c', border: 'none', borderRadius: 8, padding: '10px 16px', color: '#fff', cursor: 'pointer' }}>
                    <SearchIcon /> Search
                </button>
            </form>

            {total > 0 && (
                <p style={{ color: '#888', marginBottom: 16, fontSize: 13 }}>
                    {total} broker{total !== 1 ? 's' : ''} tracked
                    {search && ` matching "${search}"`}
                </p>
            )}

            {loading ? (
                <p style={{ color: '#888' }}>Loading...</p>
            ) : brokers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
                    <UsersIcon style={{ width: 40, height: 40, marginBottom: 12 }} />
                    <p>No broker profiles yet. Profiles build automatically as messages are parsed.</p>
                </div>
            ) : selected ? (
                <BrokerDetail broker={selected} onBack={() => setSelected(null)} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {brokers.map((broker) => (
                        <div
                            key={broker.phone}
                            onClick={() => setSelected(broker)}
                            style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 14, cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <strong style={{ fontSize: 14 }}>{broker.name || 'Unknown'}</strong>
                                    <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>{broker.phone}</span>
                                    {broker.agency && <span style={{ color: '#5a8', marginLeft: 8, fontSize: 12 }}>{broker.agency}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#888' }}>
                                    <span>{broker.listing_count} L / {broker.requirement_count} R</span>
                                    <span>{broker.total_messages} total</span>
                                </div>
                            </div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                                {(broker.localities || []).slice(0, 5).map((l: any) => (
                                    <span key={l.locality} style={{ background: '#1a2a3a', borderRadius: 4, padding: '2px 8px' }}>
                                        {l.locality} <span style={{ color: '#666' }}>{l.count}</span>
                                    </span>
                                ))}
                                {(broker.localities || []).length > 5 && (
                                    <span style={{ color: '#666' }}>+{broker.localities.length - 5} more</span>
                                )}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 11, color: '#555' }}>
                                Last active: {broker.last_active ? new Date(broker.last_active).toLocaleDateString() : 'never'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function BrokerDetail({ broker, onBack }: { broker: BrokerProfile; onBack: () => void }) {
    return (
        <div>
            <button onClick={onBack} style={{ background: 'none', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: '#888', marginBottom: 16, fontSize: 12 }}>
                ← Back
            </button>

            <div style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{broker.name || 'Unknown'}</h2>
                <p style={{ color: '#888', margin: '4px 0', fontSize: 13 }}>{broker.phone}</p>
                {broker.agency && <p style={{ color: '#5a8', margin: '4px 0', fontSize: 13 }}>{broker.agency}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
                    <div style={{ background: '#0d1a26', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: '#4af' }}>{broker.total_messages}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Total Messages</div>
                    </div>
                    <div style={{ background: '#0d1a26', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: '#4f8' }}>{broker.listing_count}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Listings</div>
                    </div>
                    <div style={{ background: '#0d1a26', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: '#fa4' }}>{broker.requirement_count}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Requirements</div>
                    </div>
                    <div style={{ background: '#0d1a26', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>{(broker.localities || []).length}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Localities</div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 16 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#aaa' }}>Localities</h3>
                    {(broker.localities || []).length === 0 ? (
                        <p style={{ color: '#555', fontSize: 12 }}>No locality data yet</p>
                    ) : (
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: '#666', borderBottom: '1px solid #223243' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Locality</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Count</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(broker.localities || []).sort((a: any, b: any) => b.count - a.count).map((l: any) => (
                                    <tr key={l.locality} style={{ borderBottom: '1px solid #1a2a3a' }}>
                                        <td style={{ padding: '6px 8px' }}>{l.locality}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{l.count}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#666' }}>
                                            {new Date(l.last_seen).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 16 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#aaa' }}>Groups</h3>
                    {(broker.groups || []).length === 0 ? (
                        <p style={{ color: '#555', fontSize: 12 }}>No group data yet</p>
                    ) : (
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: '#666', borderBottom: '1px solid #223243' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Group</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Messages</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(broker.groups || []).sort((a: any, b: any) => b.count - a.count).map((g: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #1a2a3a' }}>
                                        <td style={{ padding: '6px 8px' }}>{g.group_name || g.group_id}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{g.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <h3 style={{ margin: '16px 0 12px', fontSize: 14, color: '#aaa' }}>Monthly Activity</h3>
                    {Object.keys(broker.monthly_activity || {}).length === 0 ? (
                        <p style={{ color: '#555', fontSize: 12 }}>No activity data yet</p>
                    ) : (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'end', height: 60 }}>
                            {Object.entries(broker.monthly_activity || {})
                                .sort(([a], [b]) => a.localeCompare(b))
                                .slice(-12)
                                .map(([month, count]) => {
                                    const max = Math.max(...Object.values(broker.monthly_activity || {}));
                                    const h = max > 0 ? (count as number / max) * 50 : 0;
                                    return (
                                        <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ width: '100%', background: '#2a4a6a', borderRadius: '3px 3px 0 0', height: Math.max(h, 4), minHeight: 4 }} />
                                            <span style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{month.slice(5)}</span>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ background: '#141d27', border: '1px solid #223243', borderRadius: 12, padding: 16, marginTop: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#aaa' }}>Pricing</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 11, color: '#666' }}>Avg Listing Price</div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {broker.avg_price_listing ? `₹${(broker.avg_price_listing / 10000000).toFixed(2)} Cr` : 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: '#666' }}>Avg Requirement Budget</div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {broker.avg_price_requirement ? `₹${(broker.avg_price_requirement / 10000000).toFixed(2)} Cr` : 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: '#666' }}>First Seen</div>
                        <div style={{ fontSize: 14, color: '#888' }}>
                            {broker.first_seen ? new Date(broker.first_seen).toLocaleDateString() : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
