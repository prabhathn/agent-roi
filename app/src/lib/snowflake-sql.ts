// Snowflake SQL Statement API client
// Used to query the ROI telemetry views from the dashboard

import { getSnowflakeBaseUrl, getAuthHeaders } from './snowflake-auth';

const WAREHOUSE = process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH';
const DATABASE = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
const SCHEMA = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';

interface SQLResult<T> {
  data: T[];
  error?: string;
}

/**
 * Execute a SQL query via the Snowflake SQL Statement API and return typed results.
 */
export async function executeSQL<T = Record<string, unknown>>(
  sql: string
): Promise<SQLResult<T>> {
  const url = `${getSnowflakeBaseUrl()}/api/v2/statements`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        statement: sql,
        database: DATABASE,
        schema: SCHEMA,
        warehouse: WAREHOUSE,
        timeout: 60,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: [], error: `SQL execution failed: ${response.status} ${errorText}` };
    }

    const result = await response.json();

    // The Statement API returns data in a specific format
    // Parse the resultSetMetaData and data arrays into objects
    if (result.data && result.resultSetMetaData) {
      const columns = result.resultSetMetaData.rowType.map(
        (col: { name: string }) => col.name.toLowerCase()
      );
      const rows = result.data.map((row: string[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj as T;
      });
      return { data: rows };
    }

    return { data: [] };
  } catch (error) {
    return {
      data: [],
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Query the ROI summary view.
 */
export async function fetchROISummary() {
  return executeSQL(`SELECT * FROM AGENT_ROI_DEMO.APP.V_ROI_SUMMARY ORDER BY day_bucket DESC LIMIT 30`);
}

/**
 * Query agent spans for a specific trace.
 */
export async function fetchSpansForTrace(traceId: string) {
  return executeSQL(
    `SELECT * FROM AGENT_ROI_DEMO.APP.V_AGENT_SPANS WHERE trace_id = '${traceId}' ORDER BY start_timestamp`
  );
}

/**
 * Query recent traces for the trace explorer.
 */
export async function fetchRecentTraces() {
  return executeSQL(
    `SELECT trace_id, MIN(start_timestamp) AS started_at, MAX(end_timestamp) AS ended_at,
            MAX(span_duration_ms) AS total_duration_ms,
            ARRAY_AGG(DISTINCT span_kind) AS span_kinds,
            BOOLOR_AGG(has_error) AS has_any_error,
            BOOLOR_AGG(is_replan) AS has_replan
     FROM AGENT_ROI_DEMO.APP.V_AGENT_SPANS
     WHERE span_kind != 'REQUEST_EVENT'
     GROUP BY trace_id
     ORDER BY started_at DESC
     LIMIT 50`
  );
}

/**
 * Query task pairs for the dashboard.
 */
export async function fetchTaskPairs() {
  return executeSQL(`SELECT * FROM AGENT_ROI_DEMO.APP.V_TASK_PAIRS ORDER BY started_at DESC LIMIT 50`);
}
