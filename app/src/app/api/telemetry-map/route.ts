// API Route: GET /api/telemetry-map
// Returns the SPAN_ATTRIBUTE_MAP grouped by standard_attr for dynamic SQL building

import { NextResponse } from 'next/server';
import { getSnowflakeBaseUrl, getAuthHeaders } from '@/lib/snowflake-auth';

const AGENT_DB = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
const AGENT_SCHEMA = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';
const WAREHOUSE = process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH';

export async function GET() {
  try {
    const url = `${getSnowflakeBaseUrl()}/api/v2/statements`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        statement: `SELECT standard_attr, agent_type, source_attr_path, priority
                    FROM ${AGENT_DB}.${AGENT_SCHEMA}.SPAN_ATTRIBUTE_MAP
                    ORDER BY standard_attr, agent_type, priority`,
        database: AGENT_DB,
        schema: AGENT_SCHEMA,
        warehouse: WAREHOUSE,
        timeout: 30,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ mappings: {} }, { status: 200 });
    }

    const result = await response.json();
    if (!result.data || !result.resultSetMetaData) {
      return NextResponse.json({ mappings: {} });
    }

    // Parse into grouped structure
    const mappings: Record<string, Array<{ agent_type: string; source_attr_path: string; priority: number }>> = {};

    for (const row of result.data) {
      const standardAttr = row[0];
      const agentType = row[1];
      const sourceAttrPath = row[2];
      const priority = parseInt(row[3], 10);

      if (!mappings[standardAttr]) {
        mappings[standardAttr] = [];
      }
      mappings[standardAttr].push({ agent_type: agentType, source_attr_path: sourceAttrPath, priority });
    }

    return NextResponse.json({ mappings });
  } catch {
    // Return empty mappings on failure (traces page will fall back to hardcoded)
    return NextResponse.json({ mappings: {} });
  }
}
