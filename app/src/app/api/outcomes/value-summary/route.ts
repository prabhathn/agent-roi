// GET /api/outcomes/value-summary - Daily value totals for dashboard
import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const SAFE_SLUG = /^[a-z0-9_-]+$/;

async function runSQL(sql: string) {
  const baseUrl = getSnowflakeBaseUrl();
  const headers = getAuthHeaders();
  const response = await fetch(`${baseUrl}/api/v2/statements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ statement: sql, database: 'AGENT_ROI_DEMO', schema: 'APP', warehouse: process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH' }),
  });
  return response.json();
}

export async function GET(request: NextRequest) {
  const agentSlug = request.nextUrl.searchParams.get('agent_slug');
  const days = request.nextUrl.searchParams.get('days') || '30';
  if (agentSlug && !SAFE_SLUG.test(agentSlug)) return Response.json({ error: 'Invalid slug' }, { status: 400 });
  const filterClause = agentSlug ? `AND o.agent_slug = '${agentSlug}'` : '';
  const filterClauseV = agentSlug ? `AND agent_slug = '${agentSlug}'` : '';

  // Daily value totals
  const dailySQL = `
    SELECT
      DATE_TRUNC('day', o.classified_at) AS day_bucket,
      COUNT(*) AS classified_count,
      SUM(o.computed_value) AS total_value
    FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES o
    WHERE o.classified_at >= DATEADD('day', -${parseInt(days)}, CURRENT_TIMESTAMP())
      ${filterClause}
    GROUP BY day_bucket
    ORDER BY day_bucket DESC
  `;

  // Total traces (classified + pending)
  const totalSQL = `
    SELECT
      (SELECT COUNT(*) FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES WHERE classified_at >= DATEADD('day', -${parseInt(days)}, CURRENT_TIMESTAMP()) ${filterClause.replace('o.', '')}) AS classified_count,
      (SELECT COUNT(*) FROM AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES WHERE user_query IS NOT NULL ${filterClauseV}) AS total_traces,
      (SELECT COALESCE(SUM(computed_value), 0) FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES WHERE classified_at >= DATEADD('day', -${parseInt(days)}, CURRENT_TIMESTAMP()) ${filterClause.replace('o.', '')}) AS total_value
  `;

  const [dailyResult, totalResult] = await Promise.all([runSQL(dailySQL), runSQL(totalSQL)]);

  const daily = (dailyResult.data || []).map((r: string[]) => ({
    day_bucket: r[0],
    classified_count: parseInt(r[1]),
    total_value: parseFloat(r[2]) || 0,
  }));

  const t = totalResult.data?.[0] || ['0', '0', '0'];

  return Response.json({
    daily,
    classified_count: parseInt(t[0]),
    total_traces: parseInt(t[1]),
    total_value: parseFloat(t[2]) || 0,
  });
}
