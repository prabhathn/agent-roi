'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TraceChatProps {
  traceContext?: {
    traceId: string;
    duration: string;
    spanCount: number;
    tools: string[];
    hasError: boolean;
    hasReplan: boolean;
  };
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function TraceChat({ traceContext, onClose }: TraceChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const text = overrideInput || input.trim();
    if (!text || isStreaming) return;

    // Build the message with optional trace context
    let fullMessage = text;
    if (traceContext) {
      fullMessage = `[Context: The user is viewing trace ${traceContext.traceId} which took ${traceContext.duration}s, had ${traceContext.spanCount} spans, used tools: ${traceContext.tools.join(', ')}${traceContext.hasError ? ', has errors' : ''}${traceContext.hasReplan ? ', has replans' : ''}]\n\n${text}`;
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/agent/trace-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: fullMessage }] }),
      });

      if (!response.ok) {
        const error = await response.text();
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${error}`, isStreaming: false } : m)
        );
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
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
            if (currentEvent === 'done') continue;
            try {
              const data = JSON.parse(line.slice(6).trim());
              if (currentEvent === 'response.text.delta' && data.text) {
                fullContent += data.text;
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantMsg.id ? { ...m, content: fullContent } : m)
                );
              }
            } catch { /* skip */ }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${error}`, isStreaming: false } : m)
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, traceContext]);

  const suggestions = traceContext
    ? ['Why did this take so long?', 'Were there any issues with this trace?']
    : ['What is the average latency by tool?', 'Summarize negative feedback', 'How many errors in the last 7 days?'];

  return (
    <div className="flex flex-col h-full border-l border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h3 className="text-sm font-medium text-[var(--foreground)]">Trace Analyst</h3>
          {traceContext && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              Analyzing {traceContext.traceId.slice(0, 12)}...
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-muted)]">
              {traceContext ? 'Ask about this trace:' : 'Ask about agent performance:'}
            </p>
            <div className="space-y-1.5">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-2.5 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:border-[var(--border-strong)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-[var(--user-bubble)] rounded-xl px-3 py-1.5 text-xs max-w-[85%] text-[var(--foreground)]">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--foreground)] leading-relaxed prose prose-xs prose-stone max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:mt-2 prose-headings:mb-1 prose-code:text-[10px]">
                {msg.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : msg.isStreaming ? (
                  <span className="text-[var(--text-muted)] animate-pulse">Analyzing...</span>
                ) : null}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-3 py-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about traces..."
            className="flex-1 h-8 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 text-xs text-[var(--foreground)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="h-8 px-3 text-xs font-medium bg-[var(--foreground)] hover:bg-[var(--text-secondary)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] text-white rounded-lg transition-colors"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
