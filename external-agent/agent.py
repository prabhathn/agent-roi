# agent.py - Knowledge RAG Agent
# Retrieves from KNOWLEDGE_DOCS table and generates answers using Cortex COMPLETE
# Instrumented with TruLens @instrument for observability span creation
# Adds custom OTEL span attributes for detailed trace visibility

from opentelemetry import trace
from trulens.core.instruments import instrument
from config import get_snowpark_session, CORTEX_MODEL


def set_span_attrs(attrs: dict):
    """Set attributes on the current active OTEL span."""
    span = trace.get_current_span()
    if span and span.is_recording():
        for k, v in attrs.items():
            if v is not None:
                span.set_attribute(k, str(v))


class KnowledgeRAGAgent:
    """Simple RAG agent that searches knowledge docs and generates answers."""

    def __init__(self):
        self._session = None

    @property
    def session(self):
        """Lazy-initialize Snowpark session."""
        if self._session is None:
            self._session = get_snowpark_session()
        return self._session

    @instrument
    def retrieve(self, query: str) -> str:
        """Search KNOWLEDGE_DOCS for relevant content.

        Returns concatenated content from top matching documents.
        """
        # Simple keyword search using ILIKE for demo purposes
        keywords = [w.strip() for w in query.split() if len(w.strip()) > 3]
        if not keywords:
            keywords = [query.strip()]

        # Build OR conditions for keyword matching
        conditions = " OR ".join(
            [f"CONTENT ILIKE '%{kw}%'" for kw in keywords[:5]]
        )

        sql = f"""
            SELECT TITLE, CONTENT
            FROM AGENT_ROI_DEMO.APP.KNOWLEDGE_DOCS
            WHERE {conditions}
            LIMIT 3
        """

        set_span_attrs({
            "query": query,
            "sql_query": sql.strip(),
            "table": "AGENT_ROI_DEMO.APP.KNOWLEDGE_DOCS",
        })

        try:
            result = self.session.sql(sql).collect()
            if not result:
                # Fallback: return first 3 docs
                fallback_sql = "SELECT TITLE, CONTENT FROM AGENT_ROI_DEMO.APP.KNOWLEDGE_DOCS LIMIT 3"
                result = self.session.sql(fallback_sql).collect()
                set_span_attrs({"sql_query": fallback_sql, "fallback": "true"})

            context_parts = []
            for row in result:
                context_parts.append(f"[{row['TITLE']}]\n{row['CONTENT']}")

            context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant documents found."

            set_span_attrs({
                "num_docs_retrieved": str(len(result)),
                "status": "success",
            })

            return context

        except Exception as e:
            set_span_attrs({"status": "error", "error_message": str(e)})
            return f"Error retrieving documents: {str(e)}"

    @instrument
    def generate(self, query: str, context: str) -> str:
        """Generate an answer using Cortex COMPLETE with retrieved context."""

        prompt = f"""You are a helpful assistant that answers questions based on the provided context documents.
Answer the user's question using ONLY the information from the context below.
If the context doesn't contain relevant information, say so.
Be concise and direct.

Context:
{context}

User Question: {query}

Answer:"""

        sql = f"""
            SELECT SNOWFLAKE.CORTEX.COMPLETE(
                '{CORTEX_MODEL}',
                '{prompt.replace("'", "''")}'
            ) AS response
        """

        set_span_attrs({
            "query": query,
            "model": CORTEX_MODEL,
            "sql_query": sql.strip(),
            "context_length": str(len(context)),
        })

        try:
            result = self.session.sql(sql).collect()
            if result and result[0]["RESPONSE"]:
                response = result[0]["RESPONSE"].strip()
                set_span_attrs({
                    "status": "success",
                    "response_length": str(len(response)),
                })
                return response
            set_span_attrs({"status": "empty_response"})
            return "I was unable to generate a response."
        except Exception as e:
            set_span_attrs({"status": "error", "error_message": str(e)})
            return f"Error generating response: {str(e)}"

    @instrument
    def __call__(self, query: str) -> str:
        """Run the full RAG pipeline: retrieve then generate."""
        set_span_attrs({"query": query})
        context = self.retrieve(query)
        response = self.generate(query, context)
        return response
