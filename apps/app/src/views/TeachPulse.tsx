import React, { useEffect, useState, useCallback } from 'react';
import backendApi, { handleApiError } from '../services/api';
import { SparklesIcon, CheckIcon, XIcon, AlertTriangleIcon, RefreshIcon } from '../lib/icons';

type UnresolvedItem = {
  id: string;
  raw_text: string;
  locality: string | null;
  city: string | null;
  bhk: string | null;
  type: string | null;
  price_label: string | null;
  price_numeric: number | null;
  confidence_score: number | null;
  record_type: string | null;
  created_at: string;
};

const panelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 md:p-5';
const panelLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]';
const accentButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#020f07] shadow-[0_8px_20px_rgba(62,232,138,0.15)] transition-all duration-150 hover:-translate-y-[0.5px] hover:brightness-95 disabled:opacity-50';
const ghostButtonClass =
  'inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const fieldClass =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)]';

const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK'];
const TYPE_OPTIONS = ['Sale', 'Rent', 'Lease', 'Requirement'];

function formatDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return dateStr; }
}

export const TeachPulseView: React.FC = () => {
  const [items, setItems] = useState<UnresolvedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Correction form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [corrLocality, setCorrLocality] = useState('');
  const [corrBhk, setCorrBhk] = useState('');
  const [corrType, setCorrType] = useState('');
  const [corrAlias, setCorrAlias] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Process All state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendApi.get<{ items: UnresolvedItem[] }>('/api/teach/unresolved?limit=200');
      setItems(res.data?.items ?? []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openForm = (item: UnresolvedItem) => {
    setEditingId(item.id);
    setCorrLocality(item.locality || '');
    setCorrBhk(item.bhk || '');
    setCorrType(item.type || '');
    // Pre-fill alias from the raw text: extract a likely fragment
    const raw = item.raw_text || '';
    const words = raw.split(/[\s,]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 3);
    setCorrAlias(words.join(' ') || '');
  };

  const cancelForm = () => {
    setEditingId(null);
    setCorrLocality('');
    setCorrBhk('');
    setCorrType('');
    setCorrAlias('');
  };

  const submitCorrection = async () => {
    if (!editingId || !corrLocality.trim()) {
      showToast('error', 'Locality is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { itemId: editingId, locality: corrLocality.trim() };
      if (corrBhk) payload.bhk = corrBhk.trim();
      if (corrType) payload.type = corrType;
      if (corrAlias.trim()) payload.aliasFragment = corrAlias.trim();

      const res = await backendApi.post('/api/teach/correct', payload);
      const msg = res.data?.message || 'Saved!';
      showToast('success', msg);
      cancelForm();
      fetchItems();
    } catch (err) {
      showToast('error', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const processAll = async () => {
    setProcessing(true);
    setProgress(null);
    try {
      const res = await backendApi.post<{ success: boolean; total: number; resolved: number; queued: number; message: string }>('/api/teach/process-all');
      showToast('success', res.data?.message || 'Processing complete');
      fetchItems();
    } catch (err) {
      showToast('error', handleApiError(err));
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const unresolvedCount = items.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-[12px] border px-4 py-3 text-[13px] font-semibold shadow-lg transition-all ${
          toast.type === 'success'
            ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
            : 'border-[var(--text-danger)] bg-[var(--bg-elevated)] text-[var(--text-danger)]'
        }`}>
          {toast.type === 'success' ? <CheckIcon className="h-4 w-4" strokeWidth={2} /> : <AlertTriangleIcon className="h-4 w-4" strokeWidth={2} />}
          {toast.message}
          <button className="ml-2 opacity-50 hover:opacity-100" onClick={() => setToast(null)}><XIcon className="h-3 w-3" strokeWidth={2} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]">
          <SparklesIcon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Teach Pulse</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Review unresolved parses and train the parser permanently.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={ghostButtonClass} onClick={fetchItems} disabled={loading}>
            <RefreshIcon className="h-4 w-4" strokeWidth={1.5} />
            Refresh
          </button>
          <button className={`${accentButtonClass} ${processing ? 'opacity-50' : ''}`} onClick={processAll} disabled={processing}>
            {processing ? 'Processing...' : 'Process All'}
          </button>
        </div>
      </div>

      {/* Process All progress */}
      {progress && (
        <div className={`${panelClass} flex items-center gap-3`}>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-[13px] text-[var(--text-primary)]">
            Processing {progress.processed} / {progress.total} records
          </p>
        </div>
      )}

      {/* Summary bar */}
      <div className={`${panelClass} flex items-center gap-3`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
          unresolvedCount > 0 ? 'bg-[var(--amber)] text-[#020f07]' : 'bg-[var(--accent)] text-[#020f07]'
        }`}>
          {unresolvedCount}
        </span>
        <p className="text-[13px] text-[var(--text-primary)]">
          {unresolvedCount > 0
            ? `${unresolvedCount} items need review`
            : 'All clear — no unresolved items found'}
        </p>
      </div>

      {/* Unresolved items */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : error ? (
        <div className={`${panelClass} text-center`}>
          <p className="text-[13px] text-[var(--text-danger)]">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className={`${panelClass} py-16 text-center`}>
          <p className="text-[13px] text-[var(--text-secondary)]">Nothing to teach right now.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.id} className={`${panelClass} transition-all duration-150 hover:border-[color:var(--border-strong)]`}>
              {/* Raw text */}
              <div className="mb-3">
                <p className={`${panelLabelClass} mb-1`}>Raw Message</p>
                <p className="text-[12px] leading-6 text-[var(--text-primary)]">{item.raw_text || '—'}</p>
              </div>

              {/* Current parsed values */}
              <div className="mb-3 grid grid-cols-4 gap-3">
                <div>
                  <p className={`${panelLabelClass}`}>Locality</p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{item.locality || '—'}</p>
                </div>
                <div>
                  <p className={`${panelLabelClass}`}>BHK</p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{item.bhk || '—'}</p>
                </div>
                <div>
                  <p className={`${panelLabelClass}`}>Type</p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{item.type || '—'}</p>
                </div>
                <div>
                  <p className={`${panelLabelClass}`}>Confidence</p>
                  <p className={`mt-0.5 text-[13px] font-bold ${(item.confidence_score ?? 0) < 0.4 ? 'text-[var(--amber)]' : 'text-[var(--accent)]'}`}>
                    {item.confidence_score != null ? `${Math.round(item.confidence_score * 100)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {editingId === item.id ? (
                <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={`${panelLabelClass}`}>Correct Locality *</label>
                      <input className={`${fieldClass} mt-1`} placeholder="e.g. Andheri East" value={corrLocality} onChange={(e) => setCorrLocality(e.target.value)} />
                    </div>
                    <div>
                      <label className={`${panelLabelClass}`}>Alias (what broker typed)</label>
                      <input className={`${fieldClass} mt-1`} placeholder="e.g. marol" value={corrAlias} onChange={(e) => setCorrAlias(e.target.value)} />
                    </div>
                    <div>
                      <label className={`${panelLabelClass}`}>BHK</label>
                      <select className={`${fieldClass} mt-1`} value={corrBhk} onChange={(e) => setCorrBhk(e.target.value)}>
                        <option value="">Keep as-is</option>
                        {BHK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={`${panelLabelClass}`}>Type</label>
                      <select className={`${fieldClass} mt-1`} value={corrType} onChange={(e) => setCorrType(e.target.value)}>
                        <option value="">Keep as-is</option>
                        {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className={ghostButtonClass} onClick={cancelForm}>Cancel</button>
                    <button className={accentButtonClass} disabled={submitting} onClick={submitCorrection}>
                      {submitting ? 'Saving...' : 'Save & Propagate'}
                    </button>
                  </div>
                </div>
              ) : (
                <button className={ghostButtonClass} onClick={() => openForm(item)}>
                  <SparklesIcon className="h-4 w-4" strokeWidth={1.5} />
                  I Know This
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
