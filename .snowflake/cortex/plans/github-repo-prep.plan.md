# Plan: GitHub-Ready Repository

## Context

The project at `/Users/pnanisetty/code/agent_roi` contains hardcoded credentials and account-specific paths in several files. We need a clean copy that:
- Replaces all hardcoded credentials/accounts with environment variable references
- Provides `.env.example` files with placeholder values
- Includes a `setup.sh` one-command setup script
- Excludes build artifacts, venvs, node_modules, __pycache__, .DS_Store
- Includes a comprehensive README with both manual and scripted setup paths
- Pushes to `prabhathn/agent-roi`

### Files with sensitive content to sanitize

| File | Sensitive Content |
|------|------------------|
| `app/src/lib/snowflake-auth.ts` | Hardcoded token path, account name |
| `app/.env.local` | Account-specific values (should not be committed) |
| `app/.env.local.example` | Contains account-specific defaults |
| `external-agent/config.py` | Hardcoded account, token path |
| `external-agent/local/config.py` | Hardcoded account, token path |
| `docs/project-overview.html` | Account name in footer |

### Files to exclude entirely

- `app/.git/` (existing git history from create-next-app)
- `app/node_modules/`, `app/.next/`, `app/.env.local`, `app/tsconfig.tsbuildinfo`, `app/next-env.d.ts`
- `external-agent/.venv/`, `external-agent/__pycache__/`
- `external-agent/local/.venv/`, `external-agent/local/__pycache__/`
- `.DS_Store`, `.snowflake/`

---

## Implementation Steps

### Step 1: Create the target directory and copy project files

```bash
rsync -av --exclude='node_modules' --exclude='.next' --exclude='.venv' \
  --exclude='__pycache__' --exclude='.DS_Store' --exclude='.git' \
  --exclude='.env.local' --exclude='tsconfig.tsbuildinfo' \
  --exclude='next-env.d.ts' --exclude='.snowflake' \
  /Users/pnanisetty/code/agent_roi/ /Users/pnanisetty/code/agent_roi_for_github/
```

### Step 2: Sanitize hardcoded credentials

**`app/src/lib/snowflake-auth.ts`** — Replace hardcoded defaults:
```typescript
const DEFAULT_TOKEN_PATH = process.env.SNOWFLAKE_TOKEN_FILE || '';
const DEFAULT_ACCOUNT = process.env.NEXT_PUBLIC_SNOWFLAKE_ACCOUNT || '';
```

**`external-agent/config.py`** and **`external-agent/local/config.py`** — Replace with env var reads:
```python
SNOWFLAKE_ACCOUNT = os.environ.get("SNOWFLAKE_ACCOUNT", "")
TOKEN_FILE = os.environ.get("SNOWFLAKE_TOKEN_FILE", os.path.expanduser("~/.snowflake/tokens/token"))
```

**`docs/project-overview.html`** — Remove account-specific footer line, replace with generic placeholder.

### Step 3: Create environment templates

**`.env.example`** (root level):
- Snowflake connection settings (account, user, role, warehouse, database, schema)
- Auth options (PAT or token file)
- Next.js public vars
- Local LLM settings (llama-server URL, model name)

**`app/.env.local.example`** — Cleaned version with placeholders only.

### Step 4: Create `setup.sh` script

An interactive bash script that:
1. Checks prerequisites (node, python, snow CLI)
2. Prompts for Snowflake account, user, role, warehouse
3. Generates `.env` files from templates
4. Installs Node.js dependencies (`cd app && npm install`)
5. Creates Python virtual environments and installs requirements
6. Optionally runs Snowflake SQL scripts (01-13) via `snow sql`
7. Prints next steps (start servers, download model if using local agent)

### Step 5: Write comprehensive README.md

Sections:
- Project overview (what it does, why it exists)
- Architecture diagram (ASCII — shows 3 agent types, telemetry flow, feedback loop)
- Prerequisites
- Quick Start (two paths: `./setup.sh` or manual steps)
- Manual Setup (detailed step-by-step)
- Running the Application (4 terminals)
- Project Structure tree
- Configuration Reference (all env vars documented)
- SQL Scripts Reference (what each numbered script does)
- Link to `docs/project-overview.html` for methodology details

### Step 6: Create root .gitignore

Covers: node_modules, .venv, __pycache__, .next, .env files, .DS_Store, *.gguf models, .snowflake/, IDE files.

### Step 7: Initialize git repo and push

```bash
git init && git add . && git commit -m "Initial commit" && git push
```

---

## Target Directory Structure

```
agent_roi_for_github/
├── .env.example
├── .gitignore
├── README.md
├── setup.sh                  # One-command setup
├── app/
│   ├── .env.local.example
│   ├── .gitignore
│   ├── package.json
│   ├── config/agents.json
│   └── src/...
├── external-agent/
│   ├── config.py (sanitized)
│   ├── agent.py
│   ├── server.py
│   ├── requirements.txt
│   └── local/
│       ├── config.py (sanitized)
│       ├── agent.py
│       ├── server.py
│       └── requirements.txt
├── snowflake/
│   ├── 01_setup.sql ... 13_local_agent.sql
├── scripts/
│   └── generate_conversations.py
└── docs/
    ├── project-overview.html
    └── roi-methodology.md
```

---

## Verification

1. `grep -r "pnanisetty\|XFB07251" .` returns zero results
2. `grep -r "SFSENORTHAMERICA" .` only in comments explaining format (if any)
3. No `.env.local`, `node_modules/`, `.venv/`, `__pycache__/`, `.gguf` files present
4. `./setup.sh --help` prints usage info
5. README is followable from scratch by someone with just a Snowflake account
