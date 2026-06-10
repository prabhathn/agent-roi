-- Agent ROI Demo: Telemetry SQL Views
-- Reads from AI_OBSERVABILITY_EVENTS and CORTEX_AI_FUNCTIONS_USAGE_HISTORY
-- to power the ROI dashboard

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

----------------------------------------------------------------------
-- VIEW 1: v_agent_spans
-- Parses span-level telemetry from observability events
----------------------------------------------------------------------
CREATE OR REPLACE VIEW AGENT_ROI_DEMO.APP.V_AGENT_SPANS AS
SELECT
  TRACE:trace_id::VARCHAR AS trace_id,
  TRACE:span_id::VARCHAR AS span_id,
  RECORD:name::VARCHAR AS span_name,
  RECORD_TYPE,
  -- Categorize span types
  CASE
    WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%' THEN 'PLANNING'
    WHEN RECORD:name::VARCHAR LIKE 'CortexAnalystTool%' THEN 'TOOL_ANALYST'
    WHEN RECORD:name::VARCHAR LIKE 'CortexSearchTool%' THEN 'TOOL_SEARCH'
    WHEN RECORD:name::VARCHAR LIKE 'SqlExecution%' THEN 'SQL_EXECUTION'
    WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepResponseGeneration%' THEN 'RESPONSE_GEN'
    WHEN RECORD:name::VARCHAR LIKE 'CortexChartToolImpl%' THEN 'CHART_GEN'
    WHEN RECORD:name::VARCHAR = 'Agent' THEN 'AGENT_ROOT'
    WHEN RECORD:name::VARCHAR = 'AgentV2RequestResponseInfo' THEN 'REQUEST_INFO'
    WHEN RECORD:name::VARCHAR = 'CORTEX_AGENT_REQUEST' THEN 'REQUEST_EVENT'
    ELSE 'OTHER'
  END AS span_kind,
  -- Extract tool name from span name (e.g., CortexAnalystTool_SALES_ANALYST -> SALES_ANALYST)
  CASE
    WHEN RECORD:name::VARCHAR LIKE 'CortexAnalystTool_%'
      THEN REPLACE(RECORD:name::VARCHAR, 'CortexAnalystTool_', '')
    WHEN RECORD:name::VARCHAR LIKE 'CortexSearchTool_%'
      THEN REPLACE(RECORD:name::VARCHAR, 'CortexSearchTool_', '')
    ELSE NULL
  END AS tool_name,
  -- Duration in milliseconds
  DATEDIFF('millisecond', START_TIMESTAMP, TIMESTAMP) AS span_duration_ms,
  -- Is this a re-plan? (planning step number > 0, i.e., Planning-1, Planning-2, etc.)
  CASE
    WHEN RECORD:name::VARCHAR LIKE 'ReasoningAgentStepPlanning%'
      AND TRY_TO_NUMBER(REGEXP_SUBSTR(RECORD:name::VARCHAR, '\\d+$')) > 0
    THEN TRUE
    ELSE FALSE
  END AS is_replan,
  -- Error detection from record severity or status
  CASE
    WHEN RECORD:severity_text::VARCHAR IN ('ERROR', 'FATAL') THEN TRUE
    WHEN RECORD_ATTRIBUTES:"exception.type"::VARCHAR IS NOT NULL THEN TRUE
    ELSE FALSE
  END AS has_error,
  RECORD_ATTRIBUTES:"exception.message"::VARCHAR AS error_message,
  START_TIMESTAMP,
  TIMESTAMP AS end_timestamp
FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(
  'AGENT_ROI_DEMO', 'APP', 'ROI_DEMO_AGENT', 'CORTEX AGENT'
))
WHERE RECORD_TYPE = 'SPAN';

