// API Route: POST /api/agent/[slug]/feedback
// Dynamic feedback routing based on agent type

import { NextRequest, NextResponse } from 'next/server';
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
    return NextResponse.json({ error: `Agent '${slug}' not found` }, { status: 404 });
  }

  if (agent.agent_type === 'cortex_agent') {
    return handleCortexFeedback(agent, body);
  } else if (agent.agent_type === 'cortex_rest_api') {
    // Route feedback to the Python agent's TruLens feedback endpoint
    if (agent.endpoint_url) {
      return handleExternalFeedback(agent.endpoint_url, body);
    }
    return NextResponse.json({ status: 'Feedback acknowledged (agent offline)' });
  } else if (agent.agent_type === 'external_agent') {
    // Route feedback to the agent's /feedback endpoint
    if (agent.endpoint_url) {
      return handleExternalFeedback(agent.endpoint_url, body);
    }
    // Otherwise, just acknowledge (feedback stored via app-side logging)
    return NextResponse.json({ status: 'Feedback acknowledged (no backend configured)' });
  }

  return NextResponse.json({ error: `Unknown agent type: ${agent.agent_type}` }, { status: 400 });
}

async function handleExternalFeedback(endpointUrl: string, body: Record<string, unknown>) {
  // Derive the feedback URL from the chat endpoint URL
  const feedbackUrl = endpointUrl.replace(/\/chat$/, '/feedback');

  try {
    const response = await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    // Agent might be offline
    return NextResponse.json(
      { status: 'Feedback acknowledged (agent unreachable)', error: String(error) },
      { status: 202 }
    );
  }
}

async function handleCortexFeedback(
  agent: { sf_database: string | null; sf_schema: string | null; sf_agent_name: string | null },
  body: Record<string, unknown>
) {
  const db = agent.sf_database || 'AGENT_ROI_DEMO';
  const schema = agent.sf_schema || 'APP';
  const agentName = agent.sf_agent_name || 'ROI_DEMO_AGENT';

  const url = `${getSnowflakeBaseUrl()}/api/v2/databases/${db}/schemas/${schema}/agents/${agentName}:feedback`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: errorText }, { status: response.status });
  }

  const text = await response.text();
  if (text) {
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ status: 'Feedback submitted successfully' });
    }
  }
  return NextResponse.json({ status: 'Feedback submitted successfully' });
}
