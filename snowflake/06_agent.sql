-- Agent ROI Demo: Cortex Agent
-- Wires SALES_ANALYST (Cortex Analyst) and KNOWLEDGE_SEARCH (Cortex Search) tools

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE OR REPLACE AGENT AGENT_ROI_DEMO.APP.ROI_DEMO_AGENT
  COMMENT = 'Agent for ROI measurement demo - uses Cortex Analyst for sales data and Cortex Search for policies'
  PROFILE = '{"display_name": "ROI Demo Agent"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    budget:
      seconds: 30
      tokens: 16000

  instructions:
    response: "Answer concisely. Show data when available. Cite whether you used the sales data tool or the knowledge search tool."
    orchestration: "Use SALES_ANALYST for questions about orders, revenue, customers, market segments, pricing, account balances, or any quantitative sales data. Use KNOWLEDGE_SEARCH for questions about company policies, shipping procedures, refund rules, priority escalation, compliance, or operational procedures."
    sample_questions:
      - question: "What is the total revenue by region?"
      - question: "What is our refund policy?"
      - question: "Which market segments generate the most revenue?"
      - question: "How does priority escalation work?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "SALES_ANALYST"
        description: "Query TPC-H derived sales data including orders, customers, revenue metrics, market segments, and account balances. Use for any quantitative or analytical question about sales performance."
    - tool_spec:
        type: "cortex_search"
        name: "KNOWLEDGE_SEARCH"
        description: "Search company operational policies and FAQ documents covering shipping, refunds, priority escalation, compliance, market segment definitions, and regional operations guides."

  tool_resources:
    SALES_ANALYST:
      semantic_view: "AGENT_ROI_DEMO.APP.SALES_SEMANTIC_VIEW"
      execution_environment:
        type: "warehouse"
        warehouse: "AGENT_ROI_WH"
    KNOWLEDGE_SEARCH:
      name: "AGENT_ROI_DEMO.APP.KNOWLEDGE_SEARCH"
      max_results: 5
  $$;
