// API Route: POST /api/sql
// Proxies SQL queries to Snowflake Statement API

import { NextRequest, NextResponse } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const AGENT_DB = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
const AGENT_SCHEMA = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';
const WAREHOUSE = process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH';

export async function POST(request: NextRequest) {
  const { sql } = await request.json();

  if (!sql) {
    return NextResponse.json({ error: 'Missing sql parameter' }, { status: 400 });
  }

  const url = `${getSnowflakeBaseUrl()}/api/v2/statements`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      statement: sql,
      database: AGENT_DB,
      schema: AGENT_SCHEMA,
      warehouse: WAREHOUSE,
      timeout: 60,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: errorText }, { status: response.status });
  }

  const result = await response.json();

  // Transform Snowflake response into a simpler format
  if (result.data && result.resultSetMetaData) {
    const columns = result.resultSetMetaData.rowType.map(
      (col: { name: string; type: string }) => col.name.toLowerCase()
    );
    const rows = result.data.map((row: string[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        // Try to parse JSON values (for VARIANT/OBJECT columns)
        const val = row[i];
        if (val && (val.startsWith('{') || val.startsWith('[') || val.startsWith('"'))) {
          try { obj[col] = JSON.parse(val); } catch { obj[col] = val; }
        } else {
          obj[col] = val;
        }
      });
      return obj;
    });
    return NextResponse.json({ data: rows, columns });
  }

  return NextResponse.json({ data: [], columns: [] });
}
