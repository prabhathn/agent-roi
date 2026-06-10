// API Route: POST /api/agent/trace-run
// Proxies to the TRACE_ANALYST_AGENT for observability questions

import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const AGENT_DB = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
const AGENT_SCHEMA = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';
const TRACE_AGENT_NAME = 'TRACE_ANALYST_AGENT';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Transform messages content to array format
  const messages = (body.messages || []).map((msg: { role: string; content: string | Array<{ type: string; text: string }> }) => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : msg.content,
  }));

  const payload: Record<string, unknown> = { messages };
  if (body.thread_id) {
    payload.thread_id = body.thread_id;
  }

  const url = `${getSnowflakeBaseUrl()}/api/v2/databases/${AGENT_DB}/schemas/${AGENT_SCHEMA}/agents/${TRACE_AGENT_NAME}:run`;

  const headers = getAuthHeaders();
  headers['Accept'] = 'text/event-stream';

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(JSON.stringify({ error: errorText }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requestId = response.headers.get('X-Snowflake-Request-ID') || '';

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Snowflake-Request-ID': requestId,
    },
  });
}
