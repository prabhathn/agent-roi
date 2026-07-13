// GET /api/outcomes/categories - List categories (optionally filtered by agent_slug)
// POST /api/outcomes/categories - Create a new category

import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const SAFE_SLUG = /^[a-z0-9_-]+$/;
const SAFE_ID = /^[a-f0-9-]+$/;
const VALID_TYPES = ['success', 'failure', 'partial', 'neutral'];
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
  const where = agentSlug ? `WHERE agent_slug = '${agentSlug}'` : '';
  const result = await runSQL(`SELECT id, agent_slug, category_name, category_type, dollar_value, color, sort_order, created_at FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES ${where} ORDER BY agent_slug, sort_order`);
  const rows = (result.data || []).map((r: string[]) => ({
    id: r[0], agent_slug: r[1], category_name: r[2], category_type: r[3],
    dollar_value: parseFloat(r[4]), color: r[5], sort_order: parseInt(r[6]), created_at: r[7],
  }));
  return Response.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agent_slug, category_name, category_type, dollar_value, color } = body;
  if (!agent_slug || !category_name || !category_type) {
    return Response.json({ error: 'agent_slug, category_name, and category_type are required' }, { status: 400 });
  }
  if (!SAFE_SLUG.test(agent_slug)) return Response.json({ error: 'Invalid slug' }, { status: 400 });
  if (!VALID_TYPES.includes(category_type)) return Response.json({ error: 'Invalid category_type' }, { status: 400 });
  const safeName = sanitize(category_name);
  const safeColor = (color || '#6b7280').replace(/[^#a-fA-F0-9]/g, '');
  const maxOrder = await runSQL(`SELECT COALESCE(MAX(sort_order), 0) + 1 FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES WHERE agent_slug = '${agent_slug}'`);
  const nextOrder = parseInt(maxOrder.data?.[0]?.[0] || '1');
  const sql = `INSERT INTO AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES (agent_slug, category_name, category_type, dollar_value, color, sort_order) SELECT '${agent_slug}', '${safeName}', '${category_type}', ${parseFloat(dollar_value) || 0}, '${safeColor}', ${nextOrder}`;
  await runSQL(sql);
  return Response.json({ status: 'created' });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, category_name, category_type, dollar_value, color } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!SAFE_ID.test(id)) return Response.json({ error: 'Invalid id format' }, { status: 400 });
  if (category_type && !VALID_TYPES.includes(category_type)) return Response.json({ error: 'Invalid category_type' }, { status: 400 });
  const sets: string[] = [];
  if (category_name) sets.push(`category_name = '${sanitize(category_name)}'`);
  if (category_type) sets.push(`category_type = '${category_type}'`);
  if (dollar_value !== undefined) sets.push(`dollar_value = ${parseFloat(dollar_value) || 0}`);
  if (color) sets.push(`color = '${color.replace(/[^#a-fA-F0-9]/g, '')}'`);
  if (sets.length === 0) return Response.json({ error: 'nothing to update' }, { status: 400 });
  await runSQL(`UPDATE AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES SET ${sets.join(', ')} WHERE id = '${id}'`);
  return Response.json({ status: 'updated' });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!SAFE_ID.test(id)) return Response.json({ error: 'Invalid id format' }, { status: 400 });
  await runSQL(`DELETE FROM AGENT_ROI_DEMO.APP.OUTCOME_CATEGORIES WHERE id = '${id}'`);
  return Response.json({ status: 'deleted' });
}
