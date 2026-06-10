// Agent registry helper: reads from Snowflake AGENT_REGISTRY table
// Falls back to local agents.json if Snowflake is unreachable

import { getSnowflakeBaseUrl, getAuthHeaders } from './snowflake-auth';
import type { AgentConfig } from '@/types';

const AGENT_DB = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
const AGENT_SCHEMA = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';
const WAREHOUSE = process.env.NEXT_PUBLIC_AGENT_WAREHOUSE || 'AGENT_ROI_WH';

async function executeSql(sql: string): Promise<Record<string, unknown>[]> {
  const url = `${getSnowflakeBaseUrl()}/api/v2/statements`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      statement: sql,
      database: AGENT_DB,
      schema: AGENT_SCHEMA,
      warehouse: WAREHOUSE,
      timeout: 30,
    }),
  });

  if (!response.ok) {
    throw new Error(`SQL execution failed: ${response.status}`);
  }

  const result = await response.json();
  if (result.data && result.resultSetMetaData) {
    const columns = result.resultSetMetaData.rowType.map(
      (col: { name: string }) => col.name.toLowerCase()
    );
    return result.data.map((row: string[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        const val = row[i];
        if (val === null || val === undefined) {
          obj[col] = null;
        } else if (val === 'true' || val === 'TRUE') {
          obj[col] = true;
        } else if (val === 'false' || val === 'FALSE') {
          obj[col] = false;
        } else if (val && (val.startsWith('{') || val.startsWith('['))) {
          try { obj[col] = JSON.parse(val); } catch { obj[col] = val; }
        } else {
          obj[col] = val;
        }
      });
      return obj;
    });
  }
  return [];
}

function rowToAgent(row: Record<string, unknown>): AgentConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    agent_type: row.agent_type as 'cortex_agent' | 'cortex_rest_api' | 'external_agent',
    mode: row.mode as 'live_chat' | 'observability_only',
    sf_database: (row.sf_database as string) || null,
    sf_schema: (row.sf_schema as string) || null,
    sf_agent_name: (row.sf_agent_name as string) || null,
    endpoint_url: (row.endpoint_url as string) || null,
    endpoint_method: (row.endpoint_method as string) || 'POST',
    auth_type: (row.auth_type as string) || null,
    auth_secret_key: (row.auth_secret_key as string) || null,
    obs_database: (row.obs_database as string) || null,
    obs_schema: (row.obs_schema as string) || null,
    obs_agent_name: (row.obs_agent_name as string) || null,
    description: (row.description as string) || null,
    routing_description: (row.routing_description as string) || null,
    is_default: row.is_default === true || row.is_default === 'true',
    is_active: row.is_active === true || row.is_active === 'true' || row.is_active === undefined,
  };
}

async function getLocalFallback(): Promise<AgentConfig[]> {
  // Dynamic import of local config
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(process.cwd(), 'config', 'agents.json');
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as AgentConfig[];
}

export async function getAgents(): Promise<AgentConfig[]> {
  try {
    const rows = await executeSql(
      `SELECT * FROM ${AGENT_DB}.${AGENT_SCHEMA}.AGENT_REGISTRY WHERE is_active = TRUE ORDER BY is_default DESC, name ASC`
    );
    return rows.map(rowToAgent);
  } catch (err) {
    console.warn('Failed to fetch agents from Snowflake, using local fallback:', err);
    return getLocalFallback();
  }
}

export async function getAgentBySlug(slug: string): Promise<AgentConfig | null> {
  try {
    const rows = await executeSql(
      `SELECT * FROM ${AGENT_DB}.${AGENT_SCHEMA}.AGENT_REGISTRY WHERE slug = '${slug.replace(/'/g, "''")}' AND is_active = TRUE LIMIT 1`
    );
    if (rows.length === 0) return null;
    return rowToAgent(rows[0]);
  } catch (err) {
    console.warn('Failed to fetch agent from Snowflake, using local fallback:', err);
    const agents = await getLocalFallback();
    return agents.find((a) => a.slug === slug) || null;
  }
}

export async function createAgent(agent: Omit<AgentConfig, 'id'>): Promise<AgentConfig> {
  const cols = [
    'name', 'slug', 'agent_type', 'mode',
    'sf_database', 'sf_schema', 'sf_agent_name',
    'endpoint_url', 'endpoint_method', 'auth_type', 'auth_secret_key',
    'obs_database', 'obs_schema', 'obs_agent_name',
    'description', 'routing_description', 'is_default', 'is_active',
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const values = cols.map((col) => escape((agent as Record<string, unknown>)[col]));

  const sql = `INSERT INTO ${AGENT_DB}.${AGENT_SCHEMA}.AGENT_REGISTRY (${cols.join(', ')}) VALUES (${values.join(', ')})`;
  await executeSql(sql);

  // Fetch the newly created agent
  const created = await getAgentBySlug(agent.slug);
  if (!created) throw new Error('Agent created but could not be retrieved');
  return created;
}

export async function updateAgent(slug: string, updates: Partial<AgentConfig>): Promise<AgentConfig> {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const setClauses: string[] = [];
  const allowedFields = [
    'name', 'agent_type', 'mode',
    'sf_database', 'sf_schema', 'sf_agent_name',
    'endpoint_url', 'endpoint_method', 'auth_type', 'auth_secret_key',
    'obs_database', 'obs_schema', 'obs_agent_name',
    'description', 'routing_description', 'is_default', 'is_active',
  ];

  for (const field of allowedFields) {
    if (field in updates) {
      setClauses.push(`${field} = ${escape((updates as Record<string, unknown>)[field])}`);
    }
  }

  if (setClauses.length === 0) {
    const existing = await getAgentBySlug(slug);
    if (!existing) throw new Error('Agent not found');
    return existing;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP()`);

  const sql = `UPDATE ${AGENT_DB}.${AGENT_SCHEMA}.AGENT_REGISTRY SET ${setClauses.join(', ')} WHERE slug = '${slug.replace(/'/g, "''")}'`;
  await executeSql(sql);

  const updated = await getAgentBySlug(slug);
  if (!updated) throw new Error('Agent updated but could not be retrieved');
  return updated;
}

export async function deleteAgent(slug: string): Promise<void> {
  await executeSql(
    `DELETE FROM ${AGENT_DB}.${AGENT_SCHEMA}.AGENT_REGISTRY WHERE slug = '${slug.replace(/'/g, "''")}'`
  );
}
