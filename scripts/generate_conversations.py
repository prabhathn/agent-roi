#!/usr/bin/env python3
"""Generate 100 conversations across all agents with random feedback."""

import requests
import json
import random
import time
import sys

# Agent endpoints
AGENTS = [
    {
        "name": "Sales & Policy Agent",
        "slug": "roi-demo-agent",
        "url": "http://localhost:3000/api/agent/roi-demo-agent/run",
        "feedback_url": "http://localhost:3000/api/agent/roi-demo-agent/feedback",
        "questions": [
            "What is the total revenue by region?",
            "Which market segment generates the most revenue?",
            "What are the top 5 customers by order count?",
            "What is our refund policy?",
            "How do I contact customer support?",
            "What are the shipping options?",
            "Show me revenue trends by quarter",
            "What is the average order value?",
            "Which nations have the most customers?",
            "What is the return policy for defective items?",
            "How many orders were placed last month?",
            "What regions have the highest growth?",
            "What is the cancellation policy?",
            "How do I escalate a complaint?",
            "What payment methods do you accept?",
            "What is the warranty period?",
            "How do I track my order?",
            "What are the bulk discount tiers?",
            "How long does standard shipping take?",
            "What is the SLA for priority support?",
        ],
    },
    {
        "name": "Trace Analyst",
        "slug": "trace-analyst",
        "url": "http://localhost:3000/api/agent/trace-analyst/run",
        "feedback_url": "http://localhost:3000/api/agent/trace-analyst/feedback",
        "questions": [
            "What is the average latency per tool?",
            "How many errors occurred in the last 7 days?",
            "Which tool is used most frequently?",
            "What is the replan rate?",
            "Show me the slowest traces",
            "How many traces have errors?",
            "What is the average response generation time?",
            "How many planning steps per trace on average?",
            "What percentage of traces use the search tool?",
            "What is the p95 latency?",
        ],
    },
    {
        "name": "Knowledge RAG Agent",
        "slug": "knowledge-rag-agent",
        "url": "http://localhost:3000/api/agent/knowledge-rag-agent/run",
        "feedback_url": "http://localhost:3000/api/agent/knowledge-rag-agent/feedback",
        "questions": [
            "What is the refund policy?",
            "How do I return a product?",
            "What is the shipping policy?",
            "How do I contact support?",
            "What are the business hours?",
            "What is the exchange policy?",
            "How do I cancel an order?",
            "What is the warranty coverage?",
            "How do I file a complaint?",
            "What are the payment options?",
            "How long does processing take?",
            "What is the privacy policy?",
            "How do I update my account?",
            "What are the bulk order terms?",
            "How do I get a price match?",
        ],
    },
]

# Feedback categories
POSITIVE_CATEGORIES = [
    ["stars:5"],
    ["stars:4"],
    ["stars:5"],
    ["stars:3"],
    ["stars:4"],
]

NEGATIVE_CATEGORIES = [
    ["Wrong answer"],
    ["Incomplete"],
    ["Too slow"],
    ["Confusing"],
    ["Hallucination"],
]

TASK_CATEGORIES = [
    ["task:start"],
    ["task:complete", "stars:4", "value:Medium", "time_saved:5-15 min", "automated:yes"],
    ["task:complete", "stars:5", "value:High", "time_saved:15-30 min", "automated:yes"],
    ["task:complete", "stars:3", "value:Low", "time_saved:< 5 min", "automated:no"],
]


def send_message(agent, question):
    """Send a message to an agent and return the request ID."""
    try:
        resp = requests.post(
            agent["url"],
            json={"messages": [{"role": "user", "content": question}]},
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=60,
        )
        
        request_id = resp.headers.get("X-Snowflake-Request-ID", "")
        record_id = None
        
        # Consume the stream to complete the request
        for line in resp.iter_lines(decode_unicode=True):
            if line and line.startswith("data: ") and "record_id" in line:
                try:
                    data = json.loads(line[6:])
                    record_id = data.get("record_id")
                except:
                    pass
        
        return record_id or request_id
    except Exception as e:
        print(f"  ERROR sending message: {e}")
        return None


def send_feedback(agent, request_id, positive, categories, message=""):
    """Send feedback for a conversation."""
    try:
        resp = requests.post(
            agent["feedback_url"],
            json={
                "orig_request_id": request_id,
                "record_id": request_id,
                "positive": positive,
                "categories": categories,
                "feedback_message": message,
            },
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"  ERROR sending feedback: {e}")
        return False


def main():
    total = 100
    # Distribution: 50 Sales, 20 Trace, 30 Knowledge RAG
    distribution = [
        (AGENTS[0], 50),
        (AGENTS[1], 20),
        (AGENTS[2], 30),
    ]
    
    conversations = []
    for agent, count in distribution:
        for i in range(count):
            question = random.choice(agent["questions"])
            conversations.append((agent, question))
    
    random.shuffle(conversations)
    
    print(f"Starting {total} conversations across {len(AGENTS)} agents...")
    print(f"  Sales & Policy: 50, Trace Analyst: 20, Knowledge RAG: 30")
    print()
    
    success = 0
    feedback_count = 0
    
    for i, (agent, question) in enumerate(conversations):
        print(f"[{i+1}/{total}] {agent['name']}: {question[:50]}...", end=" ", flush=True)
        
        request_id = send_message(agent, question)
        if not request_id:
            print("FAILED")
            continue
        
        success += 1
        print(f"OK ({request_id[:12]}...)", end="")
        
        # Randomly provide feedback (70% of the time)
        if random.random() < 0.7:
            # Decide feedback type
            roll = random.random()
            if roll < 0.55:  # 55% positive
                cats = random.choice(POSITIVE_CATEGORIES)
                messages = ["Great!", "Very helpful", "Exactly what I needed", "Good answer", ""]
                ok = send_feedback(agent, request_id, True, cats, random.choice(messages))
            elif roll < 0.80:  # 25% negative
                cats = random.choice(NEGATIVE_CATEGORIES)
                messages = ["Not what I expected", "Could be better", "Missing details", ""]
                ok = send_feedback(agent, request_id, False, cats, random.choice(messages))
            else:  # 20% task feedback
                cats = random.choice(TASK_CATEGORIES)
                ok = send_feedback(agent, request_id, True, cats, "")
            
            if ok:
                feedback_count += 1
                print(f" +fb", end="")
        
        print()
        
        # Small delay to avoid overwhelming
        time.sleep(0.5)
    
    print(f"\nDone! {success}/{total} conversations successful, {feedback_count} feedback submitted.")


if __name__ == "__main__":
    main()
