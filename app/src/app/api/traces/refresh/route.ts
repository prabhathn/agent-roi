// POST /api/traces/refresh - Refresh the materialized trace events table
// Pulls latest data from GET_AI_OBSERVABILITY_EVENTS for all agents

import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

async function execSQL(sql: string) {
  const baseUrl = getSnowflakeBaseUrl();
  const headers = getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/v2/statements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      statement: sql,
      database: 'AGENT_ROI_DEMO',
      schema: 'APP',
      warehouse: process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH',
      timeout: 120,
    }),
  });
  let result = await response.json();
  // Poll for completion
  while (result.code === '090001') {
    await new Promise(r => setTimeout(r, 2000));
    const handle = result.statementHandle;
    if (!handle) break;
    const pollResp = await fetch(`${baseUrl}/api/v2/statements/${handle}`, { headers });
    result = await pollResp.json();
  }
  return result;
}

export async function POST() {
  try {
    const sql = `
      CREATE OR REPLACE TABLE AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED AS
      SELECT 
        'roi-demo-agent' AS agent_slug,
        'CORTEX AGENT' AS agent_type,
        TIMESTAMP, START_TIMESTAMP, TRACE, RESOURCE_ATTRIBUTES, RECORD_TYPE, RECORD, RECORD_ATTRIBUTES, VALUE
      FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'ROI_DEMO_AGENT', 'CORTEX AGENT'))
      UNION ALL
      SELECT 
        'knowledge-rag-agent', 'EXTERNAL AGENT',
        TIMESTAMP, START_TIMESTAMP, TRACE, RESOURCE_ATTRIBUTES, RECORD_TYPE, RECORD, RECORD_ATTRIBUTES, VALUE
      FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'KNOWLEDGE_RAG_AGENT', 'EXTERNAL AGENT'))
      UNION ALL
      SELECT 
        'local-qa-agent', 'EXTERNAL AGENT',
        TIMESTAMP, START_TIMESTAMP, TRACE, RESOURCE_ATTRIBUTES, RECORD_TYPE, RECORD, RECORD_ATTRIBUTES, VALUE
      FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS('AGENT_ROI_DEMO', 'APP', 'LOCAL_QA_AGENT', 'EXTERNAL AGENT'))
    `;

    const result = await execSQL(sql);
    if (result.message && result.message.includes('error')) {
      return Response.json({ error: result.message }, { status: 500 });
    }

    // Get count
    const countResult = await execSQL('SELECT COUNT(*) FROM AGENT_ROI_DEMO.APP.TRACE_EVENTS_MATERIALIZED');
    const count = countResult.data?.[0]?.[0] || '0';

    return Response.json({ status: 'refreshed', total_events: parseInt(count) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
