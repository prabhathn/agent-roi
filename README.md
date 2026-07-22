# Agent ROI

A full-stack application for measuring the Return on Investment (ROI) of AI agents built on Snowflake. Monitor conversations, trace execution spans, classify outcomes, and calculate dollar-value impact across multiple agent types.

![Chat Interface](docs/screenshots/chat.png)

## What It Does

Agent ROI provides a unified interface to:

- **Chat** with multiple AI agents (Cortex Agents, external RAG agents, local LLM agents) from a single UI
- **Track costs** — credits consumed, latency, error rates per conversation
- **Trace execution** — view individual spans (planning, tool use, SQL execution, response generation) for every conversation
- **Classify outcomes** — use Snowflake's `AI_CLASSIFY` function to automatically categorize conversation results
- **Calculate ROI** — assign dollar values to outcome categories and compute per-agent return on investment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (port 3000)              │
│   Chat │ Dashboard │ Outcomes │ Traces │ Config             │
└────────┬──────────────────────────────────────┬─────────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────┐                   ┌──────────────────────┐
│  Snowflake APIs │                   │  External Agents     │
│  - Cortex Agent │                   │  - RAG Agent (:8000) │
│  - SQL API      │                   │  - Local LLM (:8080) │
│  - AI_CLASSIFY  │                   │  - TruLens telemetry │
└────────┬────────┘                   └──────────┬───────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Snowflake (AGENT_ROI_DEMO)                │
│  - Observability events (GET_AI_OBSERVABILITY_EVENTS)        │
│  - Materialized traces (TRACE_EVENTS_MATERIALIZED)          │
│  - Outcome classifications (AGENT_OUTCOMES)                  │
│  - Agent configs, categories, baselines                      │
└─────────────────────────────────────────────────────────────┘
```

## Pages

### Dashboard

Per-agent ROI metrics: conversations, credits/request, feedback rates, error rates, and daily breakdowns.

![Dashboard](docs/screenshots/dashboard.png)

### Outcomes

AI-powered outcome classification using `AI_CLASSIFY`. Each trace is categorized (Chart Generated, Policy Clarified, Question Answered, etc.) with configurable dollar values per category. Includes quality scoring and manual override support.

![Outcomes](docs/screenshots/outcomes.png)

### Traces

Full execution trace viewer. Click any conversation to see individual spans — planning steps, tool calls, SQL executions, and response generation — with timing, token counts, and detailed attributes.

![Traces](docs/screenshots/traces.png)

### Config

Register and manage agents. Supports Cortex Agents (native Snowflake), external agents (Cortex REST API with TruLens), and fully local agents (llama-server). Configure outcome categories per agent.

![Config](docs/screenshots/config.png)

## Supported Agent Types

| Type | Description | Telemetry Source |
|------|-------------|-----------------|
| **Cortex Agent** | Native Snowflake agent (Cortex Analyst + Search) | `GET_AI_OBSERVABILITY_EVENTS('CORTEX AGENT')` |
| **External (Cortex REST API)** | Python agent using Cortex COMPLETE API | `GET_AI_OBSERVABILITY_EVENTS('EXTERNAL AGENT')` via TruLens |
| **External (Local LLM)** | Fully local agent (LangGraph + llama-server) | `GET_AI_OBSERVABILITY_EVENTS('EXTERNAL AGENT')` via TruLens |

## Prerequisites

- Snowflake account with `ACCOUNTADMIN` role (or role with Cortex AI access)
- A Programmatic Access Token (PAT) for authentication
- Node.js 18+
- Python 3.11+ (for external agents)
- (Optional) llama-server with a GGUF model for the local agent

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/prabhathn/agent-roi.git
cd agent-roi
```

### 2. Set up Snowflake objects

Run the SQL scripts in order to create the database, tables, and agents:

```bash
# Run each script in Snowsight or via SnowSQL
snowsql -f snowflake/01_setup.sql
snowsql -f snowflake/02_cortex_search.sql
# ... continue through all numbered scripts
snowsql -f snowflake/14_outcomes.sql
```

These scripts create:
- `AGENT_ROI_DEMO` database with `APP` schema
- Cortex Search service on knowledge base documents
- Cortex Agent (`ROI_DEMO_AGENT`) with Analyst + Search tools
- Trace materialization tables and outcome classification tables

### 3. Configure the Next.js app

```bash
cd app
cp .env.example .env.local
```

Edit `.env.local` with your Snowflake credentials:

```env
SNOWFLAKE_ACCOUNT=your-account-identifier
SNOWFLAKE_USER=your-username
SNOWFLAKE_TOKEN_FILE=~/.snowflake/tokens/your_token_file
SNOWFLAKE_DATABASE=AGENT_ROI_DEMO
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_WAREHOUSE=AGENT_ROI_WH
SNOWFLAKE_ROLE=ACCOUNTADMIN
```

Install dependencies and start:

```bash
npm install
npm run dev
```

The app will be available at http://localhost:3000.

### 4. (Optional) Set up the external RAG agent

```bash
cd external-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set environment variables:

```bash
export SNOWFLAKE_ACCOUNT=your-account-identifier
export SNOWFLAKE_USER=your-username
export SNOWFLAKE_TOKEN_FILE=~/.snowflake/tokens/your_token_file
```

Start the agent:

```bash
python server.py
# Runs on http://localhost:8000
```

### 5. (Optional) Set up the local LLM agent

Download a GGUF model (e.g., Qwen 2.5 0.5B Instruct Q4):

```bash
# Install llama-server (via Homebrew on macOS)
brew install llama.cpp

# Download a small model
cd external-agent/local
# Place your .gguf model file here

# Start llama-server
llama-server -m your-model.gguf --port 8080 -c 2048
```

Then start the local agent:

```bash
cd external-agent/local
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
# Runs on http://localhost:8001
```

## Usage

1. **Register agents** in the Config page — point them at your Snowflake agent or external endpoints
2. **Chat** with agents using the Chat page — ask questions, generate charts
3. **View traces** to understand how the agent processed each request
4. **Classify outcomes** — click "Classify Unclassified" on the Outcomes page to run `AI_CLASSIFY`
5. **Monitor ROI** on the Dashboard — track cost efficiency and value delivered over time

## Key Technologies

- **Snowflake Cortex Agent** — native AI agent with Analyst (text-to-SQL) and Search tools
- **Snowflake AI_CLASSIFY** — zero-shot text classification for outcome categorization
- **TruLens** — open-source LLM observability (TruGraph for LangGraph agents)
- **LangGraph** — graph-based agent orchestration for the local agent
- **Next.js 16** — React framework with Turbopack
- **Vega-Lite** — declarative charting for agent-generated visualizations

## Project Structure

```
agent-roi/
├── app/                    # Next.js frontend application
│   ├── src/app/           # Pages (chat, dashboard, outcomes, traces, config)
│   ├── src/app/api/       # API routes (Snowflake SQL proxy, outcomes, traces)
│   └── src/lib/           # Snowflake auth helpers
├── external-agent/         # External RAG agent (TruLens + Cortex COMPLETE)
│   ├── server.py          # FastAPI server
│   ├── agent.py           # Knowledge RAG agent logic
│   └── local/             # Local LLM agent (LangGraph + llama-server)
├── snowflake/             # SQL DDL scripts (numbered, run in order)
├── scripts/               # Data loading and utility scripts
└── docs/                  # Documentation and screenshots
```

## License

MIT
