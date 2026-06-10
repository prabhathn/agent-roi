# Agent ROI Demo

A multi-agent observability platform that measures ROI across different AI agent architectures on Snowflake. Demonstrates how to instrument, monitor, and compare the cost-effectiveness of:

- **Cortex Agents** — Native Snowflake agents with built-in observability
- **Cortex REST API Agents** — Python/FastAPI agents using TruLens for telemetry export to Snowflake
- **External Agents** — Fully external agents (LangGraph + local LLM) with TruLens telemetry normalization

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js Web App (:3000)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │   Chat   │  │  Traces  │  │Dashboard │  │   Config (CRUD)      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────────────┘   │
│       │              │              │                                    │
│       ▼              ▼              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │            Dynamic Agent Router (/api/agent/[slug]/run)          │   │
│  └──────┬──────────────────┬────────────────────────┬──────────────┘   │
└─────────┼──────────────────┼────────────────────────┼──────────────────┘
          │                  │                        │
          ▼                  ▼                        ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│Cortex Agent  │  │ Knowledge RAG    │  │ Local Q&A Agent (:8001)  │
│(Snowflake    │  │ Agent (:8000)    │  │ LangGraph + Qwen 2.5    │
│ native)      │  │ FastAPI+TruLens  │  │ llama-server + TruLens   │
└──────┬───────┘  └────────┬─────────┘  └────────────┬─────────────┘
       │                   │                          │
       ▼                   ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Snowflake AI Observability                         │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Native Telemetry│  │ EXTERNAL AGENT  │  │ SPAN_ATTRIBUTE_MAP  │  │
│  │ (auto-captured)│  │ (OTEL export)   │  │ (normalization)     │  │
│  └────────────────┘  └─────────────────┘  └─────────────────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐ │
│  │AGENT_REGISTRY│  │AGENT_FEEDBACK  │  │ ROI Views (costs, spans) │ │
│  └─────────────┘  └────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| Node.js | 18+ | Web application |
| Python | 3.11+ | External agents |
| Snowflake Account | — | Everything |
| Snowflake CLI (`snow`) | 1.0+ | SQL setup (or use Snowsight) |
| llama.cpp (`llama-server`) | — | Local LLM agent (optional) |

You also need a **Programmatic Access Token (PAT)** for Snowflake authentication. Generate one via Snowsight: User Menu → Programmatic Access Tokens.

## Quick Start

### Option A: Automated Setup

```bash
git clone https://github.com/prabhathn/agent-roi.git
cd agent-roi
./setup.sh
```

The script will guide you through configuration, install dependencies, and optionally provision Snowflake objects.

### Option B: Manual Setup

#### 1. Clone and configure

```bash
git clone https://github.com/prabhathn/agent-roi.git
cd agent-roi
cp .env.example .env
cp app/.env.local.example app/.env.local
# Edit both files with your Snowflake account details
```

#### 2. Run Snowflake SQL scripts

Execute scripts 01 through 13 in `snowflake/` in order. Use Snowsight or the Snowflake CLI:

```bash
for f in snowflake/[0-9]*.sql; do snow sql -f "$f"; done
```

#### 3. Install Node.js dependencies

```bash
cd app
npm install
cd ..
```

#### 4. Set up Python environments

```bash
# Knowledge RAG Agent
python3 -m venv external-agent/.venv
source external-agent/.venv/bin/activate
pip install -r external-agent/requirements.txt
deactivate

# Local LLM Agent
python3 -m venv external-agent/local/.venv
source external-agent/local/.venv/bin/activate
pip install -r external-agent/local/requirements.txt
deactivate
```

#### 5. Start the application

Open 4 terminals:

```bash
# Terminal 1: Web app
cd app && npm run dev

# Terminal 2: Knowledge RAG Agent
source external-agent/.venv/bin/activate && cd external-agent && python server.py

# Terminal 3: Local LLM Agent
source external-agent/local/.venv/bin/activate && cd external-agent/local && python server.py

# Terminal 4: Local LLM server (llama.cpp)
llama-server -m /path/to/qwen2.5-0.5b-instruct-q4_k_m.gguf -c 2048 --port 8080
```

Open http://localhost:3000.

## Project Structure

```
agent-roi/
├── app/                          # Next.js 15 web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── chat/            # Multi-agent chat interface
│   │   │   ├── traces/          # Unified trace viewer (all agents)
│   │   │   ├── dashboard/       # ROI metrics and cost analysis
│   │   │   ├── config/          # Agent registry CRUD
│   │   │   └── api/             # Backend routes
│   │   │       ├── agent/[slug]/ # Dynamic routing per agent
│   │   │       ├── agents/      # Registry CRUD API
│   │   │       ├── sql/         # Generic Snowflake SQL proxy
│   │   │       └── telemetry-map/ # SPAN_ATTRIBUTE_MAP API
│   │   ├── lib/                 # Shared utilities
│   │   ├── components/          # UI components (feedback forms, etc.)
│   │   └── types/               # TypeScript type definitions
│   └── config/agents.json       # Local agent registry fallback
│
├── external-agent/               # Cortex REST API Agent (FastAPI)
│   ├── config.py                # Snowflake + TruLens configuration
│   ├── agent.py                 # RAG agent with Cortex COMPLETE + Search
│   ├── server.py                # SSE streaming server (port 8000)
│   └── requirements.txt
│
├── external-agent/local/         # External LLM Agent (LangGraph)
│   ├── config.py                # Snowflake + TruLens configuration
│   ├── agent.py                 # Multi-step agent (think→draft→refine)
│   ├── server.py                # SSE streaming server (port 8001)
│   └── requirements.txt
│
├── snowflake/                    # SQL setup scripts (run in order)
│   ├── 01_setup.sql             # Database, schema, warehouse
│   ├── 02_sample_data.sql       # TPC-H sample data
│   ├── 03_knowledge_docs.sql    # Knowledge base documents
│   ├── 04_semantic_view.sql     # Sales semantic view
│   ├── 05_search_service.sql    # Cortex Search service
│   ├── 06_agent.sql             # Cortex Agent (native)
│   ├── 07_roi_views.sql         # ROI analytics views
│   ├── 08_trace_tables.sql      # Materialized trace tables
│   ├── 09_trace_semantic_view.sql # Trace observability semantic view
│   ├── 10_trace_agent.sql       # Trace Analyst agent
│   ├── 11_agent_registry.sql    # Multi-agent registry table
│   ├── 12_external_agent.sql    # EXTERNAL AGENT for Knowledge RAG
│   └── 13_local_agent.sql       # EXTERNAL AGENT for Local LLM + attribute map
│
├── scripts/
│   └── generate_conversations.py # Load testing (100 conversations)
│
├── docs/
│   ├── project-overview.html    # Detailed methodology & architecture
│   └── roi-methodology.md       # ROI calculation approach
│
├── .env.example                  # Environment variable template
├── .gitignore
├── setup.sh                      # Interactive setup script
└── README.md                     # This file
```

