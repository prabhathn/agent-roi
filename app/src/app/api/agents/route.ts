// API Route: GET /api/agents — List all agents
// API Route: POST /api/agents — Create a new agent

import { NextRequest, NextResponse } from 'next/server';
import { getAgents, createAgent } from '@/lib/agent-registry';

export async function GET() {
  try {
    const agents = await getAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch agents: ${error}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.slug || !body.agent_type || !body.mode) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, agent_type, mode' },
        { status: 400 }
      );
    }

    // Validate slug format (lowercase, hyphens, no spaces)
    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      return NextResponse.json(
        { error: 'Slug must be lowercase alphanumeric with hyphens only' },
        { status: 400 }
      );
    }

    const agent = await createAgent(body);
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create agent: ${error}` },
      { status: 500 }
    );
  }
}
