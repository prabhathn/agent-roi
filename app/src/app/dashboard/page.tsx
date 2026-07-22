'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatPercent } from '@/lib/roi-utils';
import type { AgentConfig } from '@/types';

interface SummaryRow {
  day_bucket: string;
  total_requests: string;
  avg_latency_ms: string | null;
  total_spans: string;
  error_spans: string;
  replan_spans: string;
  thumbs_up: string;
  thumbs_down: string;
  tasks_completed: string;
  tasks_cancelled: string;
  tasks_started: string;
  total_credits: string;
  positive_rate: string | null;
  error_rate: string | null;
  credits_per_request: string | null;
  roi_score: string | null;
}

interface ValueSummary {
  daily: { day_bucket: string; classified_count: number; total_value: number }[];
  classified_count: number;
  total_traces: number;
  total_value: number;
  total_credits: number;
}

function MetricCard({ label, value, subvalue, color }: { label: string; value: string; subvalue?: string; color?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || 'text-[var(--foreground)]'}`}>{value}</div>
      {subvalue && <div className="text-xs text-[var(--text-muted)] mt-1">{subvalue}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<SummaryRow[]>([]);
  const [valueSummary, setValueSummary] = useState<ValueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agent filter
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string>('');

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        const cortexAgents = (data.agents || []).filter(
          (a: AgentConfig) => (a.agent_type === 'cortex_agent' || a.agent_type === 'cortex_rest_api') && a.is_active
        );
        setAgents(cortexAgents);
        if (cortexAgents.length > 0) {
          const defaultAgent = cortexAgents.find((a: AgentConfig) => a.is_default) || cortexAgents[0];
          setSelectedAgentSlug(defaultAgent.slug);
        }
      })
      .catch(() => {});
  }, []);

  const selectedAgent = agents.find((a) => a.slug === selectedAgentSlug);

  const fetchValueSummary = useCallback(async () => {
    if (!selectedAgentSlug) return;
    try {
      const res = await fetch(`/api/outcomes/value-summary?agent_slug=${selectedAgentSlug}`);
      const data = await res.json();
      if (!data.error) setValueSummary(data);
    } catch (_) { /* non-critical */ }
  }, [selectedAgentSlug]);

  const fetchData = useCallback(async () => {
    if (!selectedAgentSlug || !selectedAgent) return;
    try {
      const isDefault = selectedAgent.sf_agent_name === 'ROI_DEMO_AGENT';
      const agentDb = selectedAgent.sf_database || selectedAgent.obs_database || 'AGENT_ROI_DEMO';
      const agentSchema = selectedAgent.sf_schema || selectedAgent.obs_schema || 'APP';
      const agentName = selectedAgent.sf_agent_name || selectedAgent.obs_agent_name || '';
      const agentType = selectedAgent.agent_type === 'cortex_rest_api' || selectedAgent.agent_type === 'external_agent' ? 'EXTERNAL AGENT' : 'CORTEX AGENT';
      const isRoot = agentType === 'CORTEX AGENT' ? "RECORD:name::VARCHAR = 'Agent'" : "RECORD:name::VARCHAR LIKE '%invoke%'";

      const sql = isDefault
        ? 'SELECT * FROM AGENT_ROI_DEMO.APP.V_ROI_SUMMARY ORDER BY day_bucket DESC LIMIT 30'
        : `WITH spans AS (
            SELECT
              DATE_TRUNC('day', START_TIMESTAMP) AS day_bucket,
              TRACE:trace_id::VARCHAR AS trace_id,
              DATEDIFF('millisecond', START_TIMESTAMP, TIMESTAMP) AS span_duration_ms,
              CASE WHEN ${isRoot} THEN TRUE ELSE FALSE END AS is_root,
              CASE WHEN RECORD:severity_text::VARCHAR IN ('ERROR', 'FATAL') OR RECORD_ATTRIBUTES:"exception.type"::VARCHAR IS NOT NULL THEN TRUE ELSE FALSE END AS has_error,
              CASE WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' AND TRY_TO_NUMBER(REGEXP_SUBSTR(RECORD:name::VARCHAR, '\\\\d+$')) > 0 THEN TRUE ELSE FALSE END AS is_replan
            FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(
              '${agentDb}', '${agentSchema}', '${agentName}', '${agentType}'
            ))
            WHERE RECORD_TYPE = 'SPAN'
          ),
          fb AS (
            SELECT
              DATE_TRUNC('day', TIMESTAMP) AS day_bucket,
              VALUE:positive::BOOLEAN AS positive,
              VALUE:categories AS categories
            FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(
              '${agentDb}', '${agentSchema}', '${agentName}', '${agentType}'
            ))
            WHERE RECORD:name::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
          )
          SELECT
            s.day_bucket,
            COUNT(DISTINCT CASE WHEN s.is_root THEN s.trace_id END) AS total_requests,
            AVG(CASE WHEN s.is_root THEN s.span_duration_ms END) AS avg_latency_ms,
            COUNT(*) AS total_spans,
            SUM(CASE WHEN s.has_error THEN 1 ELSE 0 END) AS error_spans,
            SUM(CASE WHEN s.is_replan THEN 1 ELSE 0 END) AS replan_spans,
            0 AS thumbs_up, 0 AS thumbs_down,
            0 AS tasks_completed, 0 AS tasks_cancelled, 0 AS tasks_started,
            0 AS total_credits,
            NULL AS positive_rate, NULL AS error_rate, NULL AS credits_per_request, NULL AS roi_score
          FROM spans s
          LEFT JOIN fb f ON f.day_bucket = s.day_bucket
          GROUP BY s.day_bucket
          ORDER BY s.day_bucket DESC
          LIMIT 30`;

      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const result = await response.json();
      if (result.error) {
        setError(result.error);
      } else {
        setData(result.data || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedAgentSlug, selectedAgent]);

  useEffect(() => {
    if (selectedAgentSlug) {
      setLoading(true);
      fetchData();
      fetchValueSummary();
    }
  }, [fetchData, fetchValueSummary, selectedAgentSlug]);

  useEffect(() => {
    const interval = setInterval(() => { fetchData(); fetchValueSummary(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchValueSummary]);

  const totals = data.reduce(
    (acc, row) => ({
      requests: acc.requests + Number(row.total_requests || 0),
      thumbsUp: acc.thumbsUp + Number(row.thumbs_up || 0),
      thumbsDown: acc.thumbsDown + Number(row.thumbs_down || 0),
      tasksCompleted: acc.tasksCompleted + Number(row.tasks_completed || 0),
      tasksStarted: acc.tasksStarted + Number(row.tasks_started || 0),
      errors: acc.errors + Number(row.error_spans || 0),
      replans: acc.replans + Number(row.replan_spans || 0),
      spans: acc.spans + Number(row.total_spans || 0),
      credits: acc.credits + Number(row.total_credits || 0),
    }),
    { requests: 0, thumbsUp: 0, thumbsDown: 0, tasksCompleted: 0, tasksStarted: 0, errors: 0, replans: 0, spans: 0, credits: 0 }
  );

  const positiveRate = totals.thumbsUp + totals.thumbsDown > 0 ? totals.thumbsUp / (totals.thumbsUp + totals.thumbsDown) : null;
  // Error rate uses only actual errors, not replans
  const errorRate = totals.spans > 0 ? totals.errors / totals.spans : null;
  const totalCredits = valueSummary?.total_credits ?? (totals.credits > 0 ? totals.credits : null);
  const creditsPerRequest = totals.requests > 0 && totalCredits ? totalCredits / totals.requests : null;

  // Dollar-based ROI: value delivered / credit cost (assuming ~$3/credit for enterprise)
  const DOLLARS_PER_CREDIT = 3.0;
  const creditCostDollars = totalCredits ? totalCredits * DOLLARS_PER_CREDIT : null;
  const dollarROI = valueSummary && valueSummary.total_value > 0 && creditCostDollars && creditCostDollars > 0
    ? valueSummary.total_value / creditCostDollars : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-[var(--text-muted)] animate-pulse">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">ROI Dashboard</h1>
          {agents.length > 1 && (
            <select
              value={selectedAgentSlug}
              onChange={(e) => setSelectedAgentSlug(e.target.value)}
              className="h-8 px-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--surface-secondary)] text-[var(--text-secondary)] focus:outline-none"
            >
              {agents.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
        <span className="text-xs text-[var(--text-muted)]">Auto-refreshes every 30s</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Metric Cards - Row 1: Value metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Value Delivered"
          value={valueSummary ? `$${valueSummary.total_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
          subvalue={valueSummary ? `${valueSummary.classified_count} of ${valueSummary.total_traces} classified` : undefined}
          color="text-green-600"
        />
        <MetricCard
          label="Value / Convo"
          value={valueSummary && valueSummary.classified_count > 0 ? `$${(valueSummary.total_value / valueSummary.classified_count).toFixed(2)}` : '—'}
          subvalue={`${totals.requests} conversations total`}
        />
        <MetricCard
          label="Total Credits"
          value={totalCredits ? totalCredits.toFixed(4) : '—'}
          subvalue={creditsPerRequest ? `${creditsPerRequest.toFixed(4)} per request` : 'No billing data yet'}
        />
        <MetricCard
          label="ROI"
          value={dollarROI ? `${dollarROI.toFixed(0)}x` : '—'}
          subvalue={creditCostDollars ? `$${valueSummary!.total_value.toFixed(0)} value / $${creditCostDollars.toFixed(2)} cost` : 'Need credit data for ROI'}
          color={dollarROI ? (dollarROI > 10 ? 'text-green-600' : dollarROI > 1 ? 'text-amber-500' : 'text-red-500') : undefined}
        />
      </div>

      {/* Metric Cards - Row 2: Operational health */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Conversations" value={totals.requests.toString()} subvalue={`${data.length} days of data`} />
        <MetricCard
          label="Positive Feedback"
          value={formatPercent(positiveRate)}
          subvalue={`${totals.thumbsUp} up / ${totals.thumbsDown} down`}
          color={positiveRate !== null && positiveRate > 0.7 ? 'text-green-600' : undefined}
        />
        <MetricCard
          label="Error Rate"
          value={formatPercent(errorRate)}
          subvalue={`${totals.errors} errors across ${totals.spans} spans`}
          color={errorRate !== null && errorRate === 0 ? 'text-green-600' : errorRate !== null && errorRate > 0.1 ? 'text-red-600' : undefined}
        />
        <MetricCard
          label="Multi-Step Plans"
          value={totals.replans.toString()}
          subvalue={totals.requests > 0 ? `${(totals.replans / totals.requests).toFixed(1)} avg steps/request` : '—'}
        />
      </div>

      {/* Coverage warning */}
      {valueSummary && valueSummary.total_traces > 0 && valueSummary.classified_count < valueSummary.total_traces && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-700">
          {Math.round((valueSummary.classified_count / valueSummary.total_traces) * 100)}% of traces classified — run <span className="font-medium">Classify Unclassified</span> on the Outcomes page for complete value metrics.
        </div>
      )}

      {/* Daily breakdown table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-secondary)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs text-[var(--text-muted)] font-medium">Date</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Requests</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Value</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Latency</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Credits</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">👍</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">👎</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Steps</th>
                <th className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] font-medium">Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No data yet. Start chatting with the agent to generate telemetry.
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const dayStr = row.day_bucket ? new Date(parseFloat(row.day_bucket) * 1000).toISOString().split('T')[0] : null;
                  const valueMatch = dayStr && valueSummary?.daily.find(d => d.day_bucket && new Date(parseFloat(d.day_bucket) * 1000).toISOString().split('T')[0] === dayStr);
                  return (
                    <tr key={row.day_bucket} className="hover:bg-[var(--surface-secondary)] transition-colors">
                      <td className="px-4 py-2.5 text-[var(--foreground)]">{row.day_bucket ? new Date(parseFloat(row.day_bucket) * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--foreground)]">{row.total_requests}</td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">{valueMatch ? `$${valueMatch.total_value.toFixed(0)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{row.avg_latency_ms ? `${(Number(row.avg_latency_ms) / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(row.total_credits) > 0 ? Number(row.total_credits).toFixed(4) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{Number(row.thumbs_up) > 0 ? row.thumbs_up : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{Number(row.thumbs_down) > 0 ? row.thumbs_down : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(row.replan_spans) > 0 ? row.replan_spans : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(row.tasks_completed) > 0 ? row.tasks_completed : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