## SQL Scripts Reference

| # | Script | Creates |
|---|--------|---------|
| 01 | setup.sql | Database `AGENT_ROI_DEMO`, schema `APP`, warehouse `AGENT_ROI_WH` |
| 02 | sample_data.sql | ORDERS, CUSTOMERS, NATIONS, REGIONS (from TPC-H) |
| 03 | knowledge_docs.sql | KNOWLEDGE_DOCS (20 policy/FAQ documents) |
| 04 | semantic_view.sql | SALES_SEMANTIC_VIEW (Cortex Analyst) |
| 05 | search_service.sql | KNOWLEDGE_SEARCH (Cortex Search) |
| 06 | agent.sql | ROI_DEMO_AGENT (native Cortex Agent) |
| 07 | roi_views.sql | V_AGENT_SPANS, V_AGENT_FEEDBACK, V_AGENT_COSTS, V_ROI_SUMMARY |
| 08 | trace_tables.sql | TRACE_SPANS_DT, TRACE_FEEDBACK_DT + refresh task |
| 09 | trace_semantic_view.sql | TRACE_OBSERVABILITY_VIEW |
| 10 | trace_agent.sql | TRACE_ANALYST_AGENT |
| 11 | agent_registry.sql | AGENT_REGISTRY table with 4 seed agents |
| 12 | external_agent.sql | EXTERNAL AGENT `KNOWLEDGE_RAG_AGENT` + version V1 |
| 13 | local_agent.sql | EXTERNAL AGENT `LOCAL_QA_AGENT` + SPAN_ATTRIBUTE_MAP |

## Configuration Reference

### Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `SNOWFLAKE_ACCOUNT` | Python agents | Account locator (e.g., `org-account`) |
| `SNOWFLAKE_USER` | Python agents | Snowflake username |
| `SNOWFLAKE_ROLE` | Python agents | Role (default: ACCOUNTADMIN) |
| `SNOWFLAKE_WAREHOUSE` | Python agents | Warehouse name |
| `SNOWFLAKE_DATABASE` | Python agents | Database name |
| `SNOWFLAKE_SCHEMA` | Python agents | Schema name |
| `SNOWFLAKE_TOKEN_FILE` | All | Path to PAT token file |
| `SNOWFLAKE_PAT` | Next.js app | PAT token string (overrides file) |
| `NEXT_PUBLIC_SNOWFLAKE_ACCOUNT` | Next.js | Account for API calls |
| `NEXT_PUBLIC_AGENT_DATABASE` | Next.js | Agent database |
| `NEXT_PUBLIC_AGENT_SCHEMA` | Next.js | Agent schema |
| `NEXT_PUBLIC_AGENT_NAME` | Next.js | Default agent name |
| `NEXT_PUBLIC_AGENT_WAREHOUSE` | Next.js | Query warehouse |
| `LLAMA_SERVER_URL` | Local agent | llama-server endpoint |
| `LLAMA_MODEL` | Local agent | GGUF model filename |

### Required Snowflake Privileges

```sql
-- Run as ACCOUNTADMIN or grant to your role:
GRANT READ UNREDACTED AI OBSERVABILITY EVENTS TABLE ON ACCOUNT TO ROLE your_role;
```

## Key Concepts

### Agent Types

| Type | Telemetry | Feedback | Example |
|------|-----------|----------|---------|
| `cortex_agent` | Automatic (native) | `:feedback` REST endpoint | ROI_DEMO_AGENT |
| `cortex_rest_api` | TruLens → EXTERNAL AGENT export | AGENT_FEEDBACK table | KNOWLEDGE_RAG_AGENT |
| `external_agent` | TruLens → EXTERNAL AGENT export | AGENT_FEEDBACK table | LOCAL_QA_AGENT |

### Telemetry Normalization

External agents emit framework-specific span attributes. The `SPAN_ATTRIBUTE_MAP` table normalizes these to a standard set (RETRIEVAL, GENERATION, PLANNING, etc.) so the trace viewer can display consistent waterfall charts across all agent types.

### ROI Measurement

The platform calculates ROI by correlating:
- **Cost** — Cortex credit consumption per request
- **Quality** — User feedback (thumbs up/down with reasoning)
- **Performance** — Latency, token usage, span durations

See `docs/project-overview.html` for the full methodology.

## Documentation

Open `docs/project-overview.html` in a browser for comprehensive documentation including:
- ROI calculation methodology
- Feedback model design
- Architecture deep-dive
- Key learnings and gotchas
- Step-by-step build process

## License

MIT
