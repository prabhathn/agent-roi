'use client';

import { useEffect, useState, useCallback } from 'react';
import { TraceChat } from '@/components/TraceChat';
import type { AgentConfig } from '@/types';

interface TraceRow {
  trace_id: string;
  started_at: string;
  ended_at: string;
  total_duration_ms: string;
  span_kinds: string;
  has_any_error: string;
  has_replan: string;
  has_positive_feedback: string;
  has_negative_feedback: string;
  agent_name: string;
  agent_slug: string;
  agent_type: string;
}

interface SpanRow {
  span_id: string;
  span_name: string;
  span_kind: string;
  tool_name: string | null;
  span_duration_ms: string;
  is_replan: string;
  has_error: string;
  error_message: string | null;
  // Detail fields
  model: string | null;
  user_query: string | null;
  selected_tool: string | null;
  input_tokens: string | null;
  output_tokens: string | null;
  total_tokens: string | null;
  thinking: string | null;
  response_preview: string | null;
  search_query: string | null;
  search_results: string | null;
  status: string | null;
  // SQL execution fields
  sql_query: string | null;
  query_id: string | null;
  num_rows: string | null;
  verified_query_used: string | null;
  semantic_model: string | null;
  // Chart generation fields
  chart_spec: string | null;
  chart_data_sql: string | null;
  // Planning detail fields
  step_number: string | null;
  cache_read_tokens: string | null;
  cache_write_tokens: string | null;
  tool_args: string | null;
  tool_exec_name: string | null;
  tool_exec_type: string | null;
  // SQL execution detail fields
  final_sql: string | null;
  execution_status: string | null;
  sql_result_data: string | null;
  validation_error: string | null;
  sql_warehouse: string | null;
  // Search detail fields
  search_limit: string | null;
  // Query history fields (loaded async)
  bytes_scanned: string | null;
  compilation_time: string | null;
  execution_time: string | null;
  partitions_scanned: string | null;
  partitions_total: string | null;
  warehouse_name: string | null;
  // Timestamps for Gantt positioning
  start_ts: string | null;
  end_ts: string | null;
}

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [spans, setSpans] = useState<SpanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [spansLoading, setSpansLoading] = useState(false);
  const [expandedSpan, setExpandedSpan] = useState<string | null>(null);
  const [queryStats, setQueryStats] = useState<Record<string, Record<string, string>>>({});
  const [queryStatsLoading, setQueryStatsLoading] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Array<{ positive: boolean | string; categories: string | string[]; message: string; timestamp: string }>>([]);
  const [showChat, setShowChat] = useState(false);

  // Telemetry attribute mapping (loaded from SPAN_ATTRIBUTE_MAP table)
  type AttrMapping = Record<string, Array<{ agent_type: string; source_attr_path: string; priority: number }>>;
  const [attrMap, setAttrMap] = useState<AttrMapping>({});

  useEffect(() => {
    fetch('/api/telemetry-map')
      .then((res) => res.json())
      .then((data) => setAttrMap(data.mappings || {}))
      .catch(() => {});
  }, []);

  // Helper: build a COALESCE expression for a standard attribute given the agent type
  const buildAttrExpr = (standardAttr: string, forAgentType: string): string => {
    const entries = attrMap[standardAttr]
      ?.filter((m) => m.agent_type === forAgentType)
      ?.sort((a, b) => a.priority - b.priority)
      ?.map((m) => `RECORD_ATTRIBUTES:"${m.source_attr_path}"::VARCHAR`);
    if (!entries || entries.length === 0) {
      // Fallback: try all agent types combined (covers cases where mapping hasn't loaded or type doesn't match)
      const allEntries = attrMap[standardAttr]
        ?.sort((a, b) => a.priority - b.priority)
        ?.map((m) => `RECORD_ATTRIBUTES:"${m.source_attr_path}"::VARCHAR`);
      if (!allEntries || allEntries.length === 0) return 'NULL';
      return allEntries.length === 1 ? allEntries[0] : `COALESCE(${allEntries.join(', ')})`;
    }
    return entries.length === 1 ? entries[0] : `COALESCE(${entries.join(', ')})`;
  };

  // Agent filter state
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string>('');

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        const traceableAgents = (data.agents || []).filter(
          (a: AgentConfig) => (a.agent_type === 'cortex_agent' || a.agent_type === 'cortex_rest_api' || a.agent_type === 'external_agent') && a.is_active
        );
        setAgents(traceableAgents);
      })
      .catch(() => {});
  }, []);

  // Derive agent context from the selected trace
  const selectedTraceAgent = traces.find((t) => t.trace_id === selectedTrace);
  const selectedAgent = agents.find((a) => a.slug === (selectedTraceAgent?.agent_slug || selectedAgentSlug));
  const agentDb = selectedAgent?.sf_database || selectedAgent?.obs_database || 'AGENT_ROI_DEMO';
  const agentSchema = selectedAgent?.sf_schema || selectedAgent?.obs_schema || 'APP';
  const agentName = selectedAgent?.sf_agent_name || selectedAgent?.obs_agent_name || 'ROI_DEMO_AGENT';
  const agentType = selectedAgent?.agent_type === 'cortex_rest_api' || selectedAgent?.agent_type === 'external_agent' ? 'EXTERNAL AGENT' : 'CORTEX AGENT';

  const fetchTraces = useCallback(async () => {
    if (agents.length === 0) return;
    try {
      // Query each agent and merge results
      const allTraces: TraceRow[] = [];

      for (const ag of agents) {
        const db = ag.sf_database || ag.obs_database || 'AGENT_ROI_DEMO';
        const schema = ag.sf_schema || ag.obs_schema || 'APP';
        const name = ag.sf_agent_name || ag.obs_agent_name || '';
        const type = ag.agent_type === 'cortex_rest_api' || ag.agent_type === 'external_agent' ? 'EXTERNAL AGENT' : 'CORTEX AGENT';
        if (!name) continue;

        try {
        const response = await fetch('/api/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: `WITH raw_spans AS (
              SELECT
                TRACE:trace_id::VARCHAR AS trace_id,
                RECORD:name::VARCHAR AS span_name,
                CASE
                  WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' THEN 'PLANNING'
                  WHEN RECORD:name::VARCHAR LIKE 'SemanticContextTool%' THEN 'TOOL_ANALYST'
                  WHEN RECORD:name::VARCHAR LIKE 'CortexSearchService%' THEN 'TOOL_SEARCH'
                  WHEN RECORD:name::VARCHAR LIKE 'SqlExecution%' OR RECORD:name::VARCHAR LIKE 'SystemExecuteSQLTool%' THEN 'SQL_EXECUTION'
                  WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepResponseGeneration%' THEN 'RESPONSE_GEN'
                  WHEN RECORD:name::VARCHAR LIKE 'CortexChartToolImpl%' THEN 'CHART_GEN'
                  WHEN RECORD:name::VARCHAR LIKE 'ServerSkillTool%' THEN 'TOOL_SKILL'
                  WHEN RECORD:name::VARCHAR = 'Agent' THEN 'AGENT_ROOT'
                  WHEN RECORD:name::VARCHAR LIKE '%.__call__%' OR RECORD:name::VARCHAR LIKE '%.__call%' THEN 'AGENT_ROOT'
                  WHEN RECORD:name::VARCHAR LIKE '%.retrieve%' OR RECORD:name::VARCHAR LIKE '%retriev%' THEN 'RETRIEVAL'
                  WHEN RECORD:name::VARCHAR LIKE '%.generate%' OR RECORD:name::VARCHAR LIKE '%generat%' THEN 'GENERATION'
                  WHEN RECORD:name::VARCHAR = 'collect' THEN 'SQL_EXECUTION'
                  WHEN RECORD:name::VARCHAR LIKE '%think%' THEN 'PLANNING'
                  WHEN RECORD:name::VARCHAR LIKE '%draft%' THEN 'GENERATION'
                  WHEN RECORD:name::VARCHAR LIKE '%refine%' THEN 'RESPONSE_GEN'
                  WHEN RECORD:name::VARCHAR LIKE '%ChatOpenAI%' THEN 'GENERATION'
                  WHEN RECORD:name::VARCHAR LIKE '%CompiledStateGraph.invoke%' THEN 'AGENT_ROOT'
                  WHEN RECORD:name::VARCHAR LIKE '%CompiledStateGraph.stream%' THEN 'AGENT_ROOT_DUP'
                  WHEN RECORD:name::VARCHAR = 'graph' THEN 'AGENT_ROOT_DUP'
                  WHEN RECORD:name::VARCHAR = 'AgentV2RequestResponseInfo' THEN 'REQUEST_INFO'
                  WHEN RECORD:name::VARCHAR = 'CORTEX_AGENT_REQUEST' THEN 'REQUEST_EVENT'
                  ELSE 'OTHER'
                END AS span_kind,
                DATEDIFF('millisecond', START_TIMESTAMP, TIMESTAMP) AS span_duration_ms,
                START_TIMESTAMP,
                TIMESTAMP AS end_timestamp,
                CASE WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' AND TRY_TO_NUMBER(REGEXP_SUBSTR(RECORD:name::VARCHAR, '\\\\d+$')) > 0 THEN TRUE ELSE FALSE END AS is_replan,
                CASE WHEN RECORD:severity_text::VARCHAR IN ('ERROR', 'FATAL') OR RECORD_ATTRIBUTES:"exception.type"::VARCHAR IS NOT NULL THEN TRUE ELSE FALSE END AS has_error
              FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED
              WHERE agent_slug = '${ag.slug}'
              AND RECORD_TYPE = 'SPAN'
            ),
            traces AS (
              SELECT trace_id, MIN(start_timestamp) AS started_at, MAX(end_timestamp) AS ended_at,
                    MAX(span_duration_ms) AS total_duration_ms,
                    ARRAY_AGG(DISTINCT span_kind) AS span_kinds,
                    BOOLOR_AGG(has_error) AS has_any_error,
                    BOOLOR_AGG(is_replan) AS has_replan
              FROM raw_spans
              WHERE span_kind NOT IN ('REQUEST_EVENT', 'REQUEST_INFO', 'AGENT_ROOT_DUP')
              GROUP BY trace_id
            ),
            fb AS (
              SELECT
                TIMESTAMP AS fb_time,
                VALUE:positive::BOOLEAN AS positive
              FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED
              WHERE agent_slug = '${ag.slug}'
              AND RECORD:name::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
            )
            SELECT t.*,
              BOOLOR_AGG(CASE WHEN f.positive = TRUE THEN TRUE ELSE FALSE END) AS has_positive_feedback,
              BOOLOR_AGG(CASE WHEN f.positive = FALSE THEN TRUE ELSE FALSE END) AS has_negative_feedback
            FROM traces t
            LEFT JOIN fb f ON f.fb_time BETWEEN t.ended_at AND DATEADD('second', 60, t.ended_at)
            GROUP BY t.trace_id, t.started_at, t.ended_at, t.total_duration_ms, t.span_kinds, t.has_any_error, t.has_replan
            ORDER BY t.started_at DESC
            LIMIT 25`,
          }),
        });
        const result = await response.json();
        const agentTraces = (result.data || []).map((t: TraceRow) => ({
          ...t,
          agent_name: ag.name,
          agent_slug: ag.slug,
          agent_type: ag.agent_type,
        }));
        allTraces.push(...agentTraces);
        } catch (agentErr) { console.error(`Error fetching traces for ${ag.slug}:`, agentErr); }
      }

      // Sort all traces by started_at descending
      allTraces.sort((a, b) => parseFloat(b.started_at) - parseFloat(a.started_at));
      setTraces(allTraces.slice(0, 50));
    } catch (err) { console.error('fetchTraces error:', err); }
    finally { setLoading(false); }
  }, [agents]);

  const fetchSpans = useCallback(async (traceId: string, agentSlug?: string) => {
    const slug = agentSlug || selectedTraceAgent?.agent_slug || '';
    if (!slug) return;
    setSpansLoading(true);
    try {
      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT 
            TRACE:span_id::VARCHAR AS span_id,
            RECORD:name::VARCHAR AS span_name,
            CASE
              WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' THEN 'PLANNING'
              WHEN RECORD:name::VARCHAR LIKE 'SemanticContextTool%' THEN 'TOOL_ANALYST'
              WHEN RECORD:name::VARCHAR LIKE 'CortexSearchService%' THEN 'TOOL_SEARCH'
              WHEN RECORD:name::VARCHAR LIKE 'SqlExecution%' OR RECORD:name::VARCHAR LIKE 'SystemExecuteSQLTool%' THEN 'SQL_EXECUTION'
              WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepResponseGeneration%' THEN 'RESPONSE_GEN'
              WHEN RECORD:name::VARCHAR LIKE 'CortexChartToolImpl%' THEN 'CHART_GEN'
              WHEN RECORD:name::VARCHAR LIKE 'ServerSkillTool%' THEN 'TOOL_SKILL'
              WHEN RECORD:name::VARCHAR = 'Agent' THEN 'AGENT_ROOT'
              WHEN RECORD:name::VARCHAR LIKE '%.__call__%' OR RECORD:name::VARCHAR LIKE '%.__call%' THEN 'AGENT_ROOT'
              WHEN RECORD:name::VARCHAR LIKE '%.retrieve%' OR RECORD:name::VARCHAR LIKE '%retriev%' THEN 'RETRIEVAL'
              WHEN RECORD:name::VARCHAR LIKE '%.generate%' OR RECORD:name::VARCHAR LIKE '%generat%' THEN 'GENERATION'
              WHEN RECORD:name::VARCHAR = 'collect' THEN 'SQL_EXECUTION'
              WHEN RECORD:name::VARCHAR LIKE '%think%' THEN 'PLANNING'
              WHEN RECORD:name::VARCHAR LIKE '%draft%' THEN 'GENERATION'
              WHEN RECORD:name::VARCHAR LIKE '%refine%' THEN 'RESPONSE_GEN'
              WHEN RECORD:name::VARCHAR LIKE '%ChatOpenAI%' THEN 'GENERATION'
              WHEN RECORD:name::VARCHAR LIKE '%CompiledStateGraph.invoke%' THEN 'AGENT_ROOT'
              WHEN RECORD:name::VARCHAR LIKE '%CompiledStateGraph.stream%' THEN 'AGENT_ROOT_DUP'
              WHEN RECORD:name::VARCHAR = 'graph' THEN 'AGENT_ROOT_DUP'
              WHEN RECORD:name::VARCHAR LIKE '%RunnableSequence%' THEN 'OTHER'
              ELSE 'OTHER'
            END AS span_kind,
            CASE
              WHEN RECORD:name::VARCHAR LIKE 'SemanticContextTool_%' THEN REPLACE(RECORD:name::VARCHAR, 'SemanticContextTool_', '')
              WHEN RECORD:name::VARCHAR LIKE 'CortexSearchService_%' THEN REPLACE(RECORD:name::VARCHAR, 'CortexSearchService_', '')
              WHEN RECORD:name::VARCHAR LIKE '%.__call__%' THEN SPLIT_PART(RECORD:name::VARCHAR, '.', 2)
              WHEN RECORD:name::VARCHAR LIKE '%.retrieve%' THEN 'retrieve'
              WHEN RECORD:name::VARCHAR LIKE '%.generate%' THEN 'generate'
              WHEN RECORD:name::VARCHAR LIKE '%think%' THEN 'Think'
              WHEN RECORD:name::VARCHAR LIKE '%draft%' THEN 'Draft'
              WHEN RECORD:name::VARCHAR LIKE '%refine%' THEN 'Refine'
              ELSE NULL
            END AS tool_name,
            DATEDIFF('millisecond', START_TIMESTAMP, TIMESTAMP) AS span_duration_ms,
            CASE WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' AND TRY_TO_NUMBER(REGEXP_SUBSTR(RECORD:name::VARCHAR, '\\\\d+$')) > 0 THEN 'true' ELSE 'false' END AS is_replan,
            CASE WHEN RECORD:severity_text::VARCHAR IN ('ERROR', 'FATAL') OR RECORD_ATTRIBUTES:"exception.type"::VARCHAR IS NOT NULL THEN 'true' ELSE 'false' END AS has_error,
            RECORD_ATTRIBUTES:"exception.message"::VARCHAR AS error_message,
            ${buildAttrExpr('model', selectedAgent?.agent_type || 'cortex_agent')} AS model,
            ${buildAttrExpr('query', selectedAgent?.agent_type || 'cortex_agent')} AS user_query,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.tool_selection.name"::VARCHAR AS selected_tool,
            ${buildAttrExpr('tokens_input', selectedAgent?.agent_type || 'cortex_agent')} AS input_tokens,
            ${buildAttrExpr('tokens_output', selectedAgent?.agent_type || 'cortex_agent')} AS output_tokens,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.token_count.total"::VARCHAR AS total_tokens,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.token_count.cache_read_input"::VARCHAR AS cache_read_tokens,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.token_count.cache_write_input"::VARCHAR AS cache_write_tokens,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.step_number"::VARCHAR AS step_number,
            LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.tool_selection.argument.value"::VARCHAR, 500) AS tool_args,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.tool_execution.name"::VARCHAR AS tool_exec_name,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.tool_execution.type"::VARCHAR AS tool_exec_type,
            ${buildAttrExpr('thinking', selectedAgent?.agent_type || 'cortex_agent')} AS thinking,
            LEFT(${buildAttrExpr('response_preview', selectedAgent?.agent_type || 'cortex_agent')}, 500) AS response_preview,
            ${buildAttrExpr('search_query', selectedAgent?.agent_type || 'cortex_agent')} AS search_query,
            LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.cortex_search.results"::VARCHAR, 500) AS search_results,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.cortex_search.limit"::VARCHAR AS search_limit,
            ${buildAttrExpr('status', selectedAgent?.agent_type || 'cortex_agent')} AS status,
            ${buildAttrExpr('sql_query', selectedAgent?.agent_type || 'cortex_agent')} AS sql_query,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.sql_execution.final_sql"::VARCHAR AS final_sql,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.sql_execution.execution_status"::VARCHAR AS execution_status,
            LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.sql_execution.result"::VARCHAR, 1000) AS sql_result_data,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.sql_execution.validation_error.0.message"::VARCHAR AS validation_error,
            RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.sql_execution.warehouse"::VARCHAR AS sql_warehouse,
            ${buildAttrExpr('query_id', selectedAgent?.agent_type || 'cortex_agent')} AS query_id,
            ${buildAttrExpr('num_rows', selectedAgent?.agent_type || 'cortex_agent')} AS num_rows,
            ${buildAttrExpr('verified_query_used', selectedAgent?.agent_type || 'cortex_agent')} AS verified_query_used,
            ${buildAttrExpr('semantic_model', selectedAgent?.agent_type || 'cortex_agent')} AS semantic_model,
            LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.chart_generation.input_chart_spec"::VARCHAR, 2000) AS chart_spec,
            LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.tool.chart_generation.data"::VARCHAR, 1000) AS chart_data_sql,
            NULL AS bytes_scanned, NULL AS compilation_time, NULL AS execution_time,
            NULL AS partitions_scanned, NULL AS partitions_total, NULL AS warehouse_name,
            START_TIMESTAMP::VARCHAR AS start_ts,
            TIMESTAMP::VARCHAR AS end_ts
          FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED
          WHERE agent_slug = '${slug}'
          AND RECORD_TYPE = 'SPAN'
            AND TRACE:trace_id::VARCHAR = '${traceId}'
            AND RECORD:name::VARCHAR NOT IN ('AgentV2RequestResponseInfo', 'CORTEX_AGENT_REQUEST')
          ORDER BY START_TIMESTAMP`,
        }),
      });
      const result = await response.json();
      setSpans(result.data || []);
    } catch { /* silent */ }
    finally { setSpansLoading(false); }
  }, [agentDb, agentSchema, agentName, attrMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQueryStats = useCallback(async (queryId: string) => {
    if (queryStats[queryId] || queryStatsLoading.has(queryId)) return;
    setQueryStatsLoading((prev) => new Set(prev).add(queryId));
    try {
      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT BYTES_SCANNED, COMPILATION_TIME, EXECUTION_TIME, PARTITIONS_SCANNED, PARTITIONS_TOTAL, WAREHOUSE_NAME
                FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY WHERE QUERY_ID = '${queryId}'`,
        }),
      });
      const result = await response.json();
      if (result.data && result.data.length > 0) {
        setQueryStats((prev) => ({ ...prev, [queryId]: result.data[0] }));
      } else {
        // Mark as empty so we don't refetch
        setQueryStats((prev) => ({ ...prev, [queryId]: {} }));
      }
    } catch { /* silent */ }
    finally {
      setQueryStatsLoading((prev) => { const next = new Set(prev); next.delete(queryId); return next; });
    }
  }, [queryStats, queryStatsLoading]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);
  useEffect(() => { 
    if (selectedTrace) { 
      const traceRow = traces.find((t) => t.trace_id === selectedTrace);
      const slug = traceRow?.agent_slug || '';
      fetchSpans(selectedTrace, slug); 
      setExpandedSpan(null); 
      setFeedback([]); 
      fetchFeedback(selectedTrace, slug); 
    } 
  }, [selectedTrace]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeedback = useCallback(async (traceId: string, agSlug?: string) => {
    try {
      let sql: string;
      const slug = agSlug || selectedTraceAgent?.agent_slug || '';
      const agType = agents.find(a => a.slug === slug)?.agent_type;
      const isExternal = agType === 'cortex_rest_api' || agType === 'external_agent';

      if (isExternal) {
        // For external agents, feedback is in AGENT_FEEDBACK table
        // Match by record_id found in the trace's span attributes
        const agentSlug = slug;
        sql = `WITH trace_records AS (
            SELECT DISTINCT RECORD_ATTRIBUTES:"ai.observability.record_id"::VARCHAR AS record_id
            FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED
            WHERE agent_slug = '${slug}'
            AND RECORD_TYPE = 'SPAN' AND TRACE:trace_id::VARCHAR = '${traceId}'
              AND RECORD_ATTRIBUTES:"ai.observability.record_id" IS NOT NULL
          )
          SELECT
            f.positive,
            f.categories::VARCHAR AS categories,
            f.feedback_message AS message,
            f.created_at::VARCHAR AS timestamp
          FROM AGENT_ROI_DEMO.APP.AGENT_FEEDBACK f
          INNER JOIN trace_records tr ON f.record_id = tr.record_id
          WHERE f.agent_slug = '${agentSlug}'
          ORDER BY f.created_at DESC
          LIMIT 5`;
      } else {
        // For Cortex agents, feedback is in observability events
        sql = `WITH trace_window AS (
            SELECT MIN(START_TIMESTAMP) AS trace_start, MAX(TIMESTAMP) AS trace_end
            FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED
            WHERE agent_slug = '${slug}'
            AND RECORD_TYPE = 'SPAN' AND TRACE:trace_id::VARCHAR = '${traceId}'
          )
          SELECT
            VALUE:positive::BOOLEAN AS positive,
            VALUE:categories::VARCHAR AS categories,
            VALUE:feedback_message::VARCHAR AS message,
            TIMESTAMP::VARCHAR AS timestamp
          FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED, trace_window tw
          WHERE agent_slug = '${slug}'
          AND RECORD:name::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
            AND TIMESTAMP BETWEEN tw.trace_end AND DATEADD('second', 60, tw.trace_end)
          ORDER BY TIMESTAMP
          LIMIT 3`;
      }

      // Get the Agent span's time window for this trace, then find feedback events within 60s after
      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const result = await response.json();
      setFeedback(result.data || []);
    } catch { /* silent */ }
  }, [agentDb, agentSchema, agentName, agentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a SQL span is expanded, fetch its query stats async
  useEffect(() => {
    if (expandedSpan) {
      const span = spans.find((s) => s.span_id === expandedSpan);
      if (span?.query_id) {
        fetchQueryStats(span.query_id);
      }
    }
  }, [expandedSpan, spans, fetchQueryStats]);

  const getSpanColor = (span: SpanRow) => {
    if (span.has_error === 'true') return 'bg-red-400';
    if (span.is_replan === 'true') return 'bg-amber-400';
    switch (span.span_kind) {
      case 'PLANNING': return 'bg-purple-400';
      case 'TOOL_ANALYST': return 'bg-blue-400';
      case 'TOOL_SEARCH': return 'bg-cyan-500';
      case 'SQL_EXECUTION': return 'bg-indigo-400';
      case 'RESPONSE_GEN': return 'bg-green-400';
      case 'GENERATION': return 'bg-green-400';
      case 'RETRIEVAL': return 'bg-cyan-500';
      case 'CHART_GEN': return 'bg-pink-400';
      case 'AGENT_ROOT': return 'bg-[var(--border-strong)]';
      default: return 'bg-[var(--border)]';
    }
  };

  const getSpanLabel = (span: SpanRow) => {
    if (span.tool_name) return span.tool_name;
    switch (span.span_kind) {
      case 'PLANNING': return 'Planning';
      case 'RESPONSE_GEN': return 'Response';
      case 'GENERATION': return 'Generate';
      case 'RETRIEVAL': return 'Retrieve';
      case 'AGENT_ROOT': return 'Agent';
      case 'SQL_EXECUTION': return 'SQL Exec';
      default: return span.span_kind;
    }
  };

  const hasDetails = (span: SpanRow) => {
    return span.model || span.user_query || span.selected_tool || span.search_query || span.thinking || span.response_preview || span.sql_query || span.query_id || span.status || span.num_rows || span.chart_spec || span.tool_exec_name || span.tool_args || span.sql_result_data;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-[var(--text-muted)] animate-pulse">Loading traces...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-6 py-8" style={{ maxWidth: '90rem' }}>
      {/* Header with Ask AI toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Traces</h1>
          <button
            onClick={async () => {
              const btn = document.getElementById('refresh-btn');
              if (btn) btn.textContent = 'Refreshing...';
              try {
                await fetch('/api/traces/refresh', { method: 'POST' });
                await fetchTraces();
              } catch { /* ignore */ }
              if (btn) btn.textContent = 'Refresh';
            }}
            id="refresh-btn"
            className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Refresh
          </button>
        </div>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showChat
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {showChat ? 'Close AI' : 'Ask AI'}
        </button>
      </div>

      <div className="flex h-[calc(100vh-9rem)] gap-4">
        {/* Left panel */}
        <div className="w-80 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-medium text-[var(--foreground)]">Recent Conversations</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{traces.length} traces</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {traces.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">No traces yet.</div>
            ) : (
              traces.map((trace) => (
                <button
                  key={trace.trace_id}
                  onClick={() => { setSelectedTrace(trace.trace_id); setSelectedAgentSlug(trace.agent_slug); }}
                  className={`w-full px-3 py-2 text-left border-b border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors ${
                    selectedTrace === trace.trace_id ? 'bg-[var(--surface-secondary)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">{trace.agent_name}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-medium shrink-0 ${
                        trace.agent_type === 'cortex_agent' ? 'bg-purple-100 text-purple-600' : trace.agent_type === 'cortex_rest_api' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {trace.agent_type === 'cortex_agent' ? 'Cortex Agent' : trace.agent_type === 'cortex_rest_api' ? 'Cortex REST API' : 'External'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {trace.has_any_error === 'true' && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                      {trace.has_replan === 'true' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      {trace.has_positive_feedback === 'true' && (
                        <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                      )}
                      {trace.has_negative_feedback === 'true' && (
                        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 0011.057 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {trace.started_at ? new Date(parseFloat(trace.started_at) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{(Number(trace.total_duration_ms) / 1000).toFixed(1)}s</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 border border-[var(--border)] rounded-xl bg-[var(--surface)] overflow-y-auto p-5">
          {!selectedTrace ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">Select a trace to view spans</div>
          ) : spansLoading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] animate-pulse">Loading spans...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-[var(--foreground)]">
                  Trace <span className="font-mono text-[var(--text-muted)]">{selectedTrace.slice(0, 16)}...</span>
                </h2>
                <div className="flex gap-3 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-400" /> Planning</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" /> Analyst</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500" /> Search</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-400" /> Response</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400" /> Error</span>
                </div>
              </div>

              {/* Waterfall - Gantt style */}
              <div className="space-y-1">
                {(() => {
                  // Use the Agent root span as the timeline bounds
                  const agentSpan = spans.find(s => s.span_kind === 'AGENT_ROOT');
                  const traceStart = agentSpan?.start_ts ? new Date(agentSpan.start_ts).getTime() : Math.min(...spans.filter(s => s.start_ts).map(s => new Date(s.start_ts!).getTime()));
                  const traceEnd = agentSpan?.end_ts ? new Date(agentSpan.end_ts).getTime() : Math.max(...spans.filter(s => s.end_ts).map(s => new Date(s.end_ts!).getTime()));
                  const totalDuration = traceEnd - traceStart || 1;

                  const visibleSpans = spans.filter(s =>
                    Number(s.span_duration_ms) > 50
                    && s.span_kind !== 'AGENT_ROOT'
                    && s.span_kind !== 'AGENT_ROOT_DUP'
                    // Deduplicate: SqlExecution_SystemSQL is nested inside SystemExecuteSQLTool, skip the inner one
                    && !(s.span_name === 'SqlExecution_SystemSQL' && spans.some(other => other.span_name === 'SystemExecuteSQLTool_system_execute_sql'))
                    // Deduplicate: 'collect' spans are Snowpark internals nested inside retrieve/generate, skip them
                    && !(s.span_name === 'collect' && spans.some(other => other.span_kind === 'RETRIEVAL' || other.span_kind === 'GENERATION'))
                  );

                  return visibleSpans.map((span, idx) => {
                    const spanStart = span.start_ts ? new Date(span.start_ts).getTime() : traceStart;
                    const spanEnd = span.end_ts ? new Date(span.end_ts).getTime() : spanStart + Number(span.span_duration_ms);
                    const leftPct = ((spanStart - traceStart) / totalDuration) * 100;
                    const widthPct = Math.max(2, ((spanEnd - spanStart) / totalDuration) * 100);

                    const isExpanded = expandedSpan === span.span_id;
                    const clickable = hasDetails(span);

                  return (
                    <div key={`${span.span_id}-${idx}`}>
                      <div
                        className={`flex items-center gap-3 py-0.5 ${clickable ? 'cursor-pointer' : ''}`}
                        onClick={() => clickable && setExpandedSpan(isExpanded ? null : span.span_id)}
                      >
                        <div className="w-28 flex items-center gap-1.5 justify-end">
                          {clickable && (
                            <svg className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          <span className="text-xs text-[var(--text-muted)] truncate">{getSpanLabel(span)}</span>
                        </div>
                        <div className="flex-1 relative h-6 bg-[var(--surface-secondary)] rounded">
                          <div
                            className={`absolute h-full rounded ${getSpanColor(span)} opacity-80`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                          <span
                            className="absolute top-1 text-[11px] text-[var(--foreground)] font-mono"
                            style={{ left: `${Math.min(leftPct + widthPct + 1, 85)}%` }}
                          >
                            {(Number(span.span_duration_ms) / 1000).toFixed(2)}s
                          </span>
                        </div>
                        <div className="w-20 text-right">
                          {span.has_error === 'true' && <span className="text-[11px] text-red-600">Error</span>}
                          {span.is_replan === 'true' && <span className="text-[11px] text-amber-600">Re-plan</span>}
                          {span.status && span.has_error !== 'true' && span.is_replan !== 'true' && (
                            <span className="text-[11px] text-green-600">{span.status}</span>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="ml-[7.5rem] mr-20 mt-1 mb-2 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg p-3 space-y-2 text-xs">
                          {span.step_number && (
                            <DetailRow label="Step" value={`#${span.step_number}`} />
                          )}
                          {span.model && (
                            <DetailRow label="Model" value={span.model} />
                          )}
                          {span.user_query && (
                            <DetailRow label="Query" value={span.user_query} />
                          )}
                          {span.selected_tool && (
                            <DetailRow label="Tool Selected" value={typeof span.selected_tool === 'object' ? JSON.stringify(span.selected_tool) : span.selected_tool} />
                          )}
                          {span.tool_args && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Tool Arguments:</span>
                              <pre className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap font-mono text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded p-2 max-h-24 overflow-y-auto">{typeof span.tool_args === 'object' ? JSON.stringify(span.tool_args, null, 2) : span.tool_args}</pre>
                            </div>
                          )}
                          {span.tool_exec_name && !span.selected_tool && (
                            <DetailRow label="Processing Results From" value={typeof span.tool_exec_name === 'object' ? JSON.stringify(span.tool_exec_name) : span.tool_exec_name} />
                          )}
                          {span.tool_exec_type && !span.selected_tool && (
                            <DetailRow label="Tool Type" value={typeof span.tool_exec_type === 'object' ? JSON.stringify(span.tool_exec_type) : span.tool_exec_type} />
                          )}
                          {span.search_query && (
                            <DetailRow label="Search Query" value={span.search_query} />
                          )}
                          {span.search_limit && (
                            <DetailRow label="Search Limit" value={span.search_limit} />
                          )}
                          {(span.input_tokens || span.output_tokens) && (
                            <DetailRow label="Tokens" value={`${span.input_tokens || 0} in / ${span.output_tokens || 0} out${span.total_tokens ? ` (${span.total_tokens} total)` : ''}${span.cache_read_tokens ? ` | cache read: ${span.cache_read_tokens}` : ''}${span.cache_write_tokens ? ` | cache write: ${span.cache_write_tokens}` : ''}`} />
                          )}
                          {span.thinking && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Thinking:</span>
                              <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{typeof span.thinking === 'object' ? JSON.stringify(span.thinking) : span.thinking}</p>
                            </div>
                          )}
                          {span.search_results && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Search Results:</span>
                              <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap max-h-32 overflow-y-auto">{typeof span.search_results === 'object' ? JSON.stringify(span.search_results) : span.search_results}</p>
                            </div>
                          )}
                          {span.sql_query && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">SQL Query:</span>
                              <pre className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap font-mono text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded p-2 max-h-40 overflow-y-auto">{typeof span.sql_query === 'object' ? JSON.stringify(span.sql_query) : span.sql_query}</pre>
                            </div>
                          )}
                          {span.final_sql && span.final_sql !== span.sql_query && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Final SQL (rewritten):</span>
                              <pre className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap font-mono text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded p-2 max-h-40 overflow-y-auto">{typeof span.final_sql === 'object' ? JSON.stringify(span.final_sql) : span.final_sql}</pre>
                            </div>
                          )}
                          {span.execution_status && (
                            <DetailRow label="Execution Status" value={span.execution_status} />
                          )}
                          {span.validation_error && (
                            <div>
                              <span className="text-amber-600 font-medium">Validation Warning:</span>
                              <p className="text-amber-700 mt-0.5">{typeof span.validation_error === 'object' ? JSON.stringify(span.validation_error) : span.validation_error}</p>
                            </div>
                          )}
                          {span.sql_result_data && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Result Data:</span>
                              <pre className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap font-mono text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded p-2 max-h-32 overflow-y-auto">{typeof span.sql_result_data === 'object' ? JSON.stringify(span.sql_result_data, null, 2) : (() => { try { return JSON.stringify(JSON.parse(span.sql_result_data), null, 2); } catch { return span.sql_result_data; } })()}</pre>
                            </div>
                          )}
                          {span.sql_warehouse && (
                            <DetailRow label="Warehouse" value={span.sql_warehouse} />
                          )}
                          {span.query_id && (
                            <DetailRow label="Query ID" value={span.query_id} />
                          )}
                          {span.verified_query_used && (
                            <DetailRow label="Verified Query Used" value={span.verified_query_used === 'true' ? 'Yes (matched a verified query)' : 'No (generated from scratch)'} />
                          )}
                          {span.semantic_model && (
                            <DetailRow label="Semantic Model" value={span.semantic_model} />
                          )}
                          {span.num_rows && (
                            <DetailRow label="Rows Returned" value={span.num_rows} />
                          )}
                          {/* Chart Generation details */}
                          {span.chart_spec && (
                            <div className="border-t border-[var(--border)] pt-2 mt-2">
                              <span className="text-[var(--text-muted)] font-medium text-[11px] uppercase tracking-wider">Chart Generation</span>
                              <div className="mt-1.5 space-y-2">
                                <div>
                                  <span className="text-[var(--text-muted)] font-medium">Vega-Lite Spec:</span>
                                  <pre className="text-xs text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap max-h-40 overflow-y-auto bg-[var(--surface-secondary)] rounded p-2 font-mono">{typeof span.chart_spec === 'object' ? JSON.stringify(span.chart_spec, null, 2) : (() => { try { return JSON.stringify(JSON.parse(span.chart_spec), null, 2); } catch { return String(span.chart_spec); } })()}</pre>
                                </div>
                                {span.chart_data_sql && (
                                  <div>
                                    <span className="text-[var(--text-muted)] font-medium">Data SQL:</span>
                                    <pre className="text-xs text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap max-h-24 overflow-y-auto bg-[var(--surface-secondary)] rounded p-2 font-mono">{typeof span.chart_data_sql === 'object' ? JSON.stringify(span.chart_data_sql) : span.chart_data_sql}</pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Query History details - loaded async */}
                          {span.query_id && (
                            <div className="border-t border-[var(--border)] pt-2 mt-2">
                              <span className="text-[var(--text-muted)] font-medium text-[11px] uppercase tracking-wider">Query Execution Stats</span>
                              {queryStatsLoading.has(span.query_id) ? (
                                <p className="text-[var(--text-muted)] mt-1 animate-pulse">Loading execution stats...</p>
                              ) : queryStats[span.query_id] && Object.keys(queryStats[span.query_id]).length > 0 ? (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5">
                                  {queryStats[span.query_id].warehouse_name && <DetailRow label="Warehouse" value={queryStats[span.query_id].warehouse_name} />}
                                  {queryStats[span.query_id].bytes_scanned && <DetailRow label="Bytes Scanned" value={formatBytes(Number(queryStats[span.query_id].bytes_scanned))} />}
                                  {queryStats[span.query_id].compilation_time && <DetailRow label="Compile Time" value={`${(Number(queryStats[span.query_id].compilation_time) / 1000).toFixed(2)}s`} />}
                                  {queryStats[span.query_id].execution_time && <DetailRow label="Execution Time" value={`${(Number(queryStats[span.query_id].execution_time) / 1000).toFixed(2)}s`} />}
                                  {queryStats[span.query_id].partitions_scanned && queryStats[span.query_id].partitions_total && (
                                    <DetailRow label="Partitions" value={`${queryStats[span.query_id].partitions_scanned} / ${queryStats[span.query_id].partitions_total} scanned`} />
                                  )}
                                </div>
                              ) : queryStats[span.query_id] ? (
                                <p className="text-[var(--text-muted)] mt-1">Stats not yet available (up to 45 min latency)</p>
                              ) : null}
                            </div>
                          )}
                          {span.response_preview && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Response:</span>
                              <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap max-h-32 overflow-y-auto">{typeof span.response_preview === 'object' ? JSON.stringify(span.response_preview) : span.response_preview}</p>
                            </div>
                          )}
                          {span.error_message && (
                            <div>
                              <span className="text-red-600 font-medium">Error:</span>
                              <p className="text-red-700 mt-0.5">{typeof span.error_message === 'object' ? JSON.stringify(span.error_message) : span.error_message}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
                })()}

                {/* Other Overhead row */}
                {spans.length > 0 && (() => {
                  const agentSpan = spans.find(s => s.span_kind === 'AGENT_ROOT');
                  if (!agentSpan?.start_ts || !agentSpan?.end_ts) return null;
                  const traceStart = new Date(agentSpan.start_ts).getTime();
                  const traceEnd = new Date(agentSpan.end_ts).getTime();
                  const totalDuration = traceEnd - traceStart || 1;
                  const agentDurationMs = Number(agentSpan.span_duration_ms);

                  const childSpans = spans.filter(s => s.span_kind !== 'AGENT_ROOT' && s.span_kind !== 'OTHER' && Number(s.span_duration_ms) > 50);
                  const childTotalMs = childSpans.reduce((sum, s) => sum + Number(s.span_duration_ms), 0);
                  const overheadMs = Math.max(0, agentDurationMs - childTotalMs);
                  if (overheadMs < 100) return null;

                  // Position at where the last child span ends
                  const lastChildEnd = childSpans.length > 0
                    ? Math.max(...childSpans.filter(s => s.end_ts).map(s => new Date(s.end_ts!).getTime()))
                    : traceStart;
                  const leftPct = ((lastChildEnd - traceStart) / totalDuration) * 100;
                  const widthPct = Math.max(2, ((traceEnd - lastChildEnd) / totalDuration) * 100);

                  return (
                    <div className="flex items-center gap-3 py-0.5 mt-1 border-t border-dashed border-[var(--border)] pt-1.5">
                      <div className="w-28 flex items-center gap-1.5 justify-end">
                        <span className="text-xs text-[var(--text-muted)] italic">Overhead</span>
                      </div>
                      <div className="flex-1 relative h-6 bg-[var(--surface-secondary)] rounded">
                        <div
                          className="absolute h-full rounded bg-[var(--border-strong)] opacity-50"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        />
                        <span
                          className="absolute top-1 text-[11px] text-[var(--text-muted)] font-mono"
                          style={{ left: `${Math.min(leftPct + widthPct + 1, 85)}%` }}
                        >
                          {(overheadMs / 1000).toFixed(2)}s
                        </span>
                      </div>
                      <div className="w-20 text-right">
                        <span className="text-[11px] text-[var(--text-muted)]">{Math.round((overheadMs / agentDurationMs) * 100)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Total time footer */}
              {spans.length > 0 && (() => {
                const agentSpan = spans.find(s => s.span_kind === 'AGENT_ROOT');
                if (!agentSpan) return null;
                return (
                  <div className="flex items-center gap-3 pt-3 mt-2 border-t border-[var(--border)]">
                    <div className="w-28 text-right">
                      <span className="text-xs font-medium text-[var(--foreground)]">Total</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-mono font-medium text-[var(--foreground)]">
                        {(Number(agentSpan.span_duration_ms) / 1000).toFixed(2)}s
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Feedback for this trace */}
              {feedback.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">User Feedback</span>
                  <div className="mt-2 space-y-2">
                    {feedback.map((fb, i) => (
                      <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${fb.positive ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                        <svg className={`w-4 h-4 mt-0.5 shrink-0 ${fb.positive ? 'text-green-600' : 'text-red-600'}`} fill="currentColor" viewBox="0 0 20 20">
                          {fb.positive
                            ? <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                            : <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 0011.057 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                          }
                        </svg>
                        <div className="flex-1 min-w-0">
                          {(() => {
                            // Parse categories - can be array, JSON string, or comma-separated string
                            let cats: string[] = [];
                            if (Array.isArray(fb.categories)) {
                              cats = fb.categories;
                            } else if (typeof fb.categories === 'string' && fb.categories.length > 0) {
                              try { cats = JSON.parse(fb.categories); } catch { cats = fb.categories.split(',').map((s: string) => s.trim()); }
                            }
                            return cats.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {cats.map((cat: string, j: number) => (
                                  <span key={j} className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                                    {cat.replace(/[\[\]"]/g, '').trim()}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          })()}
                          {fb.message && fb.message.length > 0 && (
                            <p className="text-xs text-[var(--text-secondary)]">{fb.message}</p>
                          )}
                          {(() => {
                            let cats: string[] = [];
                            if (Array.isArray(fb.categories)) cats = fb.categories;
                            else if (typeof fb.categories === 'string' && fb.categories.length > 0) {
                              try { cats = JSON.parse(fb.categories); } catch { cats = []; }
                            }
                            if (cats.length === 0 && (!fb.message || fb.message.length === 0)) {
                              return <p className="text-xs text-[var(--text-muted)] italic">No details provided</p>;
                            }
                            return null;
                          })()}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                          {fb.timestamp?.split('.')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {spans.length === 0 && (
                <div className="text-center text-[var(--text-muted)] py-8">No spans found for this trace</div>
              )}
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        {showChat && (
          <div className="w-80 shrink-0 rounded-xl overflow-hidden border border-[var(--border)]">
            <TraceChat
              traceContext={selectedTrace && spans.length > 0 ? {
                traceId: selectedTrace,
                duration: (() => {
                  const agent = spans.find(s => s.span_kind === 'AGENT_ROOT');
                  return agent ? (Number(agent.span_duration_ms) / 1000).toFixed(2) : '?';
                })(),
                spanCount: spans.filter(s => Number(s.span_duration_ms) > 50 && s.span_kind !== 'AGENT_ROOT').length,
                tools: [...new Set(spans.filter(s => s.tool_name).map(s => s.tool_name!))],
                hasError: spans.some(s => s.has_error === 'true'),
                hasReplan: spans.some(s => s.is_replan === 'true'),
              } : undefined}
              onClose={() => setShowChat(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  const displayValue = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  return (
    <div className="flex gap-2">
      <span className="text-[var(--text-muted)] font-medium shrink-0">{label}:</span>
      <span className="text-[var(--text-secondary)] break-all">{displayValue}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
