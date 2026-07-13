// POST /api/outcomes/classify - Run AI_CLASSIFY on unclassified traces
// Does classification entirely in Snowflake SQL for performance (batch)

import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

async function execSQL(sql: string): Promise<{ data: string[][] | null; error?: string }> {
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
      timeout: 600,
    }),
  });
  let result = await response.json();

  // Poll for async execution (code 090001 = still running)
  const maxPolls = 300; // 5 minutes max (300 * 1s)
  let polls = 0;
  while (result.code === '090001' && polls < maxPolls) {
    await new Promise(r => setTimeout(r, 2000));
    const handle = result.statementHandle;
    if (!handle) break;
    const pollResp = await fetch(`${baseUrl}/api/v2/statements/${handle}`, { headers });
    result = await pollResp.json();
    polls++;
  }

  // Check for errors
  if (result.code && result.code !== '090001' && result.code !== '090000' && !result.data && result.message) {
    return { data: null, error: result.message };
  }
  
  // For INSERT statements, data might be in resultSetMetaData
  return { data: result.data || [] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const agentFilter = body.agent_slug || null;
    const limit = body.limit || 10;

    // Step 1: Run the full classification in a single SQL statement
    // This does AI_CLASSIFY in batch, calculates quality, and inserts results
    const agentClause = agentFilter ? `AND v.agent_slug = '${agentFilter}'` : '';

    // First get categories for reference
    const catResult = await execSQL(`SELECT id, agent_slug, category_name, category_type, dollar_value FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES ORDER BY agent_slug, sort_order`);
    if (catResult.error) return Response.json({ error: catResult.error }, { status: 500 });

    // Get count of pending
    const countResult = await execSQL(`
      SELECT COUNT(*) FROM AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES v
      WHERE v.trace_id NOT IN (SELECT trace_id FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES)
        AND v.user_query IS NOT NULL ${agentClause}
    `);
    const pendingCount = parseInt(countResult.data?.[0]?.[0] || '0');
    if (pendingCount === 0) {
      return Response.json({ classified: 0, message: 'No unclassified traces found' });
    }

    // Step 2: Classify in batch using AI_CLASSIFY - one agent at a time
    // Get distinct agent slugs that have unclassified traces
    const agentSlugsResult = await execSQL(`
      SELECT DISTINCT v.agent_slug 
      FROM AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES v
      WHERE v.trace_id NOT IN (SELECT trace_id FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES)
        AND v.user_query IS NOT NULL ${agentClause}
    `);

    let totalClassified = 0;

    for (const row of (agentSlugsResult.data || [])) {
      const slug = row[0];
      // Get categories for this agent
      const agentCats = (catResult.data || []).filter((r: string[]) => r[1] === slug);
      if (agentCats.length === 0) continue;

      const categoryArray = agentCats.map((c: string[]) => `'${c[2].replace(/'/g, "''")}'`).join(', ');

      // Run batch classify + insert in one statement
      const classifyAndInsertSQL = `
        INSERT INTO AGENT_ROI_DEMO.APP.AGENT_OUTCOMES 
          (trace_id, agent_slug, category_id, classification_method, feedback_signal, 
           ai_classify_probability, quality_score, computed_value, trace_summary)
        WITH unclassified AS (
          SELECT v.trace_id, v.agent_slug, v.trace_summary, v.latency_ms, v.replan_count, 
                 v.span_count, v.has_error, v.feedback_signal
          FROM AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES v
          WHERE v.trace_id NOT IN (SELECT trace_id FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES)
            AND v.user_query IS NOT NULL
            AND v.agent_slug = '${slug}'
          LIMIT ${limit}
        ),
        classified AS (
          SELECT 
            u.*,
            AI_CLASSIFY(u.trace_summary, ARRAY_CONSTRUCT(${categoryArray}))::VARCHAR AS raw_classification
          FROM unclassified u
        ),
        parsed AS (
          SELECT 
            c.*,
            COALESCE(
              PARSE_JSON(c.raw_classification):labels[0]::VARCHAR,
              '${agentCats[0][2]}'
            ) AS classified_label
          FROM classified c
        ),
        with_category AS (
          SELECT 
            p.*,
            cat.id AS category_id,
            cat.dollar_value,
            cat.category_type
          FROM parsed p
          LEFT JOIN AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES cat 
            ON cat.agent_slug = p.agent_slug AND cat.category_name = p.classified_label
        ),
        with_quality AS (
          SELECT 
            w.*,
            GREATEST(0.0, LEAST(1.0,
              1.0
              - IFF(w.has_error, 0.25, 0.0)
              - IFF(w.latency_ms > 30000, 0.10, 0.0)
              - IFF(w.replan_count > 3, 0.10, 0.0)
              + IFF(w.feedback_signal = 'thumbs_up', 0.10, 0.0)
              - IFF(w.feedback_signal = 'thumbs_down', 0.30, 0.0)
            )) AS quality
          FROM with_category w
        )
        SELECT 
          q.trace_id,
          q.agent_slug,
          COALESCE(q.category_id, (SELECT id FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES WHERE agent_slug = '${slug}' ORDER BY sort_order LIMIT 1)),
          IFF(q.feedback_signal != 'none', 'feedback', 'ai_classify'),
          q.feedback_signal,
          0.85,
          q.quality,
          COALESCE(q.dollar_value, 0) * q.quality,
          LEFT(q.trace_summary, 1000)
        FROM with_quality q
      `;

      const insertResult = await execSQL(classifyAndInsertSQL);
      if (insertResult.error) {
        console.error(`[classify] Error for ${slug}:`, insertResult.error);
        continue;
      }
      // Count newly inserted from the INSERT result metadata
      const numInserted = insertResult.data?.[0]?.[0] 
        ? parseInt(insertResult.data[0][0]) 
        : (insertResult as Record<string, unknown>).rowsAffected 
          ? parseInt(String((insertResult as Record<string, unknown>).rowsAffected))
          : 0;
      totalClassified += numInserted || 0;
    }

    // Step 3: Update baselines
    await execSQL(`
      MERGE INTO AGENT_ROI_DEMO.APP.OUTCOME_BASELINES b
      USING (
        SELECT o.agent_slug, o.category_id,
          AVG(v.latency_ms) AS avg_latency_ms, AVG(v.replan_count) AS avg_replan_count,
          AVG(v.span_count) AS avg_span_count, AVG(IFF(v.has_error, 1, 0)) AS error_rate, COUNT(*) AS sample_count
        FROM AGENT_ROI_DEMO.APP.AGENT_OUTCOMES o
        JOIN AGENT_ROI_DEMO.APP.V_TRACE_SUMMARIES v ON o.trace_id = v.trace_id
        GROUP BY o.agent_slug, o.category_id
      ) s ON b.agent_slug = s.agent_slug AND b.category_id = s.category_id
      WHEN MATCHED THEN UPDATE SET avg_latency_ms=s.avg_latency_ms, avg_replan_count=s.avg_replan_count, avg_span_count=s.avg_span_count, error_rate=s.error_rate, sample_count=s.sample_count, last_updated=CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (agent_slug, category_id, avg_latency_ms, avg_replan_count, avg_span_count, error_rate, sample_count) VALUES (s.agent_slug, s.category_id, s.avg_latency_ms, s.avg_replan_count, s.avg_span_count, s.error_rate, s.sample_count)
    `);

    return Response.json({ classified: totalClassified, message: `Classified ${totalClassified} traces total` });
  } catch (error) {
    console.error('[classify] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
