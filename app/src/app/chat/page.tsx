'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TaskValue, TimeSaved, AgentConfig } from '@/types';
import { ThumbsUpForm } from '@/components/ThumbsUpForm';
import { ThumbsDownForm } from '@/components/ThumbsDownForm';
import { TaskCompleteForm } from '@/components/TaskCompleteForm';
import { getTaskState, startTask, endTask, isTaskStale } from '@/lib/task-state';
import { getElapsedTime } from '@/lib/task-state';

function VegaChart({ spec }: { spec: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!iframeRef.current) return;
    const html = `<!DOCTYPE html>
<html><head>
<script src="https://cdn.jsdelivr.net/npm/vega@5.25.0"></script>
<script src="https://cdn.jsdelivr.net/npm/vega-lite@5.16.3"></script>
<script src="https://cdn.jsdelivr.net/npm/vega-embed@6.22.2"></script>
<style>body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:transparent;} #chart{width:100%;display:block;}</style>
</head><body>
<div id="chart"></div>
<script>
try {
  const spec = ${spec};
  
  // Style to match app theme
  spec.width = "container";
  spec.height = 280;
  spec.background = "transparent";
  spec.config = spec.config || {};
  spec.config.font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  spec.config.title = { fontSize: 14, fontWeight: 600, color: "#2d2b28" };
  spec.config.axis = { 
    labelFontSize: 11, titleFontSize: 12, titleColor: "#5c554a", 
    labelColor: "#5c554a", gridColor: "#e8e0d4", domainColor: "#d4c9b8"
  };
  spec.config.legend = { labelFontSize: 11, titleFontSize: 12, labelColor: "#5c554a" };
  spec.config.mark = { color: "#d97706" };
  spec.config.bar = { color: "#d97706" };
  spec.config.range = { category: ["#d97706", "#b45309", "#92400e", "#78350f", "#8b7e6e", "#5c554a"] };
  
  // Add value labels to bar charts
  if (spec.mark === "bar" || (spec.mark && spec.mark.type === "bar")) {
    const origSpec = JSON.parse(JSON.stringify(spec));
    const quantField = origSpec.encoding.x && origSpec.encoding.x.type === "quantitative" 
      ? origSpec.encoding.x.field 
      : (origSpec.encoding.y && origSpec.encoding.y.type === "quantitative" ? origSpec.encoding.y.field : null);
    
    if (quantField) {
      const isHorizontal = origSpec.encoding.x && origSpec.encoding.x.type === "quantitative";
      spec.layer = [
        { mark: origSpec.mark, encoding: origSpec.encoding },
        { 
          mark: { type: "text", align: isHorizontal ? "left" : "center", 
                  dx: isHorizontal ? 4 : 0, dy: isHorizontal ? 0 : -8,
                  fontSize: 11, color: "#5c554a" },
          encoding: {
            ...origSpec.encoding,
            text: { field: quantField, type: "quantitative", format: ",.0f" }
          }
        }
      ];
      delete spec.mark;
      delete spec.encoding;
    }
  }
  
  vegaEmbed('#chart', spec, {actions: false, renderer: 'svg'})
    .then(result => {
      const h = document.querySelector('#chart svg')?.getBoundingClientRect().height || 300;
      if (window.frameElement) window.frameElement.style.height = (h + 8) + 'px';
    });
} catch(e) { document.body.innerHTML = '<p style="color:red;font-size:12px;">Chart error: ' + e.message + '</p>'; }
</script></body></html>`;
    iframeRef.current.srcdoc = html;
  }, [spec]);
  return <iframe ref={iframeRef} className="w-full rounded-md" style={{height: '320px', border: 'none', background: 'transparent'}} sandbox="allow-scripts allow-same-origin" title="Chart" />;
}

function MessageContent({ content }: { content: string }) {
  // Split content by chart markers [[CHART:...]]
  const parts = content.split(/\[\[CHART:([\s\S]*?)\]\]/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // Odd indices are chart specs
          return <VegaChart key={i} spec={part} />;
        }
        // Even indices are text - render as markdown
        if (!part.trim()) return null;
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{
            del: ({children}) => <span>~{children}~</span>,
          }}>{part}</ReactMarkdown>
        );
      })}
    </>
  );
}

