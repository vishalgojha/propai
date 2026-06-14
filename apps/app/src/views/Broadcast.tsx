import React from 'react';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { handleApiError } from '../services/api';
import { cn } from '../lib/utils';

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';

interface Campaign {
  id: string;
  name: string;
  message: string;
  media_url: string | null;
  audience_type: string;
  total_recipients: number;
  status: CampaignStatus;
  diagnostics?: BroadcastCampaignDiagnostic | null;
  created_at: string;
  updated_at: string;
}

interface CampaignStats {
  total: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  blocked: number;
}

interface BroadcastCampaignDiagnostic {
  senderLabel: string;
  senderStatus: string;
  senderConnected: boolean;
  senderOwnerName: string | null;
  senderPhoneNumber: string | null;
  startBlocker: string | null;
  lastApiError: string | null;
  lastApiErrorAt: string | null;
}

interface BroadcastList {
  id: string;
  name: string;
  contact_count: number;
  auto_generated: boolean;
}

type AudienceMode = 'list' | 'segment' | 'custom' | 'all';

export const BroadcastView: React.FC = () => {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [lists, setLists] = React.useState<BroadcastList[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [acceptedRisk, setAcceptedRisk] = React.useState(false);
  const [campaignName, setCampaignName] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [audienceMode, setAudienceMode] = React.useState<AudienceMode>('list');
  const [selectedListId, setSelectedListId] = React.useState('');
  const [customPhones, setCustomPhones] = React.useState('');
  const [delayMs, setDelayMs] = React.useState(5000);
  const [expandedCampaign, setExpandedCampaign] = React.useState<string | null>(null);
  const [campaignStats, setCampaignStats] = React.useState<Record<string, CampaignStats | null>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [generatingLists, setGeneratingLists] = React.useState(false);

  const handleGenerateLists = async () => {
    setGeneratingLists(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.brokerContacts.generateLists);
      await loadData();
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setGeneratingLists(false);
    }
  };

  const loadData = React.useCallback(async () => {
    try {
      const listsRes = await backendApi.get(ENDPOINTS.brokerContacts.lists);
      setLists(listsRes.data.lists || []);
      if (listsRes.data.lists?.length > 0 && !selectedListId) {
        setSelectedListId(listsRes.data.lists[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load broadcast lists:', handleApiError(err));
    }

    try {
      const campaignsRes = await backendApi.get(ENDPOINTS.broadcast.campaigns);
      setCampaigns(campaignsRes.data.campaigns || []);
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedListId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const fetchStats = React.useCallback(async (campaignId: string) => {
    try {
      const res = await backendApi.get(ENDPOINTS.broadcast.campaignStats(campaignId));
      setCampaignStats((prev) => ({ ...prev, [campaignId]: res.data.stats }));
      if (res.data.diagnostics) {
        setCampaigns((prev) => prev.map((campaign) => (
          campaign.id === campaignId
            ? { ...campaign, diagnostics: res.data.diagnostics }
            : campaign
        )));
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    if (!expandedCampaign) return;
    fetchStats(expandedCampaign);
    const interval = setInterval(() => fetchStats(expandedCampaign), 5000);
    return () => clearInterval(interval);
  }, [expandedCampaign, fetchStats]);

  const handleCreate = async () => {
    if (!campaignName.trim() || !message.trim()) return;
    if (!acceptedRisk) return;

    setCreating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: campaignName.trim(),
        message: message.trim(),
        audienceType: audienceMode,
        acceptedRisk: true,
        delayBetweenMessagesMs: delayMs,
      };

      if (audienceMode === 'list') body.listId = selectedListId;
      if (audienceMode === 'custom') {
        body.customPhones = customPhones
          .split(/[\n,]+/)
          .map((p) => p.replace(/[^0-9]/g, '').trim())
          .filter(Boolean);
      }

      const res = await backendApi.post(ENDPOINTS.broadcast.campaigns, body);
      const campaign = res.data.campaign;

      if (audienceMode !== 'custom' || (body.customPhones as string[])?.length > 0) {
        await backendApi.post(ENDPOINTS.broadcast.campaignPopulate(campaign.id));
      }

      await loadData();
      setShowForm(false);
      setCampaignName('');
      setMessage('');
      setAcceptedRisk(false);
      setCustomPhones('');
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (campaignId: string) => {
    try {
      await backendApi.post(ENDPOINTS.broadcast.campaignStart(campaignId));
      await loadData();
    } catch (err: any) {
      if (err?.response?.data?.diagnostics) {
        setCampaigns((prev) => prev.map((campaign) => (
          campaign.id === campaignId
            ? { ...campaign, diagnostics: err.response.data.diagnostics }
            : campaign
        )));
      }
      setError(handleApiError(err));
    }
  };

  const handleCancel = async (campaignId: string) => {
    try {
      await backendApi.post(ENDPOINTS.broadcast.campaignCancel(campaignId));
      await loadData();
    } catch (err: any) {
      setError(handleApiError(err));
    }
  };

  const handleDelete = async (campaignId: string) => {
    try {
      await backendApi.delete(ENDPOINTS.broadcast.campaignById(campaignId));
      await loadData();
    } catch (err: any) {
      setError(handleApiError(err));
    }
  };

  const [populatingId, setPopulatingId] = React.useState<string | null>(null);

  const handlePopulate = async (campaignId: string) => {
    setPopulatingId(campaignId);
    setError(null);
    try {
      const res = await backendApi.post(ENDPOINTS.broadcast.campaignPopulate(campaignId));
      const count = res.data.recipientCount || 0;
      if (count === 0) {
        setError('No contacts found in selected lists. Go to Broker Network to sync contacts first.');
      }
      await loadData();
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setPopulatingId(null);
    }
  };

  const statusBadge = (status: CampaignStatus) => {
    const colors: Record<CampaignStatus, string> = {
      draft: 'bg-gray-500/20 text-gray-300',
      scheduled: 'bg-blue-500/20 text-blue-300',
      sending: 'bg-amber-500/20 text-amber-300 animate-pulse',
      completed: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
      cancelled: 'bg-gray-500/20 text-gray-400',
    };
    return (
      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', colors[status])}>
        {status}
      </span>
    );
  };

  const senderBadge = (diagnostics?: BroadcastCampaignDiagnostic | null) => {
    const connected = diagnostics?.senderConnected;
    return (
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
          connected ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300',
        )}
      >
        Sender {diagnostics?.senderStatus || 'unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)]">Loading broadcast campaigns...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-[0.5px] border-[color:var(--border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Broadcast</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Send property campaigns to your broker network. Use a dedicated broadcast number to protect your main CRM session.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-[8px] bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition-colors hover:brightness-110"
        >
          New Campaign
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold underline">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">No campaigns yet</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Create your first broadcast to reach your broker network.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const stats = campaignStats[campaign.id];
              const isExpanded = expandedCampaign === campaign.id;
              const diagnostics = campaign.diagnostics;
              const startBlocker = diagnostics?.startBlocker || null;
              const canStart = ['draft', 'failed'].includes(campaign.status) && campaign.total_recipients > 0 && !startBlocker;

              return (
                <div
                  key={campaign.id}
                  className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)]"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => {
                        setExpandedCampaign(isExpanded ? null : campaign.id);
                        if (!isExpanded && !campaignStats[campaign.id]) {
                          fetchStats(campaign.id);
                        }
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{campaign.name}</span>
                        {statusBadge(campaign.status)}
                        {senderBadge(diagnostics)}
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{campaign.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <span>
                          Sender: <span className="font-semibold text-[var(--text-secondary)]">{diagnostics?.senderLabel || 'broadcast'}</span>
                          {diagnostics?.senderPhoneNumber ? ` (${diagnostics.senderPhoneNumber})` : ''}
                        </span>
                        {startBlocker && (
                          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-200">
                            {startBlocker}
                          </span>
                        )}
                      </div>
                      {diagnostics?.lastApiError && (
                        <p className="mt-2 line-clamp-2 rounded-[6px] border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] leading-4 text-red-200">
                          Last API error: {diagnostics.lastApiError}
                        </p>
                      )}
                    </button>
                    <div className="ml-4 flex items-center gap-3">
                      {campaign.status === 'draft' && campaign.total_recipients === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopulate(campaign.id);
                          }}
                          disabled={populatingId === campaign.id}
                          className={cn(
                            'rounded-[6px] border border-[color:var(--accent-border)] px-3 py-1.5 text-xs font-semibold transition-colors',
                            populatingId === campaign.id
                              ? 'cursor-not-allowed opacity-50 text-[var(--text-muted)]'
                              : 'text-[var(--accent)] hover:bg-[var(--accent-dim)]',
                          )}
                        >
                          {populatingId === campaign.id ? 'Populating...' : 'Populate Recipients'}
                        </button>
                      )}
                      {campaign.status === 'draft' && campaign.total_recipients > 0 && (
                        <button
                          onClick={() => handleStart(campaign.id)}
                          disabled={!canStart}
                          title={startBlocker || undefined}
                          className={cn(
                            'rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-colors',
                            canStart
                              ? 'bg-[var(--accent)] text-black hover:brightness-110'
                              : 'cursor-not-allowed bg-gray-500/20 text-gray-400',
                          )}
                        >
                          Send Now
                        </button>
                      )}
                      {campaign.status === 'failed' && (
                        <button
                          onClick={() => handleStart(campaign.id)}
                          disabled={!diagnostics?.senderConnected}
                          title={!diagnostics?.senderConnected ? 'Connect broadcast sender device first' : undefined}
                          className={cn(
                            'rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-colors',
                            diagnostics?.senderConnected
                              ? 'bg-amber-500 text-black hover:brightness-110'
                              : 'cursor-not-allowed bg-gray-500/20 text-gray-400',
                          )}
                        >
                          Retry
                        </button>
                      )}
                      {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                        <button
                          onClick={() => handleDelete(campaign.id)}
                          className="rounded-[6px] border border-red-500/30 px-2 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      )}
                      <span className="text-xs text-[var(--text-secondary)]">{campaign.total_recipients} recipients</span>
                    </div>
                  </div>

                  {isExpanded && campaignStats[campaign.id] && (
                    <div className="border-t-[0.5px] border-[color:var(--border)] px-4 py-3">
                      <div className="grid grid-cols-4 gap-3 text-center">
                        {[
                          { label: 'Sent', value: campaignStats[campaign.id]!.sent, color: 'text-blue-300' },
                          { label: 'Delivered', value: campaignStats[campaign.id]!.delivered, color: 'text-green-300' },
                          { label: 'Read', value: campaignStats[campaign.id]!.read, color: 'text-[var(--accent)]' },
                          { label: 'Failed', value: campaignStats[campaign.id]!.failed, color: 'text-red-300' },
                        ].map((m) => (
                          <div key={m.label}>
                            <p className={cn('text-lg font-bold', m.color)}>{m.value}</p>
                            <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">New Campaign</h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-[6px] border border-[color:var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Campaign Name</span>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Powai 2BHK Launch"
                  className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Message</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="New 2BHK in Powai starting 1.8Cr. Ready possession. Contact for details."
                  rows={4}
                  className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
              </label>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Audience</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    { value: 'list', label: 'Broadcast List' },
                    { value: 'segment', label: 'Smart Segment' },
                    { value: 'custom', label: 'Custom Upload' },
                    { value: 'all', label: 'All Contacts' },
                  ] as const).map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setAudienceMode(mode.value)}
                      className={cn(
                        'rounded-[6px] border px-3 py-2 text-xs font-medium transition-colors',
                        audienceMode === mode.value
                          ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[color:var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {audienceMode === 'list' && (
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Select List</span>
                    <button
                      onClick={handleGenerateLists}
                      disabled={generatingLists}
                      className={cn(
                        'text-[10px] font-medium transition-colors',
                        generatingLists ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--accent)] hover:underline',
                      )}
                    >
                      {generatingLists ? 'Generating...' : '↻ Generate from Broker Network'}
                    </button>
                  </div>
                  {lists.length === 0 ? (
                    <div className="mt-2 rounded-[8px] border border-dashed border-[color:var(--border)] px-3 py-4 text-center">
                      <p className="text-xs text-[var(--text-secondary)]">No broadcast lists yet</p>
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        Click "Generate from Broker Network" to create lists from your WhatsApp groups.
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                      >
                        <option value="" disabled>Select a list</option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name} ({list.contact_count})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                        Lists are auto-generated from your parsed WhatsApp group participants.
                      </p>
                    </>
                  )}
                </label>
              )}

              {audienceMode === 'custom' && (
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Phone Numbers (one per line)</span>
                  <textarea
                    value={customPhones}
                    onChange={(e) => setCustomPhones(e.target.value)}
                    placeholder="919876543210&#10;919876543211"
                    rows={4}
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Delay Between Messages: {(delayMs / 1000).toFixed(1)}s
                </span>
                <input
                  type="range"
                  min={2000}
                  max={15000}
                  step={500}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acceptedRisk}
                  onChange={(e) => setAcceptedRisk(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <span className="text-[10px] leading-4 text-[var(--text-secondary)]">
                  I understand that using unofficial WhatsApp APIs may result in account restriction or ban. I accept full responsibility.
                </span>
              </label>

              <button
                onClick={handleCreate}
                disabled={
                  !campaignName.trim() ||
                  !message.trim() ||
                  !acceptedRisk ||
                  creating ||
                  (audienceMode === 'list' && !selectedListId) ||
                  (audienceMode === 'custom' && !customPhones.trim())
                }
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-xs font-semibold transition-colors',
                  !campaignName.trim() ||
                  !message.trim() ||
                  !acceptedRisk ||
                  creating ||
                  (audienceMode === 'list' && !selectedListId) ||
                  (audienceMode === 'custom' && !customPhones.trim())
                    ? 'cursor-not-allowed bg-gray-500/20 text-gray-400'
                    : 'bg-[var(--accent)] text-black hover:brightness-110',
                )}
              >
                {creating ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
