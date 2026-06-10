-- 11_agent_registry.sql
-- Agent Registry table for multi-agent support
-- Stores configuration for both Cortex Agents and External Agents

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE TABLE IF NOT EXISTS AGENT_REGISTRY (
  id              VARCHAR DEFAULT UUID_STRING() NOT NULL,
  name            VARCHAR NOT NULL,           -- Display name
  slug            VARCHAR NOT NULL,           -- URL-safe identifier (unique)
  agent_type      VARCHAR NOT NULL,           -- 'cortex_agent' | 'external_agent'
  mode            VARCHAR NOT NULL,           -- 'live_chat' | 'observability_only'

  -- Cortex Agent fields
  sf_database     VARCHAR,                    -- e.g., 'AGENT_ROI_DEMO'
  sf_schema       VARCHAR,                    -- e.g., 'APP'
  sf_agent_name   VARCHAR,                    -- e.g., 'ROI_DEMO_AGENT'

  -- External Agent fields
  endpoint_url    VARCHAR,                    -- e.g., 'https://my-agent.example.com/chat'
  endpoint_method VARCHAR DEFAULT 'POST',     -- HTTP method
  auth_type       VARCHAR,                    -- 'bearer' | 'api_key' | 'none'
  auth_secret_key VARCHAR,                    -- Reference to secret (not the value)

  -- External Agent observability fields
  obs_database    VARCHAR,                    -- DB where External Agent object lives
  obs_schema      VARCHAR,                    -- Schema
  obs_agent_name  VARCHAR,                    -- External Agent object name

  -- Shared fields
  description     VARCHAR,                    -- What this agent does
  routing_description VARCHAR,                -- For future router: tool description
  is_default      BOOLEAN DEFAULT FALSE,      -- Pre-selected in dropdown
  is_active       BOOLEAN DEFAULT TRUE,       -- Can be disabled without deletion
  created_at      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),

  CONSTRAINT pk_agent_registry PRIMARY KEY (id),
  CONSTRAINT uq_agent_slug UNIQUE (slug)
);

-- Seed with existing agents
INSERT INTO AGENT_REGISTRY (name, slug, agent_type, mode, sf_database, sf_schema, sf_agent_name, description, routing_description, is_default)
VALUES
  (
    'Sales & Policy Agent',
    'roi-demo-agent',
    'cortex_agent',
    'live_chat',
    'AGENT_ROI_DEMO',
    'APP',
    'ROI_DEMO_AGENT',
    'Answers questions about sales data (TPC-H) and company policies using Cortex Analyst and Cortex Search.',
    'Use for questions about orders, customers, revenue, market segments, and company policies like refunds, shipping, and support.',
    TRUE
  ),
  (
    'Trace Analyst',
    'trace-analyst',
    'cortex_agent',
    'live_chat',
    'AGENT_ROI_DEMO',
    'APP',
    'TRACE_ANALYST_AGENT',
    'Answers questions about agent telemetry, traces, spans, and performance metrics.',
    'Use for questions about agent performance, latency, errors, tool usage patterns, and observability data.',
    FALSE
  );

SELECT * FROM AGENT_REGISTRY;
