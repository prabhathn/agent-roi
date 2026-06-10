// API Route: GET /api/agents/[slug] — Get single agent
// API Route: PUT /api/agents/[slug] — Update agent
// API Route: DELETE /api/agents/[slug] — Delete agent

import { NextRequest, NextResponse } from 'next/server';
import { getAgentBySlug, updateAgent, deleteAgent } from '@/lib/agent-registry';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const agent = await getAgentBySlug(slug);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch agent: ${error}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const body = await request.json();
    const agent = await updateAgent(slug, body);
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update agent: ${error}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    await deleteAgent(slug);
    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to delete agent: ${error}` },
      { status: 500 }
    );
  }
}
