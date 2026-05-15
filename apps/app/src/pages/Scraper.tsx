import React, { useEffect, useState } from 'react';
import { BotIcon, ActivityIcon, RefreshIcon, MessageSquareTextIcon, GroupsIcon } from '../lib/icons';
import backendApi from '../services/api';

interface ScraperStatus {
    status: string;
    stats: {
        total_listings?: number;
        unique_listings?: number;
        groups_count?: number;
    } | null;
    chats_count: number;
    last_message_at: string | null;
    last_heartbeat: string | null;
}

export default function Scraper() {
    const [status, setStatus] = useState<ScraperStatus | null>(null);
    const [totalListings, setTotalListings] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        try {
            const res = await backendApi.get('/api/scraper/status');
            if (res.data.success) {
                setStatus(res.data.scraper);
                setTotalListings(res.data.total_listings || 0);
                setError(null);
            } else {
                setError(res.data.error || 'Failed to load');
            }
        } catch (e: any) {
            setError(e?.response?.data?.error || e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Scraper</h1>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                    <p className="font-medium">Not reachable</p>
                    <p className="text-sm mt-1">{error}</p>
                    <p className="text-sm mt-2">Make sure the scraper service is running and has sent a heartbeat.</p>
                </div>
                <button onClick={fetchStatus} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Retry
                </button>
            </div>
        );
    }

    const isRunning = status?.status === 'running';
    const lastBeat = status?.last_heartbeat ? new Date(status.last_heartbeat).toLocaleString() : 'Never';
    const lastMsg = status?.last_message_at ? new Date(status.last_message_at).toLocaleString() : 'N/A';

    return (
        <div className="p-6 max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
                <BotIcon className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold">Scraper</h1>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Pipeline Status</h2>
                    <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                        isRunning ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        {isRunning ? 'Running' : status?.status || 'Unknown'}
                    </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <MessageSquareTextIcon className="w-4 h-4" />
                            Listings in DB
                        </div>
                        <p className="text-2xl font-bold">{totalListings.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <ActivityIcon className="w-4 h-4" />
                            Unique
                        </div>
                        <p className="text-2xl font-bold">{status?.stats?.unique_listings?.toLocaleString() || '?'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <GroupsIcon className="w-4 h-4" />
                            Chats
                        </div>
                        <p className="text-2xl font-bold">{status?.chats_count?.toLocaleString() || '?'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <MessageSquareTextIcon className="w-4 h-4" />
                            Last message
                        </div>
                        <p className="text-lg font-bold">{lastMsg}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-2">Service Info</h2>
                <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium text-gray-800">Last heartbeat:</span> {lastBeat}</p>
                    <p><span className="font-medium text-gray-800">Status:</span> {status?.status || 'Unknown'}</p>
                    {status?.stats?.groups_count && (
                        <p><span className="font-medium text-gray-800">Groups tracked:</span> {status.stats.groups_count}</p>
                    )}
                </div>
                <button onClick={fetchStatus} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    Refresh
                </button>
            </div>
        </div>
    );
}
