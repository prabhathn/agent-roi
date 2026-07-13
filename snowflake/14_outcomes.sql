-- 14_outcomes.sql
-- Outcome tracking tables for AI-classified conversation outcomes
-- Supports per-agent categories, AI_CLASSIFY integration, and rolling quality baselines

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

-- ============================================================
-- OUTCOME_CATEGORIES: Per-agent configurable outcome types
-- ============================================================
CREATE TABLE IF NOT EXISTS OUTCOME_CATEGORIES (
  id VARCHAR DEFAULT UUID_STRING() PRIMARY KEY,
  agent_slug VARCHAR NOT NULL,
  category_name VARCHAR NOT NULL,
  category_type VARCHAR NOT NULL,  -- success, failure, partial, neutral
  dollar_value NUMBER(10,2) DEFAULT 0,
  color VARCHAR DEFAULT '#6b7280',
  sort_order NUMBER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  UNIQUE(agent_slug, category_name)
);

-- ============================================================
-- AGENT_OUTCOMES: Classified outcome per trace
-- ============================================================
CREATE TABLE IF NOT EXISTS AGENT_OUTCOMES (
  id VARCHAR DEFAULT UUID_STRING() PRIMARY KEY,
  trace_id VARCHAR NOT NULL UNIQUE,
  agent_slug VARCHAR NOT NULL,
  category_id VARCHAR NOT NULL,
  classification_method VARCHAR NOT NULL,  -- ai_classify, feedback, manual
  feedback_signal VARCHAR,                 -- thumbs_up, thumbs_down, none
  ai_classify_probability NUMBER(5,4),     -- confidence from AI_CLASSIFY
  quality_score NUMBER(5,4) DEFAULT 1.0,   -- 0.0 to 1.0
  computed_value NUMBER(10,2),             -- category.dollar_value * quality_score
  trace_summary VARCHAR,                   -- input text sent to AI_CLASSIFY
  override_reason VARCHAR,
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  overridden_at TIMESTAMP
);

-- ============================================================
-- OUTCOME_BASELINES: Rolling averages per category for quality scoring
-- ============================================================
CREATE TABLE IF NOT EXISTS OUTCOME_BASELINES (
  agent_slug VARCHAR NOT NULL,
  category_id VARCHAR NOT NULL,
  avg_latency_ms NUMBER(10,2),
  avg_replan_count NUMBER(5,2),
  avg_span_count NUMBER(5,2),
  error_rate NUMBER(5,4),
  sample_count NUMBER,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY(agent_slug, category_id)
);

-- ============================================================
-- Seed default categories for each agent
-- ============================================================

-- Sales & Policy Agent
INSERT INTO OUTCOME_CATEGORIES (agent_slug, category_name, category_type, dollar_value, color, sort_order)
SELECT * FROM VALUES
  ('roi-demo-agent', 'Question Answered', 'success', 50.00, '#16a34a', 1),
  ('roi-demo-agent', 'Policy Clarified', 'success', 30.00, '#22c55e', 2),
  ('roi-demo-agent', 'Chart Generated', 'success', 40.00, '#0ea5e9', 3),
  ('roi-demo-agent', 'Partial Answer', 'partial', 15.00, '#f59e0b', 4),
  ('roi-demo-agent', 'Failed', 'failure', -10.00, '#ef4444', 5)
WHERE NOT EXISTS (SELECT 1 FROM OUTCOME_CATEGORIES WHERE agent_slug = 'roi-demo-agent');

-- Knowledge RAG Agent
INSERT INTO OUTCOME_CATEGORIES (agent_slug, category_name, category_type, dollar_value, color, sort_order)
SELECT * FROM VALUES
  ('knowledge-rag-agent', 'Issue Resolved', 'success', 75.00, '#16a34a', 1),
  ('knowledge-rag-agent', 'Info Retrieved', 'success', 40.00, '#22c55e', 2),
  ('knowledge-rag-agent', 'Partial Answer', 'partial', 20.00, '#f59e0b', 3),
  ('knowledge-rag-agent', 'Failed', 'failure', -10.00, '#ef4444', 4)
WHERE NOT EXISTS (SELECT 1 FROM OUTCOME_CATEGORIES WHERE agent_slug = 'knowledge-rag-agent');

