# server.py - FastAPI server for the Local Q&A Agent (LangGraph + llama-server)
# Port 8001. SSE streaming with think/draft/refine status events.

import json
import asyncio
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from config import get_tru_session, get_token, APP_NAME, APP_VERSION, SNOWFLAKE_ACCOUNT
from agent import agent

# Global references
tru_session = None
tru_chain = None
# Store recent records for feedback (record_id -> time)
recent_records: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tru_session, tru_chain

    print("Initializing TruLens session...")
    tru_session = get_tru_session()

    print("Wrapping agent with TruChain...")
    from trulens.apps.langchain import TruChain
    tru_chain = TruChain(
        agent,
        app_name=APP_NAME,
        app_version=APP_VERSION,
        start_evaluator=False,
    )

    print(f"Local Q&A Agent ready ({APP_NAME} {APP_VERSION})")
    print("Listening on http://localhost:8001")

    yield

    if tru_session:
        print("Flushing TruLens spans...")
        tru_session.force_flush()


app = FastAPI(title="Local Q&A Agent", lifespan=lifespan)


def chunk_text(text: str, chunk_size: int = 40) -> list[str]:
    """Split text into chunks for streaming."""
    chunks = []
    words = text.split(" ")
    current = ""
    for word in words:
        if len(current) + len(word) + 1 > chunk_size and current:
            chunks.append(current + " ")
            current = word
        else:
            current = current + " " + word if current else word
    if current:
        chunks.append(current)
    return chunks


@app.post("/chat")
async def chat(request: Request):
    """Handle chat requests with SSE streaming."""
    body = await request.json()
    messages = body.get("messages", [])

    # Extract last user message
    query = ""
    for msg in reversed(messages):
        content = msg.get("content", "")
        if msg.get("role") == "user":
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        query = item.get("text", "")
                        break
            else:
                query = content
            break

    if not query:
        async def error_stream():
            yield f"event: response.text.delta\ndata: {json.dumps({'text': 'No question provided.'})}\n\n"
            yield "event: done\ndata: {}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    request_id = str(uuid.uuid4())

    async def event_stream():
        nonlocal request_id

        # Status: thinking
        yield f"event: response.status\ndata: {json.dumps({'message': 'Thinking...', 'status': 'planning', 'sequence_number': 0})}\n\n"

        # Run the LangGraph agent via TruChain
        try:
            with tru_chain as recording:
                result = agent.invoke({"query": query})
        except Exception as e:
            yield f"event: response.text.delta\ndata: {json.dumps({'text': f'Error: {str(e)}'})}\n\n"
            yield "event: done\ndata: {}\n\n"
            return

        # Capture record_id
        record_id = ""
        if recording.records:
            record_id = recording.records[0].record_id
            recent_records[record_id] = True
            if len(recent_records) > 100:
                oldest = next(iter(recent_records))
                del recent_records[oldest]
            request_id = record_id

        # Status: drafting
        yield f"event: response.status\ndata: {json.dumps({'message': 'Drafting response...', 'status': 'generating', 'sequence_number': 1})}\n\n"

        # Status: refining
        yield f"event: response.status\ndata: {json.dumps({'message': 'Refining answer...', 'status': 'generating', 'sequence_number': 2})}\n\n"

        # Stream the final response
        final_response = result.get("response", result.get("draft", "No response generated."))
        chunks = chunk_text(final_response, 40)
        for chunk in chunks:
            yield f"event: response.text.delta\ndata: {json.dumps({'text': chunk})}\n\n"
            await asyncio.sleep(0.02)

        # Emit record_id for feedback linking
        if record_id:
            yield f"event: response.metadata\ndata: {json.dumps({'record_id': record_id})}\n\n"

        yield "event: done\ndata: {}\n\n"

        # Flush spans
        if tru_session:
            try:
                tru_session.force_flush()
            except Exception:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Snowflake-Request-ID": request_id,
        },
    )


@app.post("/feedback")
async def feedback(request: Request):
    """Store feedback in the AGENT_FEEDBACK Snowflake table."""
    body = await request.json()

    record_id = body.get("record_id") or body.get("orig_request_id")
    if not record_id:
        return {"error": "record_id is required"}, 400

    positive = body.get("positive", True)
    categories = body.get("categories", [])
    feedback_message = body.get("feedback_message", "")

    name = "user_thumbs_up" if positive else "user_thumbs_down"
    if "task:start" in categories:
        name = "task_start"
    elif "task:complete" in categories:
        name = "task_complete"
    elif "task:cancelled" in categories:
        name = "task_cancelled"

    result_value = 1.0 if positive else 0.0
    for cat in categories:
        if cat.startswith("stars:"):
            try:
                stars = int(cat.split(":")[1])
                result_value = stars / 5.0
            except (ValueError, IndexError):
                pass

    try:
        from snowflake.snowpark import Session

        connection_params = {
            "account": SNOWFLAKE_ACCOUNT,
            "user": "admin",
            "authenticator": "programmatic_access_token",
            "token": get_token(),
            "database": "AGENT_ROI_DEMO",
            "schema": "APP",
            "warehouse": "AGENT_ROI_WH",
            "role": "ACCOUNTADMIN",
        }
        session = Session.builder.configs(connection_params).create()

        categories_json = json.dumps(categories).replace("'", "''")
        message_escaped = feedback_message.replace("'", "''")

        sql = f"""
            INSERT INTO AGENT_ROI_DEMO.APP.AGENT_FEEDBACK
            (record_id, agent_slug, positive, feedback_name, result_value, categories, feedback_message)
            SELECT
                '{record_id}',
                'local-qa-agent',
                {str(positive).upper()},
                '{name}',
                {result_value},
                PARSE_JSON('{categories_json}'),
                '{message_escaped}'
        """
        session.sql(sql).collect()
        session.close()

        return {
            "status": "Feedback submitted successfully",
            "record_id": record_id,
            "name": name,
            "result": result_value,
        }
    except Exception as e:
        return {"error": f"Failed to submit feedback: {str(e)}"}, 500


@app.get("/health")
async def health():
    return {"status": "ok", "agent": APP_NAME, "version": APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