----------------------------------------------------------------------
-- VIEW 2: v_agent_feedback
-- Parses feedback events with structured categories
----------------------------------------------------------------------
CREATE OR REPLACE VIEW AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK AS
SELECT
  TRACE:trace_id::VARCHAR AS trace_id,
  VALUE:orig_request_id::VARCHAR AS request_id,
  VALUE:thread_id::VARCHAR AS thread_id,
  VALUE:positive::BOOLEAN AS positive,
  VALUE:feedback_message::VARCHAR AS feedback_message,
  -- Parse structured categories
  VALUE:categories AS categories_array,
  -- Determine feedback event type from categories
  CASE
    WHEN ARRAY_CONTAINS('task:start'::VARIANT, VALUE:categories) THEN 'task_start'
    WHEN ARRAY_CONTAINS('task:complete'::VARIANT, VALUE:categories) THEN 'task_complete'
    WHEN ARRAY_CONTAINS('task:cancelled'::VARIANT, VALUE:categories) THEN 'task_cancelled'
    WHEN VALUE:positive::BOOLEAN = TRUE THEN 'thumbs_up'
    WHEN VALUE:positive::BOOLEAN = FALSE THEN 'thumbs_down'
    ELSE 'unknown'
  END AS event_type,
  -- Extract star rating from categories (e.g., "stars:4")
  TRY_TO_NUMBER(
    REGEXP_SUBSTR(
      ARRAY_TO_STRING(VALUE:categories, ','),
      'stars:(\\d+)', 1, 1, 'e', 1
    )
  ) AS stars,
  -- Extract value level from categories (e.g., "value:High")
  REGEXP_SUBSTR(
    ARRAY_TO_STRING(VALUE:categories, ','),
    'value:([^,]+)', 1, 1, 'e', 1
  ) AS task_value,
  -- Extract time saved from categories (e.g., "time_saved:15-30 min")
  REGEXP_SUBSTR(
    ARRAY_TO_STRING(VALUE:categories, ','),
    'time_saved:([^,]+)', 1, 1, 'e', 1
  ) AS time_saved,
  -- Extract automated flag (e.g., "automated:yes")
  REGEXP_SUBSTR(
    ARRAY_TO_STRING(VALUE:categories, ','),
    'automated:([^,]+)', 1, 1, 'e', 1
  ) AS automated,
  TIMESTAMP AS submitted_at
FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(
  'AGENT_ROI_DEMO', 'APP', 'ROI_DEMO_AGENT', 'CORTEX AGENT'
))
WHERE RECORD:name::VARCHAR = 'CORTEX_AGENT_FEEDBACK';

----------------------------------------------------------------------
-- VIEW 3: v_task_pairs
-- Matches task:start with task:complete or task:cancelled by thread_id
----------------------------------------------------------------------
CREATE OR REPLACE VIEW AGENT_ROI_DEMO.APP.V_TASK_PAIRS AS
WITH starts AS (
  SELECT
    thread_id,
    submitted_at AS started_at,
    feedback_message AS task_description,
    ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY submitted_at) AS seq
  FROM AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK
  WHERE event_type = 'task_start'
),
completions AS (
  SELECT
    thread_id,
    submitted_at AS completed_at,
    event_type,
    stars,
    task_value,
    time_saved,
    automated,
    feedback_message AS completion_comment,
    ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY submitted_at) AS seq
  FROM AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK
  WHERE event_type IN ('task_complete', 'task_cancelled')
)
SELECT
  s.thread_id,
  s.started_at,
  s.task_description,
  c.completed_at,
  DATEDIFF('second', s.started_at, c.completed_at) AS duration_seconds,
  c.stars,
  c.task_value,
  c.time_saved,
  c.automated,
  c.completion_comment,
  CASE
    WHEN c.event_type = 'task_complete' THEN 'completed'
    WHEN c.event_type = 'task_cancelled' THEN 'cancelled'
    WHEN c.event_type IS NULL AND DATEDIFF('hour', s.started_at, CURRENT_TIMESTAMP()) > 24 THEN 'abandoned'
    ELSE 'in_progress'
  END AS task_status
FROM starts s
LEFT JOIN completions c
  ON s.thread_id = c.thread_id
  AND s.seq = c.seq;

----------------------------------------------------------------------
-- VIEW 4: v_agent_costs
-- Credit consumption from CORTEX_AI_FUNCTIONS_USAGE_HISTORY
----------------------------------------------------------------------
CREATE OR REPLACE VIEW AGENT_ROI_DEMO.APP.V_AGENT_COSTS AS
SELECT
  QUERY_ID,
  CREDITS,
  FUNCTION_NAME,
  MODEL_NAME,
  START_TIME,
  END_TIME,
  METRICS,
  USER_ID
FROM SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AI_FUNCTIONS_USAGE_HISTORY
WHERE START_TIME >= DATEADD('day', -30, CURRENT_TIMESTAMP());

