import React from 'react';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { SmartphoneIcon, SearchIcon, RefreshIcon, LoaderIcon } from '../lib/icons';

type DmContact = {
  remote_jid: string;
  label: string;
  name: string | null;
  phone: string | null;
  updated_at: string;
};

const formatTime = (v?: string | null) =>
  v ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(v)) : '--';

export const BrokerContacts: React.FC = () => {
  const [contacts, setContacts] = React.useState<DmContact[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const resp = await backendApi.get(ENDPOINTS.dmContacts.list, { params: { label: 'realtor' } });
      setContacts((resp.data as any)?.contacts || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => `${c.name || ''} ${c.phone || ''} ${c.remote_jid}`.toLowerCase().includes(q));
  }, [contacts, search]);

  return (
    <div className="rounded-[28px] border border-[#202c33] bg-[#111b21] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Broker Contacts</h2>
          <p className="text-sm text-[#8696a0]">DM contacts tagged as realtor — parsed into broker profiles</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-full bg-[#202c33] px-3 py-1.5 text-xs font-semibold text-[#d1d7db] hover:text-white"
        >
          {loading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or JID"
          className="w-full rounded-lg border border-transparent bg-[#202c33] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-[#8696a0] focus:border-[#00a884]"
        />
      </div>

      <div className="space-y-2">
        {filtered.map(c => (
          <div key={c.remote_jid} className="flex items-center gap-3 rounded-lg bg-[#1f2c33] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#233138] text-[#00a884]">
              <SmartphoneIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{c.name || 'Unknown'}</p>
              <p className="text-xs text-[#8696a0]">{c.phone ? `+${c.phone}` : c.remote_jid}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[#8696a0]">Tagged {formatTime(c.updated_at)}</span>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[#8696a0]">No broker contacts yet. Tag a DM as Realtor from the Inbox.</p>
        )}
      </div>
    </div>
  );
};
