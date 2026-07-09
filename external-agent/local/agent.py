# agent.py - LangGraph agent with think/draft/refine reasoning steps
# Uses a local llama-server (Qwen 2.5 0.5B) via OpenAI-compatible API
# TruGraph instruments at graph-node level for step visibility

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

from config import LLAMA_SERVER_URL, LLAMA_MODEL


class AgentState(TypedDict):
    query: str
    thinking: str
    draft: str
    response: str


# Local LLM via llama-server OpenAI-compatible API
llm = ChatOpenAI(
    base_url=LLAMA_SERVER_URL,
    api_key="not-needed",
    model=LLAMA_MODEL,
    temperature=0.7,
    max_tokens=256,
)


def think_node(state: AgentState) -> AgentState:
    """Analyze the question and plan the response approach."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a thinking assistant. Analyze the following question briefly. Identify the key points to address. Keep your analysis to 2-3 sentences."),
        ("human", "{query}"),
    ])
    result = (prompt | llm).invoke({"query": state["query"]})
    return {"thinking": result.content}


def draft_node(state: AgentState) -> AgentState:
    """Write a draft answer based on the analysis."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Based on the analysis provided, write a clear and helpful answer to the question. Keep it concise."),
        ("human", "Question: {query}\n\nAnalysis: {thinking}\n\nWrite your answer:"),
    ])
    result = (prompt | llm).invoke({"query": state["query"], "thinking": state["thinking"]})
    return {"draft": result.content}


def refine_node(state: AgentState) -> AgentState:
    """Refine the draft into a polished final response."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Improve this draft answer. Make it well-structured, concise, and clear. Return only the final improved answer."),
        ("human", "Question: {query}\n\nDraft: {draft}\n\nImproved answer:"),
    ])
    result = (prompt | llm).invoke({"query": state["query"], "draft": state["draft"]})
    return {"response": result.content}


# Build the LangGraph
graph = StateGraph(AgentState)
graph.add_node("think", think_node)
graph.add_node("draft", draft_node)
graph.add_node("refine", refine_node)
graph.add_edge(START, "think")
graph.add_edge("think", "draft")
graph.add_edge("draft", "refine")
graph.add_edge("refine", END)

agent = graph.compile()
