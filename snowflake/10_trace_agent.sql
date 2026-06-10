-- Agent ROI Demo: Trace Analyst Agent
-- Answers questions about agent performance, traces, and feedback

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE OR REPLACE AGENT AGENT_ROI_DEMO.APP.TRACE_ANALYST_AGENT
  COMMENT = 'Analyzes agent observability data, traces, and feedback to suggest improvements'
  PROFILE = '{"display_name": "Trace Analyst"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    budget:
      seconds: 30
      tokens: 16000

  instructions:
    response: |
      You are an agent performance analyst. Analyze trace data and feedback to provide actionable insights.
      When discussing specific traces, reference the trace_id.
      When summarizing feedback, group by category and suggest concrete changes to the primary agent's instructions or tool configuration.
      Be specific and data-driven in your recommendations.
      Format numbers clearly: latency in seconds, percentages with one decimal.
    orchestration: |
      Use TRACE_ANALYST for all questions about spans, latency, errors, replans, feedback, task completions, and agent performance metrics.
    sample_questions:
      - question: "What is the average latency by tool?"
      - question: "How many errors occurred in the last 7 days?"
      - question: "Summarize the negative feedback and suggest changes"
      - question: "What percentage of requests have replans?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "TRACE_ANALYST"
        description: "Query agent observability data including execution spans (planning, tool calls, SQL execution, response generation), latency metrics, error rates, replan events, user feedback ratings, task completions, and performance trends over time."

  tool_resources:
    TRACE_ANALYST:
      semantic_view: "AGENT_ROI_DEMO.APP.TRACE_OBSERVABILITY_VIEW"
      execution_environment:
        type: "warehouse"
        warehouse: "AGENT_ROI_WH"
  $$;
