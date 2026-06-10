# config.py - Snowflake connection + TruLens session initialization
# Uses a programmatic access token (PAT) for authentication

import os

# Snowflake connection parameters (override via environment variables)
SNOWFLAKE_ACCOUNT = os.environ.get("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.environ.get("SNOWFLAKE_USER", "admin")
SNOWFLAKE_DATABASE = os.environ.get("SNOWFLAKE_DATABASE", "AGENT_ROI_DEMO")
SNOWFLAKE_SCHEMA = os.environ.get("SNOWFLAKE_SCHEMA", "APP")
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "AGENT_ROI_WH")
SNOWFLAKE_ROLE = os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN")

# Token file path (from Snowflake CLI or set manually)
TOKEN_FILE = os.path.expanduser(
    os.environ.get("SNOWFLAKE_TOKEN_FILE", "~/.snowflake/tokens/token")
)

# App metadata for TruLens OTEL export
APP_NAME = "KNOWLEDGE_RAG_AGENT"
APP_VERSION = "V1"

# LLM model for Cortex COMPLETE
CORTEX_MODEL = "llama3.1-8b"


def get_token() -> str:
    """Read the PAT token from the token file."""
    with open(TOKEN_FILE, "r") as f:
        return f.read().strip()


def get_snowpark_session():
    """Create a Snowpark session using PAT auth."""
    from snowflake.snowpark import Session

    connection_params = {
        "account": SNOWFLAKE_ACCOUNT,
        "user": SNOWFLAKE_USER,
        "authenticator": "programmatic_access_token",
        "token": get_token(),
        "database": SNOWFLAKE_DATABASE,
        "schema": SNOWFLAKE_SCHEMA,
        "warehouse": SNOWFLAKE_WAREHOUSE,
        "role": SNOWFLAKE_ROLE,
    }
    return Session.builder.configs(connection_params).create()


def get_tru_session():
    """Initialize TruLens with Snowflake connector for OTEL span export."""
    from trulens.connectors.snowflake import SnowflakeConnector
    from trulens.core import TruSession

    conn = SnowflakeConnector(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        warehouse=SNOWFLAKE_WAREHOUSE,
        role=SNOWFLAKE_ROLE,
        authenticator="programmatic_access_token",
        token=get_token(),
    )
    session = TruSession(connector=conn)
    return session
