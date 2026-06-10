# Agent ROI Methodology

## Overview

This document describes the Return on Investment (ROI) measurement framework for Cortex Agents. It combines three telemetry signals — operational cost, quality errors, and user feedback — into a single composite score that quantifies the value delivered per credit consumed.

## Data Sources

| Source | Latency | Contents |
|--------|---------|----------|
| `SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS` | Near real-time | Conversation spans, tool executions, errors, feedback |
| `SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AI_FUNCTIONS_USAGE_HISTORY` | Up to 60 minutes | Credit consumption per query/model |
| Feedback REST API (`POST agents/{name}:feedback`) | Immediate (write) | User-submitted quality signals and task outcomes |

## Feedback Model (Four Buttons)

### Per-Message Feedback

| Button | Signal Type | Expanded Form |
|--------|-------------|---------------|
| Thumbs Up | Quality (positive) | Star rating (1-5), optional comment |
| Thumbs Down | Quality (negative) | Category pills (multi-select), optional comment |

**Thumbs-down categories:** Wrong answer, Incomplete, Hallucination, Too slow, Wrong tool used, Confusing

### Per-Workflow Feedback

| Button | Signal Type | Expanded Form |
|--------|-------------|---------------|
| Task Start | Workflow begin marker | Optional task description |
| Task Complete | Workflow outcome | Star rating, value (Low/Medium/High/Critical), time saved, fully automated (yes/no), optional comment |

### Task State Machine

```
[Idle] → press Task Start → [Task Active]
[Task Active] → press Task Complete → [Idle] (submits task:complete)
[Task Active] → press Undo → [Idle] (submits task:cancelled)
[Task Active] → stale (>4 hours) → [Recovery Prompt]
[Recovery Prompt] → Complete it → shows Task Complete form
[Recovery Prompt] → Cancel it → [Idle] (submits task:cancelled)
```

### Task States in Telemetry

| Pattern | Meaning | ROI Treatment |
|---------|---------|---------------|
| `task:start` + `task:complete` (same thread) | Valid completed task | Included in ROI |
| `task:start` + `task:cancelled` (same thread) | Mistaken start / undo | Excluded entirely |
| `task:start` with no pair within 24h | Abandoned | Excluded from ROI; shown as "abandon rate" |

## API Encoding

All feedback is encoded into the Cortex Agent Feedback REST API's free-form `categories` array:

```json
// Thumbs up with stars
{ "positive": true, "categories": ["stars:4"], "feedback_message": "Great answer" }

// Thumbs down with categories
{ "positive": false, "categories": ["Wrong answer", "Incomplete"], "feedback_message": "..." }

// Task start
{ "positive": true, "categories": ["task:start"], "feedback_message": "Analyzing revenue" }

// Task complete
{ "positive": true, "categories": ["task:complete", "stars:5", "value:High", "time_saved:15-30 min", "automated:yes"] }

// Task cancelled (undo)
{ "positive": true, "categories": ["task:cancelled"] }
```

## ROI Formula

### Primary (Per-Message Quality)

```
ROI Score = (Positive Rate × (1 - Error Rate)) / Credits Per Request

Where:
  Positive Rate    = thumbs_up_count / (thumbs_up_count + thumbs_down_count)
  Error Rate       = (sql_failures + tool_errors + replan_events) / total_spans
  Credits/Request  = total_credits / distinct_request_count
```

**Interpretation:** A dimensionless ratio. Higher = more value per credit.
- `> 0.7` → Strong ROI (green)
- `0.4 - 0.7` → Moderate ROI (amber)
- `< 0.4` → Poor ROI (red)

### Extended (Task-Based Value)

```
Task ROI = (Completed Tasks × Avg Task Value × Automation Rate) / Total Credits

Where:
  Avg Task Value   = weighted average (Low=1, Medium=2, High=3, Critical=4)
  Automation Rate  = tasks where automated=yes / total completed tasks
```

## Error Taxonomy

Errors are detected from AI Observability span data:

| Error Type | Detection | Impact |
|------------|-----------|--------|
| SQL Execution Failure | Span `SqlExecution_*` with error severity | Agent generated invalid SQL |
| Tool Call Error | Any tool span with exception attributes | Tool returned an error |
| Re-plan Event | `ReasoningAgentStepPlanning-N` where N > 0 | Agent changed its mind and selected different tools |

Re-plans are not strictly errors — they represent the agent self-correcting. However, they indicate wasted compute and latency, so they're counted in the error rate as a quality signal.

## SQL Views

| View | Purpose |
|------|---------|
| `V_AGENT_SPANS` | All spans parsed with kind, tool name, duration, error flags |
| `V_AGENT_FEEDBACK` | All feedback events parsed with structured fields |
| `V_TASK_PAIRS` | Matched task start/complete pairs with duration and outcomes |
| `V_AGENT_COSTS` | Credit consumption from ACCOUNT_USAGE (30-day window) |
| `V_ROI_SUMMARY` | Daily aggregate with all metrics and composite ROI score |

## Caveats and Limitations

1. **Feedback is voluntary.** Not all users submit feedback. The positive rate is calculated only from users who opted to provide it, creating selection bias.

2. **Credit attribution.** `CORTEX_AI_FUNCTIONS_USAGE_HISTORY` has up to 60-minute latency and reports credits at the query level, not the agent request level. The current implementation uses total credits for the entire account in the time window, not just this agent. Refinement: filter by query tags or warehouse if multiple agents share the account.

3. **Re-plans as errors.** A single re-plan in a complex query may be expected behavior. The error rate metric counts all re-plans equally, which may overstate issues for multi-step queries.

4. **Redacted fields.** Without `READ UNREDACTED AI OBSERVABILITY EVENTS TABLE`, feedback text and tool inputs are redacted in the observability views. Metadata (tool names, durations, error flags) remains visible.

5. **Task value is subjective.** The Low/Medium/High/Critical scale relies on user self-assessment. Different users may calibrate differently.

## Extension Points

- **Dollar conversion:** Multiply credits by published credit pricing (~$3/credit for serverless AI) to express ROI in dollar terms.
- **Time-saved estimates:** The `time_saved` field from task:complete can be converted to dollar savings using an hourly rate assumption.
- **Benchmarking:** Compare ROI scores across different agents, tool configurations, or model versions to identify optimal setups.
- **Alerting:** Set up Snowflake alerts on `V_ROI_SUMMARY` to notify when ROI drops below threshold or error rate spikes.
