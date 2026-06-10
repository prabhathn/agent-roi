# server.py - FastAPI server for the Knowledge RAG Agent
# Exposes POST /chat with SSE streaming and POST /feedback for TruLens human feedback

import json
import asyncio
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from config import get_tru_session, APP_NAME, APP_VERSION
from agent import KnowledgeRAGAgent

# Global references
tru_session = None
tru_agent = None
agent = None
# Store recent records for feedback linking (record_id -> Record object)
recent_records: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize TruLens and agent on startup."""
    global tru_session, tru_agent, agent

    print("Initializing TruLens session...")
    tru_session = get_tru_session()

    print("Creating agent...")
    agent = KnowledgeRAGAgent()

    # Wrap with TruApp for instrumentation (disable evaluator thread to avoid background errors)
    from trulens.apps.app import TruApp
    tru_agent = TruApp(
        agent,
        app_name=APP_NAME,
        app_version=APP_VERSION,
        start_evaluator=False,
    )

    print(f"Knowledge RAG Agent ready (model: {APP_NAME} {APP_VERSION})")
    print("Listening on http://localhost:8000")

    yield

    # Cleanup: flush any pending spans
    if tru_session:
        print("Flushing TruLens spans...")
        tru_session.force_flush()


app = FastAPI(title="Knowledge RAG Agent", lifespan=lifespan)


def chunk_text(text: str, chunk_size: int = 30) -> list[str]:
    """Split text into chunks for streaming simulation."""
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
    """Handle chat requests with SSE streaming response."""
    body = await request.json()
    messages = body.get("messages", [])

    # Extract the last user message
    query = ""
    for msg in reversed(messages):
        content = msg.get("content", "")
        if msg.get("role") == "user":
            if isinstance(content, list):
                # Handle array content format [{type: "text", text: "..."}]
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

        # Status: retrieving context
        yield f"event: response.status\ndata: {json.dumps({'message': 'Retrieving relevant documents', 'status': 'executing_tools', 'sequence_number': 0})}\n\n"

        # Run the instrumented agent
        try:
            with tru_agent as recording:
                result = agent(query)
        except Exception as e:
            yield f"event: response.text.delta\ndata: {json.dumps({'text': f'Error: {str(e)}'})}\n\n"
            yield "event: done\ndata: {}\n\n"
            return

        # Capture the TruLens record_id for feedback linking
        record_id = ""
        if recording.records:
            record = recording.records[0]
            record_id = record.record_id
            # Store for later feedback submission
            recent_records[record_id] = record
            # Keep only the last 100 records in memory
            if len(recent_records) > 100:
                oldest_key = next(iter(recent_records))
                del recent_records[oldest_key]
            # Use record_id as the request_id for this response
            request_id = record_id

        # Status: generating response
        yield f"event: response.status\ndata: {json.dumps({'message': 'Generating response', 'status': 'generating', 'sequence_number': 1})}\n\n"

        # Stream the response text in chunks
        chunks = chunk_text(result, 40)
        for chunk in chunks:
            yield f"event: response.text.delta\ndata: {json.dumps({'text': chunk})}\n\n"
            await asyncio.sleep(0.025)  # Small delay for streaming UX

        # Emit record_id as metadata so the client can link feedback
        if record_id:
            yield f"event: response.metadata\ndata: {json.dumps({'record_id': record_id})}\n\n"

        yield "event: done\ndata: {}\n\n"

        # Flush spans asynchronously after response
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
    """Accept human feedback and write it to the AGENT_FEEDBACK table in Snowflake."""
    body = await request.json()

    record_id = body.get("record_id") or body.get("orig_request_id")
    if not record_id:
        return {"error": "record_id is required"}, 400

    positive = body.get("positive", True)
    categories = body.get("categories", [])
    feedback_message = body.get("feedback_message", "")

    # Determine feedback name from categories
    name = "user_thumbs_up" if positive else "user_thumbs_down"
    if "task:start" in categories:
        name = "task_start"
    elif "task:complete" in categories:
        name = "task_complete"
    elif "task:cancelled" in categories:
        name = "task_cancelled"

    # Map to numeric result
    result_value = 1.0 if positive else 0.0
    for cat in categories:
        if cat.startswith("stars:"):
            try:
                stars = int(cat.split(":")[1])
                result_value = stars / 5.0
            except (ValueError, IndexError):
                pass

    try:
        # Write feedback directly to Snowflake table
        from config import get_snowpark_session
        session = get_snowpark_session()

        categories_json = json.dumps(categories).replace("'", "''")
        message_escaped = feedback_message.replace("'", "''")

        sql = f"""
            INSERT INTO AGENT_ROI_DEMO.APP.AGENT_FEEDBACK
            (record_id, agent_slug, positive, feedback_name, result_value, categories, feedback_message)
            SELECT
                '{record_id}',
                'knowledge-rag-agent',
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
    """Health check endpoint."""
    return {"status": "ok", "agent": APP_NAME, "version": APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
