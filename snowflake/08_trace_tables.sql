-- Agent ROI Demo: Materialized Trace Tables
-- Dynamic tables not supported with GET_AI_OBSERVABILITY_EVENTS table function,
-- so using a scheduled task to refresh every 5 minutes.

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;
USE WAREHOUSE AGENT_ROI_WH;

-- Initial table creation
CREATE OR REPLACE TABLE AGENT_ROI_DEMO.APP.TRACE_SPANS_DT AS
SELECT
  trace_id, span_id, span_name, RECORD_TYPE, span_kind, tool_name,
  span_duration_ms, is_replan, has_error, error_message,
  start_timestamp, end_timestamp
FROM AGENT_ROI_DEMO.APP.V_AGENT_SPANS;

CREATE OR REPLACE TABLE AGENT_ROI_DEMO.APP.TRACE_FEEDBACK_DT AS
SELECT
  trace_id, request_id, thread_id, positive, feedback_message,
  event_type, stars, task_value, time_saved, automated, submitted_at
FROM AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK;

-- Task to refresh every 5 minutes
CREATE OR REPLACE TASK AGENT_ROI_DEMO.APP.REFRESH_TRACE_DATA
  WAREHOUSE = AGENT_ROI_WH
  SCHEDULE = '5 MINUTE'
AS
BEGIN
  CREATE OR REPLACE TABLE AGENT_ROI_DEMO.APP.TRACE_SPANS_DT AS
    SELECT trace_id, span_id, span_name, RECORD_TYPE, span_kind, tool_name,
           span_duration_ms, is_replan, has_error, error_message,
           start_timestamp, end_timestamp
    FROM AGENT_ROI_DEMO.APP.V_AGENT_SPANS;
  CREATE OR REPLACE TABLE AGENT_ROI_DEMO.APP.TRACE_FEEDBACK_DT AS
    SELECT trace_id, request_id, thread_id, positive, feedback_message,
           event_type, stars, task_value, time_saved, automated, submitted_at
    FROM AGENT_ROI_DEMO.APP.V_AGENT_FEEDBACK;
END;

ALTER TASK AGENT_ROI_DEMO.APP.REFRESH_TRACE_DATA RESUME;
