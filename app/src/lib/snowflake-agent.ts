// Snowflake Cortex Agent REST API client
// Handles agent run (SSE streaming) and feedback submission

import { getSnowflakeBaseUrl, getAuthHeaders, getAgentPath } from './snowflake-auth';
import type { AgentMessage, FeedbackRequest } from '@/types';

interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (requestId: string, threadId?: number) => void;
  onError: (error: string) => void;
}

/**
 * Send a message to the agent and stream the response via SSE.
 * Returns the X-Snowflake-Request-ID for feedback correlation.
 */
export async function streamAgentResponse(
  messages: AgentMessage[],
  threadId: number | undefined,
  callbacks: StreamCallbacks
): Promise<void> {
  const url = `${getSnowflakeBaseUrl()}${getAgentPath()}:run`;

  const body: Record<string, unknown> = { messages };
  if (threadId) {
    body.thread_id = threadId;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(`Agent request failed: ${response.status} ${errorText}`);
      return;
    }

    const requestId = response.headers.get('X-Snowflake-Request-ID') || '';
    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let responseThreadId: number | undefined = threadId;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            callbacks.onComplete(requestId, responseThreadId);
            return;
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.delta?.content) {
              callbacks.onToken(data.delta.content);
            }
            if (data.thread_id) {
              responseThreadId = data.thread_id;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    callbacks.onComplete(requestId, responseThreadId);
  } catch (error) {
    callbacks.onError(`Network error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

/**
 * Submit feedback for an agent response.
 */
export async function submitFeedback(feedback: FeedbackRequest): Promise<boolean> {
  const url = `${getSnowflakeBaseUrl()}${getAgentPath()}:feedback`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(feedback),
    });

    return response.ok;
  } catch {
    return false;
  }
}