----------------------------------------------------------------------
-- VIEW 5: v_roi_summary
-- Aggregate metrics for the dashboard (daily buckets)
----------------------------------------------------------------------
CREATE OR REPLACE VIEW AGENT_ROI_DEMO.APP.V_ROI_SUMMARY AS
WITH daily_spans AS (
  SELECT
    DATE_TRUNC('day', end_timestamp) AS day_bucket,
    COUNT(*) AS total_spans,
    COUNT(DISTINCT trace_id) AS total_requests,
    AVG(CASE WHEN span_kind = 'AGENT_ROOT' THEN span_duration_ms END) AS avg_latency_ms,
    SUM(CASE WHEN has_error THEN 1 ELSE 0 END) AS error_spans,
    SUM(CASE WHEN is_replan THEN 1 ELSE 0 END) AS replan_spans
  FROM AGENT_ROI_DEMO.APP.V_AGENT_SPANS
  WHERE span_kind != 'REQUEST_EVENT'
  GROUP BY 1
),
daily_feedback AS (
  SELECT
    DATE_TRUNC('day', submitted_at) AS day_bucket,
    SUM(CASE WHEN event_type = 'thumbs_up' THEN 1 ELSE 0 END) AS thumbs_up,
    SUM(CASE WHEN event_type = 'thumbs_down' THEN 1 ELSE 0 END) AS thumbs_down,
    SUM(CASE WHEN event_type = 'task_complete' THEN 1 ELSE 0 END) AS tasks_completed,
    SUM(CASE WHEN event_type = 'task_cancelled' THEN 1 ELSE 0 END) AS tasks_cancelled,
    SUM(CASE WHEN event_type = 'task_start' THEN 1 ELSE 0 END) AS tasks_started,
    COUNT(*) AS total_feedback_events
  FROM AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK
  GROUP BY 1
),
daily_costs AS (
  SELECT
    DATE_TRUNC('day', START_TIME) AS day_bucket,
    SUM(CREDITS) AS total_credits,
    COUNT(DISTINCT QUERY_ID) AS total_queries
  FROM AGENT_ROI_DEMO.APP.V_AGENT_COSTS
  GROUP BY 1
)
SELECT
  COALESCE(s.day_bucket, f.day_bucket, c.day_bucket) AS day_bucket,
  -- Span metrics
  COALESCE(s.total_requests, 0) AS total_requests,
  s.avg_latency_ms,
  COALESCE(s.total_spans, 0) AS total_spans,
  COALESCE(s.error_spans, 0) AS error_spans,
  COALESCE(s.replan_spans, 0) AS replan_spans,
  -- Feedback metrics
  COALESCE(f.thumbs_up, 0) AS thumbs_up,
  COALESCE(f.thumbs_down, 0) AS thumbs_down,
  COALESCE(f.tasks_completed, 0) AS tasks_completed,
  COALESCE(f.tasks_cancelled, 0) AS tasks_cancelled,
  COALESCE(f.tasks_started, 0) AS tasks_started,
  -- Cost metrics
  COALESCE(c.total_credits, 0) AS total_credits,
  -- Derived rates
  CASE WHEN (COALESCE(f.thumbs_up, 0) + COALESCE(f.thumbs_down, 0)) > 0
    THEN f.thumbs_up::FLOAT / (f.thumbs_up + f.thumbs_down)
    ELSE NULL
  END AS positive_rate,
  CASE WHEN COALESCE(s.total_spans, 0) > 0
    THEN (s.error_spans + s.replan_spans)::FLOAT / s.total_spans
    ELSE NULL
  END AS error_rate,
  CASE WHEN COALESCE(s.total_requests, 0) > 0
    THEN c.total_credits / s.total_requests
    ELSE NULL
  END AS credits_per_request,
  -- ROI Score: (Positive Rate x (1 - Error Rate)) / Credits Per Request
  CASE
    WHEN (COALESCE(f.thumbs_up, 0) + COALESCE(f.thumbs_down, 0)) > 0
      AND COALESCE(s.total_spans, 0) > 0
      AND COALESCE(s.total_requests, 0) > 0
      AND c.total_credits > 0
    THEN (
      (f.thumbs_up::FLOAT / (f.thumbs_up + f.thumbs_down))
      * (1 - ((s.error_spans + s.replan_spans)::FLOAT / s.total_spans))
    ) / (c.total_credits / s.total_requests)
    ELSE NULL
  END AS roi_score
FROM daily_spans s
FULL OUTER JOIN daily_feedback f ON s.day_bucket = f.day_bucket
FULL OUTER JOIN daily_costs c ON COALESCE(s.day_bucket, f.day_bucket) = c.day_bucket
ORDER BY day_bucket DESC;
