// Snowflake authentication helper
// Reads the programmatic access token from the existing Snowflake connection config

import { readFileSync } from 'fs';

const DEFAULT_TOKEN_PATH = '/Users/pnanisetty/.snowflake/tokens/XFB07251ACCOUNTADMIN_token';
const DEFAULT_ACCOUNT = 'SFSENORTHAMERICA-DEMO_IND_PNANISETTY';

function getToken(): string {
  // Priority: env var > token file from connection config
  if (process.env.SNOWFLAKE_PAT) {
    return process.env.SNOWFLAKE_PAT;
  }

  const tokenPath = process.env.SNOWFLAKE_TOKEN_FILE || DEFAULT_TOKEN_PATH;
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    console.error(`Failed to read token from ${tokenPath}. Set SNOWFLAKE_PAT env var or ensure token file exists.`);
    return '';
  }
}

function getHost(): string {
  if (process.env.NEXT_PUBLIC_SNOWFLAKE_HOST) {
    return process.env.NEXT_PUBLIC_SNOWFLAKE_HOST;
  }
  const account = process.env.NEXT_PUBLIC_SNOWFLAKE_ACCOUNT || DEFAULT_ACCOUNT;
  return `${account}.snowflakecomputing.com`;
}

export function getSnowflakeBaseUrl(): string {
  return `https://${getHost()}`;
}

export function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

export function getAgentPath(): string {
  const db = process.env.NEXT_PUBLIC_AGENT_DATABASE || 'AGENT_ROI_DEMO';
  const schema = process.env.NEXT_PUBLIC_AGENT_SCHEMA || 'APP';
  const agent = process.env.NEXT_PUBLIC_AGENT_NAME || 'ROI_DEMO_AGENT';
  return `/api/v2/databases/${db}/schemas/${schema}/agents/${agent}`;
}
