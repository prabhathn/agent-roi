-- 12_external_agent.sql
-- Create an EXTERNAL AGENT object for the TruLens-instrumented Knowledge RAG Agent
-- This object is the metadata anchor for observability span export

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE EXTERNAL AGENT IF NOT EXISTS KNOWLEDGE_RAG_AGENT;

-- Verify
SHOW EXTERNAL AGENTS IN SCHEMA AGENT_ROI_DEMO.APP;

-- Query spans (after agent has been used):
-- SELECT * FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(
--   'AGENT_ROI_DEMO', 'APP', 'KNOWLEDGE_RAG_AGENT', 'EXTERNAL AGENT'
-- )) ORDER BY TIMESTAMP DESC LIMIT 20;
