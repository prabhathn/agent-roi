-- Agent ROI Demo: Cortex Search Service
-- Indexes the knowledge_docs table for policy/FAQ retrieval

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;
USE WAREHOUSE AGENT_ROI_WH;

CREATE OR REPLACE CORTEX SEARCH SERVICE AGENT_ROI_DEMO.APP.KNOWLEDGE_SEARCH
  ON content
  ATTRIBUTES title, category
  WAREHOUSE = AGENT_ROI_WH
  TARGET_LAG = '1 hour'
AS SELECT doc_id, title, category, content
   FROM AGENT_ROI_DEMO.APP.KNOWLEDGE_DOCS;
