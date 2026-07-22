'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface OutcomeCategory {
  id: string;
  agent_slug: string;
  category_name: string;
  category_type: string;
  dollar_value: number;
  color: string;
  sort_order: number;
}

interface OutcomeRow {
  id: string;
  trace_id: string;
  agent_slug: string;
  category_id: string;
  category_name: string;
  category_type: string;
  category_dollar_value: number;
  color: string;
  classification_method: string;
  feedback_signal: string;
  ai_classify_probability: number | null;
  quality_score: number;
  computed_value: number;
  classified_at: string;
  overridden_at: string | null;
  override_reason: string | null;
  user_query: string | null;
  latency_ms: number | null;
  response_text: string | null;
  tools_used: string | null;
  replan_count: number;
}

interface Summary {
  total_classified: number;
  total_value: number;
  avg_quality: number;
  success_rate: number;
}

export default function OutcomesPage() {
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_classified: 0, total_value: 0, avg_quality: 0, success_rate: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [categories, setCategories] = useState<OutcomeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [days, setDays] = useState('30');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentFilter) params.set('agent_slug', agentFilter);
    params.set('days', days);
    const [outcomesRes, catsRes] = await Promise.all([
      fetch(`/api/outcomes?${params}`),
      fetch('/api/outcomes/categories'),
    ]);
    const outcomesData = await outcomesRes.json();
    const catsData = await catsRes.json();
    setOutcomes(outcomesData.outcomes || []);
    setSummary(outcomesData.summary || { total_classified: 0, total_value: 0, avg_quality: 0, success_rate: 0 });
    setPendingCount(outcomesData.pending_count || 0);
    setCategories(Array.isArray(catsData) ? catsData : []);
    setLoading(false);
  }, [agentFilter, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClassify = async () => {
    setClassifying(true);
    try {
      const res = await fetch('/api/outcomes/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentFilter ? { agent_slug: agentFilter } : {}),
      });
      const data = await res.json();
      alert(`Classified ${data.classified} traces`);
      await fetchData();
    } catch (e) {
      alert(`Error: ${e}`);
    }
    setClassifying(false);
  };

  const handleOverride = async (outcomeId: string, newCategoryId: string) => {
    await fetch('/api/outcomes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: outcomeId, category_id: newCategoryId }),
    });
    await fetchData();
  };

  const uniqueAgents = [...new Set(categories.map(c => c.agent_slug))];

  const formatValue = (v: number) => {
    if (v >= 0) return `$${v.toFixed(0)}`;
    return `-$${Math.abs(v).toFixed(0)}`;
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return '';
    const d = ts.includes('.') && !ts.includes('T') ? new Date(parseFloat(ts) * 1000) : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-[var(--text-muted)] animate-pulse">Loading outcomes...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Outcomes</h1>
        <div className="flex items-center gap-3">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
          >
            <option value="">All Agents</option>
            {uniqueAgents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs text-[var(--text-muted)] mb-1">Total Value</div>
          <div className={`text-2xl font-bold ${summary.total_value >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatValue(summary.total_value)}
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs text-[var(--text-muted)] mb-1">Success Rate</div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {(summary.success_rate * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs text-[var(--text-muted)] mb-1">Classified</div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {summary.total_classified}
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs text-[var(--text-muted)] mb-1">Avg Quality</div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {(summary.avg_quality * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Classify Button */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleClassify}
          disabled={classifying || pendingCount === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {classifying ? 'Classifying...' : `Classify Unclassified (${pendingCount} pending)`}
        </button>
        {classifying && <span className="text-xs text-[var(--text-muted)] animate-pulse">Running AI_CLASSIFY on traces...</span>}
      </div>

      {/* Outcomes Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Trace</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Agent</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Time</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Query</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Outcome</th>
              <th className="text-center px-3 py-2 font-medium text-[var(--text-muted)]">Quality</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">Value</th>
              <th className="text-center px-3 py-2 font-medium text-[var(--text-muted)]">Method</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Override</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <React.Fragment key={o.id}>
              <tr 
                className="border-b border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer"
                onClick={() => setExpandedRow(expandedRow === o.id ? null : o.id)}
              >
                <td className="px-3 py-2 font-mono text-[10px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <svg className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${expandedRow === o.id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <Link
                      href={`/traces?trace_id=${o.trace_id}&agent=${o.agent_slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-[var(--accent)] hover:underline"
                      title="View in Traces"
                    >
                      {o.trace_id.substring(0, 12)}...
                    </Link>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[var(--text-secondary)]">{o.agent_slug.split('-').slice(0, 2).join(' ')}</span>
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{formatTimestamp(o.classified_at)}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[200px] truncate">
                  {o.user_query || '—'}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: o.color }}
                  >
                    {o.category_name}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center gap-1.5 justify-center">
                    <div className="w-12 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${o.quality_score * 100}%`,
                          backgroundColor: o.quality_score > 0.7 ? '#16a34a' : o.quality_score > 0.4 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="text-[var(--text-muted)]">{(o.quality_score * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-medium ${o.computed_value >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatValue(o.computed_value)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    o.classification_method === 'ai_classify' ? 'bg-purple-100 text-purple-700' :
                    o.classification_method === 'feedback' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {o.classification_method === 'ai_classify' ? 'AI' : o.classification_method === 'feedback' ? 'Feedback' : 'Manual'}
                  </span>
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={o.category_id}
                    onChange={(e) => handleOverride(o.id, e.target.value)}
                    className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text-secondary)] cursor-pointer"
                  >
                    {categories
                      .filter(c => c.agent_slug === o.agent_slug)
                      .map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                  </select>
                </td>
              </tr>
              {expandedRow === o.id && (
                <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                  <td colSpan={9} className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-[var(--text-muted)]">User Query:</span>
                          <p className="text-[var(--foreground)] mt-0.5">{o.user_query || '—'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-[var(--text-muted)]">Agent Response:</span>
                          <p className="text-[var(--text-secondary)] mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{typeof o.response_text === 'object' ? JSON.stringify(o.response_text) : (o.response_text || '—')}</p>
                        </div>
                        <div>
                          <span className="font-medium text-[var(--text-muted)]">Tools Used:</span>
                          <span className="ml-1 text-[var(--text-secondary)]">{o.tools_used || '—'}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-[var(--text-muted)]">Classification:</span>
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: o.color }}>{o.category_name}</span>
                          <span className="ml-2 text-[var(--text-muted)]">({o.category_type})</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="font-medium text-[var(--text-muted)]">AI Confidence:</span>
                            <span className="ml-1 text-[var(--text-secondary)]">{o.ai_classify_probability ? `${(o.ai_classify_probability * 100).toFixed(0)}%` : '—'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-[var(--text-muted)]">Latency:</span>
                            <span className="ml-1 text-[var(--text-secondary)]">{o.latency_ms ? `${(o.latency_ms / 1000).toFixed(1)}s` : '—'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-[var(--text-muted)]">Re-plans:</span>
                            <span className="ml-1 text-[var(--text-secondary)]">{o.replan_count}</span>
                          </div>
                          <div>
                            <span className="font-medium text-[var(--text-muted)]">Feedback:</span>
                            <span className="ml-1 text-[var(--text-secondary)]">{o.feedback_signal || 'none'}</span>
                          </div>
                        </div>
                        <div>
                          <span className="font-medium text-[var(--text-muted)]">Value Calculation:</span>
                          <p className="text-[var(--text-secondary)] mt-0.5 font-mono text-[10px]">
                            ${o.category_dollar_value.toFixed(2)} (category) x {(o.quality_score * 100).toFixed(0)}% (quality) = <strong className={o.computed_value >= 0 ? 'text-green-700' : 'text-red-600'}>${o.computed_value.toFixed(2)}</strong>
                          </p>
                        </div>
                        {o.override_reason && (
                          <div>
                            <span className="font-medium text-amber-600">Override Reason:</span>
                            <span className="ml-1 text-[var(--text-secondary)]">{o.override_reason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {outcomes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">
                  No classified outcomes yet. Click &quot;Classify&quot; to process traces.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
