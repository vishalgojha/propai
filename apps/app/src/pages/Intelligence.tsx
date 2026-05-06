import React, { useEffect, useState } from 'react';
import backend from '../services/api';

export default function IntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ ok: boolean; ready?: boolean; version?: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await backend.get('/intelligence/health');
        if (mounted) setStatus({ ok: true, ready: true, version: '1.0.0' });
      } catch {
        if (mounted) setStatus({ ok: false });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const runAnalyze = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await backend.post('/intelligence/analyze', { sample: true });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Analyze failed');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Intelligence</h1>
      {!status?.ok ? (
        <p style={{ color: 'red' }}>Intelligence service unavailable</p>
      ) : (
        <>
          <p>Status: OK (v{status.version})</p>
          <button onClick={runAnalyze} style={{ marginTop: 16, padding: '8px 16px' }}>
            Run Analyze
          </button>
          {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
          {result && (
            <pre style={{ marginTop: 16, background: '#f5f5f5', padding: 12 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
