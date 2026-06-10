// API Route: POST /api/agent/feedback
// Proxies feedback requests to Snowflake Feedback REST API

import { NextRequest, NextResponse } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders, getAgentPath } from '@/lib/snowflake-auth';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const url = `${getSnowflakeBaseUrl()}${getAgentPath()}:feedback`;

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
