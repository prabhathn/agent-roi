// API Route: POST /api/agent/[slug]/run
// Dynamic agent routing - supports Cortex Agents and External Agents

import { NextRequest } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';
import { getAgentBySlug } from '@/lib/agent-registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();

  // Look up agent config
  const agent = await getAgentBySlug(slug);
  if (!agent) {
    return new Response(JSON.stringify({ error: `Agent '${slug}' not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (agent.mode === 'observability_only') {
    return new Response(JSON.stringify({ error: 'This agent is observability-only and does not support live chat' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Route based on agent type
  if (agent.agent_type === 'cortex_agent') {
    return handleCortexAgent(agent, body);
  } else if (agent.agent_type === 'cortex_rest_api' || agent.agent_type === 'external_agent') {
    return handleExternalAgent(agent, body);
  }

  return new Response(JSON.stringify({ error: `Unknown agent type: ${agent.agent_type}` }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCortexAgent(
  agent: { sf_database: string | null; sf_schema: string | null; sf_agent_name: string | null },
  body: { messages?: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>; thread_id?: number }
) {
  const db = agent.sf_database || 'AGENT_ROI_DEMO';
  const schema = agent.sf_schema || 'APP';
  const agentName = agent.sf_agent_name || 'ROI_DEMO_AGENT';

  // Transform messages to the format expected by the Cortex Agent API
  const messages = (body.messages || []).map((msg) => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : msg.content,
  }));

  const payload: Record<string, unknown> = { messages };
  if (body.thread_id) {
    payload.thread_id = body.thread_id;
  }

  const url = `${getSnowflakeBaseUrl()}/api/v2/databases/${db}/schemas/${schema}/agents/${agentName}:run`;

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

async function handleExternalAgent(
  agent: { endpoint_url: string | null; endpoint_method: string; auth_type: string | null; auth_secret_key: string | null },
  body: { messages?: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>; thread_id?: number }
) {
  if (!agent.endpoint_url) {
    return new Response(JSON.stringify({ error: 'External agent has no endpoint URL configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  // Add authentication headers
  if (agent.auth_type === 'bearer' && agent.auth_secret_key) {
    // In production, this would read from a secrets manager
    headers['Authorization'] = `Bearer ${agent.auth_secret_key}`;
  } else if (agent.auth_type === 'api_key' && agent.auth_secret_key) {
    headers['X-API-Key'] = agent.auth_secret_key;
  }

  const response = await fetch(agent.endpoint_url, {
    method: agent.endpoint_method || 'POST',
    headers,
    body: JSON.stringify({
      messages: body.messages,
      ...(body.thread_id && { thread_id: body.thread_id }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(JSON.stringify({ error: errorText }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = response.headers.get('Content-Type') || '';

  // If the external agent returns SSE, forward it directly
  if (contentType.includes('text/event-stream')) {
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // If it returns JSON, convert to SSE format for the client
  const jsonResponse = await response.json();
  const text = jsonResponse.response || jsonResponse.content || JSON.stringify(jsonResponse);

  const sseBody = `event: response.text.delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {}\n\n`;

  return new Response(sseBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
