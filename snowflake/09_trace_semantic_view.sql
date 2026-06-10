-- Agent ROI Demo: Semantic View over Trace Observability Data
-- Used by the TRACE_ANALYST_AGENT to answer questions about agent performance

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE OR REPLACE SEMANTIC VIEW AGENT_ROI_DEMO.APP.TRACE_OBSERVABILITY_VIEW

  TABLES (
    trace_spans AS AGENT_ROI_DEMO.APP.TRACE_SPANS_DT
      PRIMARY KEY (span_id)
      COMMENT = 'Agent execution spans: planning, tool calls, SQL execution, response generation',
    trace_feedback AS AGENT_ROI_DEMO.APP.TRACE_FEEDBACK_DT
      COMMENT = 'User feedback events: thumbs up/down, task start/complete, star ratings'
  )

  DIMENSIONS (
    trace_spans.dim_trace_id AS trace_id
      COMMENT = 'Unique identifier for a conversation/request',
    trace_spans.span_kind AS span_kind
      COMMENT = 'Type: PLANNING, TOOL_ANALYST, TOOL_SEARCH, SQL_EXECUTION, RESPONSE_GEN, CHART_GEN, AGENT_ROOT',
    trace_spans.tool_name AS tool_name
      COMMENT = 'Name of tool invoked: SALES_ANALYST, KNOWLEDGE_SEARCH, or NULL',
    trace_spans.is_replan AS is_replan
      COMMENT = 'Whether this was a re-planning step',
    trace_spans.has_error AS has_error
      COMMENT = 'Whether this span encountered an error',
    trace_spans.error_message AS error_message
      COMMENT = 'Error message if the span failed',
    trace_spans.span_start AS start_timestamp
      COMMENT = 'When the span started',
    trace_feedback.feedback_type AS event_type
      COMMENT = 'Type: thumbs_up, thumbs_down, task_start, task_complete, task_cancelled',
    trace_feedback.is_positive AS positive
      COMMENT = 'Whether feedback was positive or negative',
    trace_feedback.star_rating AS stars
      COMMENT = 'Star rating 1-5',
    trace_feedback.dim_task_value AS task_value
      COMMENT = 'Value of outcome: Low, Medium, High, Critical',
    trace_feedback.dim_time_saved AS time_saved
      COMMENT = 'Time saved: < 5 min, 5-15 min, 15-30 min, 30-60 min, 1+ hour',
    trace_feedback.dim_automated AS automated
      COMMENT = 'Whether the task was fully automated: yes/no',
    trace_feedback.feedback_text AS feedback_message
      COMMENT = 'Free-text feedback from user',
    trace_feedback.feedback_time AS submitted_at
      COMMENT = 'When feedback was submitted'
  )

  METRICS (
    trace_spans.span_count AS COUNT(span_id)
      COMMENT = 'Total number of spans',
    trace_spans.error_count AS COUNT_IF(has_error)
      COMMENT = 'Number of spans with errors',
    trace_spans.replan_count AS COUNT_IF(is_replan)
      COMMENT = 'Number of re-planning events',
    trace_spans.avg_duration_ms AS AVG(span_duration_ms)
      COMMENT = 'Average span duration in milliseconds',
    trace_spans.max_duration_ms AS MAX(span_duration_ms)
      COMMENT = 'Maximum span duration in milliseconds',
    trace_spans.distinct_trace_count AS COUNT(DISTINCT trace_id)
      COMMENT = 'Number of unique conversations',
    trace_feedback.positive_count AS COUNT_IF(positive)
      COMMENT = 'Number of positive feedback events',
    trace_feedback.negative_count AS COUNT_IF(NOT positive)
      COMMENT = 'Number of negative feedback events',
    trace_feedback.avg_stars AS AVG(stars)
      COMMENT = 'Average star rating'
  )

  COMMENT = 'Observability data for the ROI Demo Agent'

  AI_SQL_GENERATION 'When computing error rates, divide error_count by span_count. Convert milliseconds to seconds by dividing by 1000. Filter out AGENT_ROOT span_kind for per-step metrics.'

  AI_VERIFIED_QUERIES (
    avg_latency_by_tool AS (
      QUESTION 'What is the average latency by tool?'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT tool_name, AVG(span_duration_ms)/1000.0 AS avg_seconds FROM AGENT_ROI_DEMO.APP.TRACE_SPANS_DT WHERE tool_name IS NOT NULL GROUP BY tool_name ORDER BY avg_seconds DESC'
    ),
    errors_last_7_days AS (
      QUESTION 'How many errors occurred in the last 7 days?'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT COUNT(*) AS error_count FROM AGENT_ROI_DEMO.APP.TRACE_SPANS_DT WHERE has_error = TRUE AND start_timestamp >= DATEADD(''day'', -7, CURRENT_TIMESTAMP())'
    ),
    negative_feedback AS (
      QUESTION 'Show all negative feedback with comments'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT event_type, feedback_message, stars, task_value, submitted_at FROM AGENT_ROI_DEMO.APP.TRACE_FEEDBACK_DT WHERE positive = FALSE ORDER BY submitted_at DESC'
    ),
    replan_pct AS (
      QUESTION 'What percentage of requests have replans?'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT COUNT(DISTINCT CASE WHEN is_replan THEN trace_id END)::FLOAT / NULLIF(COUNT(DISTINCT trace_id), 0) * 100 AS replan_pct FROM AGENT_ROI_DEMO.APP.TRACE_SPANS_DT'
    ),
    feedback_breakdown AS (
      QUESTION 'What is the breakdown of feedback types?'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT event_type, COUNT(*) AS count, AVG(stars) AS avg_stars FROM AGENT_ROI_DEMO.APP.TRACE_FEEDBACK_DT GROUP BY event_type ORDER BY count DESC'
    ),
    tool_error_rate AS (
      QUESTION 'Which tool has the highest error rate?'
      VERIFIED_AT 1748600000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT span_kind, COUNT_IF(has_error)::FLOAT / COUNT(*) * 100 AS error_rate_pct, COUNT(*) AS total_spans FROM AGENT_ROI_DEMO.APP.TRACE_SPANS_DT WHERE span_kind NOT IN (''AGENT_ROOT'', ''OTHER'') GROUP BY span_kind ORDER BY error_rate_pct DESC'
    )
  );
