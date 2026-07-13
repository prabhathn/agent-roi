// GET /api/outcomes - List classified outcomes with category details
// PUT /api/outcomes - Manual override

import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const SAFE_SLUG = /^[a-z0-9_-]+$/;
const SAFE_ID = /^[a-f0-9-]+$/;
function sanitize(val: string): string { return val.replace(/'/g, "''"); }
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

  const sql = `
    SELECT 
      o.id, o.trace_id, o.agent_slug, o.category_id,
      c.category_name, c.category_type, c.dollar_value, c.color,
      o.classification_method, o.feedback_signal,
      o.ai_classify_probability, o.quality_score, o.computed_value,
      o.classified_at, o.overridden_at, o.override_reason,
      v.user_query, v.latency_ms, v.response_text, v.tools_used, v.replan_count
    FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES o
    JOIN AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES c ON o.category_id = c.id
    LEFT JOIN AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES v ON o.trace_id = v.trace_id
    WHERE o.classified_at >= DATEADD('day', -${parseInt(days)}, CURRENT_TIMESTAMP())
      ${filterClause}
    ORDER BY o.classified_at DESC
    LIMIT 200
  `;

  const result = await runSQL(sql);
  const rows = (result.data || []).map((r: string[]) => ({
    id: r[0], trace_id: r[1], agent_slug: r[2], category_id: r[3],
    category_name: r[4], category_type: r[5], category_dollar_value: parseFloat(r[6]),
    color: r[7], classification_method: r[8], feedback_signal: r[9],
    ai_classify_probability: parseFloat(r[10]) || null, quality_score: parseFloat(r[11]),
    computed_value: parseFloat(r[12]), classified_at: r[13], overridden_at: r[14],
    override_reason: r[15], user_query: r[16], latency_ms: parseFloat(r[17]) || null,
    response_text: r[18], tools_used: r[19], replan_count: parseInt(r[20]) || 0,
  }));

  // Also get summary stats
  const summarySQL = `
    SELECT 
      COUNT(*) AS total_classified,
      SUM(computed_value) AS total_value,
      AVG(quality_score) AS avg_quality,
      SUM(CASE WHEN c.category_type = 'success' THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) AS success_rate
    FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES o
    JOIN AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES c ON o.category_id = c.id
    WHERE o.classified_at >= DATEADD('day', -${parseInt(days)}, CURRENT_TIMESTAMP())
      ${filterClause}
  `;
  const summaryResult = await runSQL(summarySQL);
  const s = summaryResult.data?.[0] || ['0', '0', '0', '0'];

  // Get pending count
  const pendingSQL = `
    SELECT COUNT(*) FROM AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES 
    WHERE trace_id NOT IN (SELECT trace_id FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES)
      AND user_query IS NOT NULL
      ${agentSlug ? `AND agent_slug = '${agentSlug}'` : ''}
  `;
  const pendingResult = await runSQL(pendingSQL);
  const pendingCount = parseInt(pendingResult.data?.[0]?.[0] || '0');

  return Response.json({
    outcomes: rows,
    summary: {
      total_classified: parseInt(s[0]),
      total_value: parseFloat(s[1]) || 0,
      avg_quality: parseFloat(s[2]) || 0,
      success_rate: parseFloat(s[3]) || 0,
    },
    pending_count: pendingCount,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, category_id, override_reason } = body;
  if (!id || !category_id) return Response.json({ error: 'id and category_id required' }, { status: 400 });
  if (!SAFE_ID.test(id) || !SAFE_ID.test(category_id)) return Response.json({ error: 'Invalid id format' }, { status: 400 });
  const reasonEscaped = sanitize(override_reason || '');

  // Get the new category's dollar value
  const catResult = await runSQL(`SELECT dollar_value FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES WHERE id = '${category_id}'`);
  const dollarValue = parseFloat(catResult.data?.[0]?.[0] || '0');

  // Get existing quality_score
  const existingResult = await runSQL(`SELECT quality_score FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES WHERE id = '${id}'`);
  const qualityScore = parseFloat(existingResult.data?.[0]?.[0] || '1');

  const computedValue = (dollarValue * qualityScore).toFixed(2);

  await runSQL(`
    UPDATE AGENT_ROI_DEMO.APP.AGENT_OUTCOMES 
    SET category_id = '${category_id}', 
        classification_method = 'manual',
        computed_value = ${computedValue},
        override_reason = '${reasonEscaped}',
        overridden_at = CURRENT_TIMESTAMP()
    WHERE id = '${id}'
  `);

  return Response.json({ status: 'updated', computed_value: parseFloat(computedValue) });
}