function TaskTimer() {
  const [elapsed, setElapsed] = useState(getElapsedTime());
  useEffect(() => {
    const interval = setInterval(() => setElapsed(getElapsedTime()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <span className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{elapsed}</span>;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'task_card';
  content: string;
  thinking: string;
  requestId?: string;
  threadId?: number;
  feedback?: { positive: boolean; categories?: string[]; message?: string };
  isStreaming?: boolean;
  isThinking?: boolean;
  taskCompleted?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<number | undefined>(undefined);
  const [taskActive, setTaskActive] = useState(false);
  const [taskDescription, setTaskDescription] = useState<string | undefined>();
  const [showStalePrompt, setShowStalePrompt] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState<{ id: string; type: 'up' | 'down' } | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Agent selector state
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedAgentSlug') || '';
    }
    return '';
  });

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        const liveChatAgents = (data.agents || []).filter(
          (a: AgentConfig) => a.mode === 'live_chat' && a.is_active
        );
        setAgents(liveChatAgents);
        // If no selection yet, pick the default or first
        if (!selectedSlug && liveChatAgents.length > 0) {
          const defaultAgent = liveChatAgents.find((a: AgentConfig) => a.is_default) || liveChatAgents[0];
          setSelectedSlug(defaultAgent.slug);
          localStorage.setItem('selectedAgentSlug', defaultAgent.slug);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentChange = (slug: string) => {
    setSelectedSlug(slug);
    localStorage.setItem('selectedAgentSlug', slug);
    // Reset conversation when switching agents
    setMessages([]);
    setThreadId(undefined);
  };

  const insertTaskCard = () => {
    const card: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'task_card',
      content: '',
      thinking: '',
      taskCompleted: false,
    };
    setMessages((prev) => [...prev, card]);
  };

  useEffect(() => {
    const state = getTaskState();
    if (state.isActive) {
      setTaskActive(true);
      setTaskDescription(state.description);
      if (isTaskStale()) setShowStalePrompt(true);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      thinking: '',
      timestamp: new Date(),
    } as ChatMsg & { timestamp: Date };

    const assistantMessage: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      thinking: '',
      isStreaming: true,
      isThinking: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      const runUrl = selectedSlug ? `/api/agent/${selectedSlug}/run` : '/api/agent/run';
      // Build full conversation history for context
      const conversationHistory = messages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map((m) => ({ role: m.role, content: m.content }));
      conversationHistory.push({ role: 'user', content: input.trim() });

      const response = await fetch(runUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          ...(threadId && { thread_id: threadId }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${error}`, isStreaming: false, isThinking: false }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const requestId = response.headers.get('X-Snowflake-Request-ID') || '';
      let recordId = requestId; // May be overridden by response.metadata event

      // Set requestId on message immediately from header (for Cortex agents)
      if (requestId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, requestId } : m
          )
        );
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullThinking = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (currentEvent === 'done') continue;
            try {
              const data = JSON.parse(dataStr);

              // Thinking/reasoning content
              if (currentEvent === 'response.thinking.delta' && data.text) {
                fullThinking += data.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, thinking: fullThinking, isThinking: true }
                      : m
                  )
                );
              }

              // Status updates (planning, tool use, etc.) go into thinking
              if (currentEvent === 'response.status' && data.message) {
                fullThinking += `\n[${data.status}] ${data.message}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, thinking: fullThinking, isThinking: true }
                      : m
                  )
                );
              }

              // Final text content
              if (currentEvent === 'response.text.delta' && data.text) {
                fullContent += data.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: fullContent, isThinking: false }
                      : m
                  )
                );
              }

              // Chart event from Cortex Agent
              if (currentEvent === 'response.chart' && data.chart_spec) {
                fullContent += `\n\n[[CHART:${data.chart_spec}]]\n\n`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: fullContent, isThinking: false }
                      : m
                  )
                );
              }

              // Metadata event (record_id from external agents)
              if (currentEvent === 'response.metadata' && data.record_id) {
                recordId = data.record_id;
                // Update message requestId immediately so feedback buttons appear faster
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, requestId: data.record_id }
                      : m
                  )
                );
              }
            } catch {
              // skip malformed
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false, isThinking: false, requestId: recordId, threadId }
            : m
        )
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: `Network error: ${error}`, isStreaming: false, isThinking: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, threadId, selectedSlug]);

  const feedbackUrl = selectedSlug ? `/api/agent/${selectedSlug}/feedback` : '/api/agent/feedback';

  const submitFeedback = async (messageId: string, feedback: {
    positive: boolean;
    categories?: string[];
    message?: string;
  }) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.requestId) return;

    await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orig_request_id: msg.requestId,
        positive: feedback.positive,
        categories: feedback.categories || [],
        feedback_message: feedback.message || '',
        ...(threadId && { thread_id: threadId }),
      }),
    });

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, feedback } : m
      )
    );
    setExpandedFeedback(null);
  };

  const handleTaskStart = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const state = startTask(lastAssistant?.requestId, threadId);
    setTaskActive(true);
    setTaskDescription(state.description);

    await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orig_request_id: lastAssistant?.requestId || '',
        positive: true,
        categories: ['task:start'],
        feedback_message: '',
        ...(threadId && { thread_id: threadId }),
      }),
    });
  };

  const handleTaskComplete = async (cardId: string, data: {
    stars?: number;
    value?: TaskValue;
    timeSaved?: TimeSaved;
    automated?: boolean;
    comment?: string;
  }) => {
    const categories: string[] = ['task:complete'];
    if (data.stars) categories.push(`stars:${data.stars}`);
    if (data.value) categories.push(`value:${data.value}`);
    if (data.timeSaved) categories.push(`time_saved:${data.timeSaved}`);
    if (data.automated !== undefined) categories.push(`automated:${data.automated ? 'yes' : 'no'}`);

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

    await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orig_request_id: lastAssistant?.requestId || '',
        positive: true,
        categories,
        feedback_message: data.comment || '',
        ...(threadId && { thread_id: threadId }),
      }),
    });

    // Mark the card as completed
    setMessages((prev) =>
      prev.map((m) => m.id === cardId ? { ...m, taskCompleted: true } : m)
    );

    endTask();
    setTaskActive(false);
    setTaskDescription(undefined);
  };

  const handleTaskUndo = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

    await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orig_request_id: lastAssistant?.requestId || '',
        positive: true,
        categories: ['task:cancelled'],
        feedback_message: '',
        ...(threadId && { thread_id: threadId }),
      }),
    });

    endTask();
    setTaskActive(false);
    setTaskDescription(undefined);
    setShowStalePrompt(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Stale task recovery */}
      {showStalePrompt && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-amber-800">You have an open task from earlier.</span>
          <div className="flex gap-2">
            <button onClick={() => { setShowStalePrompt(false); insertTaskCard(); }} className="px-3 py-1 text-xs bg-amber-600 text-white rounded">Complete it</button>
            <button onClick={handleTaskUndo} className="px-3 py-1 text-xs text-amber-600 hover:text-amber-800">Cancel it</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-lg text-[var(--text-secondary)]">How can I help you today?</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">Select an agent above, then try one of these queries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto text-left">
                {[
                  { label: 'Revenue by region', q: 'What is the total revenue by region?' },
                  { label: 'Revenue chart', q: 'Show me a chart of revenue by market segment' },
                  { label: 'Top customers', q: 'Who are our top 10 customers by order count and what segments are they in?' },
                  { label: 'Monthly trends', q: 'Show me the monthly revenue trend with a chart' },
                  { label: 'Refund policy', q: 'What is our refund policy for international orders?' },
                  { label: 'Priority escalation', q: 'When can an order be escalated to urgent priority and what is the process?' },
                  { label: 'Regional comparison', q: 'Compare the average order value across regions and identify which region has the most high-priority orders' },
                  { label: 'Segment deep-dive', q: 'Break down revenue by market segment and order status, then explain which segments have the most open orders' },
                ].map(({ label, q }) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="px-3 py-2 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:border-[var(--border-strong)] transition-colors text-left"
                  >
                    <span className="font-medium text-[var(--foreground)]">{label}</span>
                    <br />
                    <span className="text-[var(--text-muted)]">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-[var(--user-bubble)] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] text-[var(--foreground)]">
                    {msg.content}
                  </div>
                </div>
              ) : msg.role === 'task_card' ? (
                <div className={`border rounded-xl p-4 ${msg.taskCompleted ? 'border-green-200 bg-green-50/50 opacity-75' : 'border-amber-200 bg-amber-50/30'}`}>
                  {msg.taskCompleted ? (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Task completed
                    </div>
                  ) : (
                    <TaskCompleteForm
                      onSubmit={(data) => handleTaskComplete(msg.id, data)}
                      onCancel={() => {
                        // Remove the card if cancelled
                        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Thinking section */}
                  {msg.thinking && (
                    <div>
                      {msg.isThinking && !msg.content ? (
                        // While thinking, show it expanded
                        <div className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-xs font-medium text-[var(--text-muted)]">Thinking...</span>
                          </div>
                          <pre className="text-xs text-[var(--text-muted)] whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                            {msg.thinking}
                          </pre>
                        </div>
                      ) : (
                        // After response arrives, collapse into toggleable section
                        <button
                          onClick={() => toggleThinking(msg.id)}
                          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${expandedThinking.has(msg.id) ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          View reasoning
                        </button>
                      )}
                      {expandedThinking.has(msg.id) && !msg.isThinking && (
                        <div className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 mt-1">
                          <pre className="text-xs text-[var(--text-muted)] whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                            {msg.thinking}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main response content */}
                  {(msg.content || (!msg.isThinking && msg.isStreaming)) && (
                    <div className="text-sm text-[var(--foreground)] leading-relaxed prose prose-sm prose-stone max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-strong:text-[var(--foreground)] prose-code:text-amber-800 prose-code:bg-amber-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
                      {msg.content ? (
                        <MessageContent content={msg.content} />
                      ) : (
                        <span className="text-[var(--text-muted)] animate-pulse">...</span>
                      )}
                    </div>
                  )}

                  {/* Feedback buttons */}
                  {msg.role === 'assistant' && !msg.isStreaming && msg.requestId && !msg.feedback && (
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => setExpandedFeedback({ id: msg.id, type: 'up' })}
                        className="p-1.5 rounded-md border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors"
                        title="Thumbs up"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                      </button>
                      <button
                        onClick={() => setExpandedFeedback({ id: msg.id, type: 'down' })}
                        className="p-1.5 rounded-md border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors"
                        title="Thumbs down"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 0011.057 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                      </button>
                    </div>
                  )}

                  {msg.feedback && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-2">
                      {msg.feedback.positive ? (
                        <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 0011.057 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                      )}
                      Feedback submitted
                    </div>
                  )}

                  {expandedFeedback?.id === msg.id && expandedFeedback.type === 'up' && (
                    <ThumbsUpForm
                      onSubmit={(stars, comment) => submitFeedback(msg.id, { positive: true, categories: stars ? [`stars:${stars}`] : [], message: comment })}
                      onCancel={() => submitFeedback(msg.id, { positive: true })}
                    />
                  )}

                  {expandedFeedback?.id === msg.id && expandedFeedback.type === 'down' && (
                    <ThumbsDownForm
                      onSubmit={(categories, comment) => submitFeedback(msg.id, { positive: false, categories, message: comment })}
                      onCancel={() => submitFeedback(msg.id, { positive: false })}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 relative">
        {/* Task in progress banner - floats above input */}
        {taskActive && !showStalePrompt && (
          <div className="absolute bottom-full left-0 right-0 px-4 pb-2">
            <div className="max-w-3xl mx-auto">
              <div className="bg-[var(--surface)] border border-amber-200 rounded-xl px-4 py-2 shadow-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm text-amber-800 font-medium">Task in progress</span>
                  <TaskTimer />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => insertTaskCard()} className="px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">Complete</button>
                  <button onClick={handleTaskUndo} className="text-xs text-amber-600 hover:text-red-600 transition-colors">Undo</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative bg-[var(--surface-secondary)] border border-[var(--border)] rounded-xl focus-within:border-[var(--border-strong)] focus-within:ring-1 focus-within:ring-[var(--border-strong)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Message..."
              className="w-full h-10 bg-transparent rounded-xl px-4 text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] focus:outline-none"
            />
            <div className="flex items-center gap-1.5 px-3 pb-2">
              {agents.length > 1 && (
                <select
                  value={selectedSlug}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  className="h-6 px-2 text-[11px] font-medium border border-amber-300 rounded-md bg-amber-50 text-amber-800 focus:outline-none hover:border-amber-400 hover:bg-amber-100 cursor-pointer max-w-[280px]"
                >
                  {agents.map((a) => (
                    <option key={a.slug} value={a.slug}>{a.name}</option>
                  ))}
                </select>
              )}
              {!taskActive && (
                <button
                  onClick={handleTaskStart}
                  className="h-6 px-2 text-[11px] font-medium border border-[var(--border)] rounded-md bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50 transition-colors whitespace-nowrap"
                >
                  Start Task ▶
                </button>
              )}
            </div>
          </div>
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="h-10 px-4 text-sm font-medium bg-[var(--foreground)] hover:bg-[var(--text-secondary)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] text-white rounded-xl transition-colors mb-2"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
