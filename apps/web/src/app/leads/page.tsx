'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, MoreVertical, User, MapPin, DollarSign, Calendar, CheckCircle, Plus, ArrowLeft } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';

interface Lead {
    id: string;
    contact_id: string;
    budget: string | null;
    location_pref: string | null;
    timeline: string | null;
    possession: string | null;
    status: 'New' | 'Contacted' | 'Site Visit' | 'Closed';
    current_step: string;
    created_at: string;
}

const COLUMNS = ['New', 'Contacted', 'Site Visit', 'Closed'] as const;

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const loadData = async () => {
            const supabase = getSupabaseClient();
            if (!supabase) {
                router.push('/login');
                return;
            }

            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) {
                router.push('/login');
                return;
            }
            setUser(userData.user);
            await fetchLeads(userData.user.id);
            setLoading(false);
        };
        loadData();
    }, [router]);

    const fetchLeads = async (tenantId: string) => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return;
        }

        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
        if (!error) setLeads(data);
    };

    const updateStatus = async (leadId: string, newStatus: Lead['status']) => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            alert('Supabase is not configured.');
            return;
        }

        const { error } = await supabase
            .from('leads')
            .update({ status: newStatus })
            .eq('id', leadId);
        if (error) alert('Failed to update status');
        else await fetchLeads(user.id);
    };

    if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white">Loading Leads...</div>;

    return (
        <div className="h-screen flex bg-black text-white overflow-hidden font-sans">
            <div className="w-64 glass border-r border-white/10 flex flex-col">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tighter">PropAI Sync</h1>
                </div>
                <nav className="flex-1 px-4 space-y-2">
                    {[
                        { label: 'Overview', path: '/dashboard', active: false },
                        { label: 'Messages', path: '/messages', active: false },
                        { label: 'Leads', path: '/leads', active: true },
                        { label: 'Settings', path: '/settings', active: false },
                    ].map((item) => (
                        <button 
                            key={item.label}
                            onClick={() => router.push(item.path)}
                            className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all ${item.active ? 'bg-white text-black' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 glass border-b border-white/10 flex items-center justify-between px-8">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold">Lead Pipeline</h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input type="text" placeholder="Search leads..." className="bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 w-64" />
                        </div>
                    </div>
                    <button className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Add Lead
                    </button>
                </header>

                <div className="flex-1 overflow-x-auto p-6 bg-black">
                    <div className="flex gap-6 h-full min-w-max">
                        {COLUMNS.map(column => (
                            <div key={column} className="w-80 flex flex-col h-full">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-gray-400 uppercase text-xs tracking-widest">{column}</h3>
                                        <Badge variant={column === 'Closed' ? 'connected' : 'disconnected'}>
                                            {leads.filter(l => l.status === column).length}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                                    {leads.filter(l => l.status === column).map(lead => (
                                        <motion.div 
                                            key={lead.id}
                                            layoutId={lead.id}
                                            onClick={() => setSelectedLead(lead)}
                                            className="p-4 glass rounded-2xl cursor-pointer hover:border-white/30 transition-all group"
                                            whileHover={{ y: -4 }}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                                <MoreVertical className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
                                            </div>
                                            <p className="font-medium mb-3 truncate">Lead #{lead.id.slice(0, 8)}</p>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <DollarSign className="w-3 h-3" /> {lead.budget || 'Not set'}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <MapPin className="w-3 h-3" /> {lead.location_pref || 'Not set'}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {selectedLead && (
                    <motion.div 
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="fixed right-0 top-0 h-full w-full md:w-96 glass border-l border-white/10 z-50 p-8 overflow-y-auto"
                    >
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-bold">Lead Details</h3>
                            <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <ArrowLeft className="w-5 h-5 rotate-180" />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <div className="flex items-center gap-4 p-4 glass rounded-2xl">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                                <div>
                                    <p className="font-bold text-lg">Contact {selectedLead.contact_id.slice(0, 8)}</p>
                                    <Badge variant="connected">{selectedLead.status}</Badge>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500 uppercase font-bold tracking-widest">Budget</label>
                                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                                        <DollarSign className="w-4 h-4 text-blue-400" />
                                        <input type="text" value={selectedLead.budget || ''} onChange={(e) => setSelectedLead({...selectedLead, budget: e.target.value})} className="bg-transparent outline-none w-full text-sm" placeholder="e.g. 2-3 Cr" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500 uppercase font-bold tracking-widest">Preferred Location</label>
                                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                                        <MapPin className="w-4 h-4 text-blue-400" />
                                        <input type="text" value={selectedLead.location_pref || ''} onChange={(e) => setSelectedLead({...selectedLead, location_pref: e.target.value})} className="bg-transparent outline-none w-full text-sm" placeholder="e.g. Sector 62, Gurgaon" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500 uppercase font-bold tracking-widest">Timeline</label>
                                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                                        <Calendar className="w-4 h-4 text-blue-400" />
                                        <input type="text" value={selectedLead.timeline || ''} onChange={(e) => setSelectedLead({...selectedLead, timeline: e.target.value})} className="bg-transparent outline-none w-full text-sm" placeholder="e.g. Within 3 months" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500 uppercase font-bold tracking-widest">Possession</label>
                                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                                        <CheckCircle className="w-4 h-4 text-blue-400" />
                                        <input type="text" value={selectedLead.possession || ''} onChange={(e) => setSelectedLead({...selectedLead, possession: e.target.value})} className="bg-transparent outline-none w-full text-sm" placeholder="e.g. Ready to move" />
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={async () => {
                                    const supabase = getSupabaseClient();
                                    if (!supabase) {
                                        alert('Supabase is not configured.');
                                        return;
                                    }

                                    const { error } = await supabase.from('leads').update({ 
                                        budget: selectedLead.budget,
                                        location_pref: selectedLead.location_pref,
                                        timeline: selectedLead.timeline,
                                        possession: selectedLead.possession
                                    }).eq('id', selectedLead.id);
                                    if (error) alert('Failed to save');
                                    else alert('Lead updated!');
                                }}
                                className="btn-primary w-full py-3 font-bold"
                            >
                                Save Changes
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
