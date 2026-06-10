# config.py - Snowflake connection + TruLens session for the Local Q&A Agent
# Same pattern as the Knowledge RAG agent

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

APP_NAME = "LOCAL_QA_AGENT"
APP_VERSION = "V1"

# Local LLM config
LLAMA_SERVER_URL = os.environ.get("LLAMA_SERVER_URL", "http://localhost:8080/v1")
LLAMA_MODEL = os.environ.get("LLAMA_MODEL", "qwen2.5-0.5b-instruct-q4_k_m.gguf")


def get_token() -> str:
    with open(TOKEN_FILE, "r") as f:
        return f.read().strip()


def get_tru_session():
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