-- Local QA Agent
INSERT INTO OUTCOME_CATEGORIES (agent_slug, category_name, category_type, dollar_value, color, sort_order)
SELECT * FROM VALUES
  ('local-qa-agent', 'Question Answered', 'success', 25.00, '#16a34a', 1),
  ('local-qa-agent', 'Partial Answer', 'partial', 10.00, '#f59e0b', 2),
  ('local-qa-agent', 'Failed', 'failure', -5.00, '#ef4444', 3)
WHERE NOT EXISTS (SELECT 1 FROM OUTCOME_CATEGORIES WHERE agent_slug = 'local-qa-agent');

-- Trace Analyst Agent
INSERT INTO OUTCOME_CATEGORIES (agent_slug, category_name, category_type, dollar_value, color, sort_order)
SELECT * FROM VALUES
  ('trace-analyst-agent', 'Insight Provided', 'success', 60.00, '#16a34a', 1),
  ('trace-analyst-agent', 'Query Answered', 'success', 40.00, '#22c55e', 2),
  ('trace-analyst-agent', 'Failed', 'failure', -10.00, '#ef4444', 3)
WHERE NOT EXISTS (SELECT 1 FROM OUTCOME_CATEGORIES WHERE agent_slug = 'trace-analyst-agent');

-- ============================================================
-- V_TRACE_SUMMARIES: View that builds trace summaries for AI_CLASSIFY
-- Pulls from all agent types and joins with feedback
-- ============================================================
CREATE OR REPLACE VIEW V_TRACE_SUMMARIES AS
WITH cortex_traces AS (
  SELECT
    TRACE:trace_id::VARCHAR AS trace_id,
    'roi-demo-agent' AS agent_slug,
    MAX(CASE WHEN RECORD:"name"::VARCHAR = 'Agent' THEN DATEDIFF('ms', START_TIMESTAMP, TIMESTAMP) END) AS latency_ms,
    MAX(RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.query"::VARCHAR) AS user_query,
    MAX(CASE WHEN RECORD:"name"::VARCHAR LIKE 'ReasoningAgentStepResponseGeneration%'
         THEN LEFT(RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.response"::VARCHAR, 500) END) AS response_text,
    LISTAGG(DISTINCT
      CASE
        WHEN RECORD:"name"::VARCHAR LIKE 'SemanticContextTool%' THEN 'Analyst'
        WHEN RECORD:"name"::VARCHAR LIKE 'CortexSearchService%' THEN 'Search'
        WHEN RECORD:"name"::VARCHAR LIKE 'CortexChartToolImpl%' THEN 'Chart'
        WHEN RECORD:"name"::VARCHAR LIKE 'SqlExecution%' THEN 'SQL'
      END, ', ') AS tools_used,
    BOOLOR_AGG(CASE WHEN RECORD:severity_text::VARCHAR IN ('ERROR','FATAL') THEN TRUE ELSE FALSE END) AS has_error,
    COUNT(CASE WHEN RECORD:"name"::VARCHAR LIKE 'ReasoningAgentStepPlanning%'
               AND TRY_TO_NUMBER(REGEXP_SUBSTR(RECORD:"name"::VARCHAR, '\\d+$')) > 0 THEN 1 END) AS replan_count,
    COUNT(DISTINCT RECORD:"name"::VARCHAR) AS span_count,
    MIN(START_TIMESTAMP) AS trace_start
  FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'ROI_DEMO_AGENT', 'CORTEX AGENT'))
  WHERE RECORD_TYPE = 'SPAN'
  GROUP BY TRACE:trace_id::VARCHAR
),
rag_traces AS (
  SELECT
    TRACE:trace_id::VARCHAR AS trace_id,
    'knowledge-rag-agent' AS agent_slug,
    MAX(CASE WHEN RECORD_ATTRIBUTES:"ai.observability.span_type"::VARCHAR = 'record_root'
         THEN DATEDIFF('ms', START_TIMESTAMP, TIMESTAMP) END) AS latency_ms,
    MAX(RECORD_ATTRIBUTES:"ai.observability.call.kwargs.query"::VARCHAR) AS user_query,
    MAX(CASE WHEN RECORD_ATTRIBUTES:"ai.observability.span_type"::VARCHAR = 'record_root'
         THEN LEFT(RECORD_ATTRIBUTES:"ai.observability.record_root.output"::VARCHAR, 500) END) AS response_text,
    'Retrieval, Generation' AS tools_used,
    FALSE AS has_error,
    0 AS replan_count,
    COUNT(*) AS span_count,
    MIN(START_TIMESTAMP) AS trace_start
  FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'KNOWLEDGE_RAG_AGENT', 'EXTERNAL AGENT'))
  WHERE RECORD_TYPE = 'SPAN'
  GROUP BY TRACE:trace_id::VARCHAR
),
local_traces AS (
  SELECT
    TRACE:trace_id::VARCHAR AS trace_id,
    'local-qa-agent' AS agent_slug,
    MAX(CASE WHEN RECORD_ATTRIBUTES:"ai.observability.span_type"::VARCHAR = 'record_root'
         THEN DATEDIFF('ms', START_TIMESTAMP, TIMESTAMP) END) AS latency_ms,
    MAX(RECORD_ATTRIBUTES:"ai.observability.call.kwargs.query"::VARCHAR) AS user_query,
    MAX(CASE WHEN RECORD_ATTRIBUTES:"ai.observability.span_type"::VARCHAR = 'record_root'
         THEN LEFT(RECORD_ATTRIBUTES:"ai.observability.record_root.output"::VARCHAR, 500) END) AS response_text,
    'Think, Draft, Refine' AS tools_used,
    FALSE AS has_error,
    0 AS replan_count,
    COUNT(*) AS span_count,
    MIN(START_TIMESTAMP) AS trace_start
  FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'LOCAL_QA_AGENT', 'EXTERNAL AGENT'))
  WHERE RECORD_TYPE = 'SPAN'
  GROUP BY TRACE:trace_id::VARCHAR
),
all_traces AS (
  SELECT * FROM cortex_traces
  UNION ALL
  SELECT * FROM rag_traces
  UNION ALL
  SELECT * FROM local_traces
),
-- Join with feedback (both native and AGENT_FEEDBACK table)
native_feedback AS (
  SELECT
    RECORD_ATTRIBUTES:"ai.observability.record_id"::VARCHAR AS record_id,
    CASE WHEN RECORD:"name"::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
         AND VALUE:"positive"::BOOLEAN = TRUE THEN 'thumbs_up'
         WHEN RECORD:"name"::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
         AND VALUE:"positive"::BOOLEAN = FALSE THEN 'thumbs_down'
    END AS feedback_signal
  FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'ROI_DEMO_AGENT', 'CORTEX AGENT'))
  WHERE RECORD_TYPE = 'EVENT' AND RECORD:"name"::VARCHAR = 'CORTEX_AGENT_FEEDBACK'
),
ext_feedback AS (
  SELECT
    record_id,
    CASE WHEN positive = TRUE THEN 'thumbs_up' ELSE 'thumbs_down' END AS feedback_signal
  FROM AGENT_ROI_DEMO.APP.AGENT_FEEDBACK
)
SELECT
  t.trace_id,
  t.agent_slug,
  t.user_query,
  t.response_text,
  t.tools_used,
  t.has_error,
  t.replan_count,
  t.span_count,
  t.latency_ms,
  t.trace_start,
  COALESCE(nf.feedback_signal, ef.feedback_signal, 'none') AS feedback_signal,
  CONCAT(
    'User query: ', COALESCE(t.user_query, 'unknown'), '. ',
    'Agent response: ', COALESCE(t.response_text, 'none'), '. ',
    'Tools used: ', COALESCE(t.tools_used, 'none'), '. ',
    'Errors: ', IFF(t.has_error, 'yes', 'none'), '. ',
    'Re-plans: ', t.replan_count, '. ',
    'Feedback: ', COALESCE(nf.feedback_signal, ef.feedback_signal, 'none')
  ) AS trace_summary
FROM all_traces t
LEFT JOIN native_feedback nf ON t.trace_id = nf.record_id
LEFT JOIN ext_feedback ef ON t.trace_id = ef.record_id;
