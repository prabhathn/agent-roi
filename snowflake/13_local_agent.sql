-- 13_local_agent.sql
-- External Agent for local LLM + Telemetry Attribute Mapping Table

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

-- External Agent object for the local LangGraph Q&A agent
CREATE EXTERNAL AGENT IF NOT EXISTS LOCAL_QA_AGENT;
ALTER EXTERNAL AGENT LOCAL_QA_AGENT ADD VERSION V1;

-- Telemetry Attribute Mapping Table
-- Maps diverse span attribute formats to a standard schema for the traces UI
CREATE TABLE IF NOT EXISTS SPAN_ATTRIBUTE_MAP (
  id INTEGER AUTOINCREMENT,
  standard_attr VARCHAR NOT NULL,    -- normalized name (model, query, sql_query, etc.)
  agent_type VARCHAR NOT NULL,       -- cortex_agent | cortex_rest_api | external_agent
  source_attr_path VARCHAR NOT NULL, -- the actual RECORD_ATTRIBUTES key path
  priority INTEGER DEFAULT 1,        -- lower = tried first in COALESCE
  description VARCHAR
);

-- Seed with known mappings for all agent types
INSERT INTO SPAN_ATTRIBUTE_MAP (standard_attr, agent_type, source_attr_path, priority, description) VALUES
-- Model
('model', 'cortex_agent', 'snow.ai.observability.agent.planning.model', 1, 'Cortex Agent planning model'),
('model', 'cortex_rest_api', 'model', 1, 'Custom attribute from @instrument'),
('model', 'external_agent', 'gen_ai.request.model', 1, 'OpenTelemetry GenAI semantic convention'),
('model', 'external_agent', 'trulens.llm.model_name', 2, 'TruLens LLM model name'),
-- User query
('query', 'cortex_agent', 'snow.ai.observability.agent.planning.query', 1, 'Cortex planning query'),
('query', 'cortex_rest_api', 'query', 1, 'Custom attribute'),
('query', 'external_agent', 'trulens.input', 1, 'TruLens chain input'),
-- SQL query
('sql_query', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.query', 1, NULL),
('sql_query', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.final_sql', 2, NULL),
('sql_query', 'cortex_rest_api', 'sql_query', 1, NULL),
-- Status
('status', 'cortex_agent', 'snow.ai.observability.agent.planning.status', 1, NULL),
('status', 'cortex_agent', 'snow.ai.observability.agent.tool.cortex_search.status', 2, NULL),
('status', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.status', 3, NULL),
('status', 'cortex_rest_api', 'status', 1, NULL),
('status', 'external_agent', 'trulens.status', 1, NULL),
-- Token counts
('tokens_input', 'cortex_agent', 'snow.ai.observability.agent.planning.token_count.input', 1, NULL),
('tokens_input', 'external_agent', 'gen_ai.usage.input_tokens', 1, NULL),
('tokens_output', 'cortex_agent', 'snow.ai.observability.agent.planning.token_count.output', 1, NULL),
('tokens_output', 'external_agent', 'gen_ai.usage.output_tokens', 1, NULL),
-- Thinking/reasoning
('thinking', 'cortex_agent', 'snow.ai.observability.agent.planning.thinking_response', 1, NULL),
('thinking', 'external_agent', 'trulens.thinking', 1, NULL),
-- Response
('response_preview', 'cortex_agent', 'snow.ai.observability.agent.planning.response', 1, NULL),
('response_preview', 'external_agent', 'trulens.output', 1, NULL),
('response_preview', 'cortex_rest_api', 'response_preview', 1, NULL),
-- Search
('search_query', 'cortex_agent', 'snow.ai.observability.agent.tool.cortex_search.query', 1, NULL),
('search_query', 'cortex_rest_api', 'query', 2, NULL),
-- Num rows
('num_rows', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.result.num_rows', 1, NULL),
('num_rows', 'cortex_rest_api', 'num_docs_retrieved', 1, NULL),
-- Query ID
('query_id', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.query_id', 1, NULL),
-- Semantic model
('semantic_model', 'cortex_agent', 'snow.ai.observability.agent.tool.cortex_analyst.semantic_model', 1, NULL),
('semantic_model', 'cortex_rest_api', 'table', 1, NULL),
-- Verified query
('verified_query_used', 'cortex_agent', 'snow.ai.observability.agent.tool.sql_execution.verified_query_used', 1, NULL);

-- Verify
SELECT * FROM SPAN_ATTRIBUTE_MAP ORDER BY standard_attr, agent_type, priority;
