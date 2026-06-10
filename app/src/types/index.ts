// TypeScript types for the Agent ROI Demo

// --- Agent API Types ---

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRunRequest {
  messages: AgentMessage[];
  thread_id?: number;
}

export interface AgentSSEEvent {
  event: string;
  data: {
    delta?: { content: string };
    request_id?: string;
    thread_id?: number;
    [key: string]: unknown;
  };
}

// --- Feedback Types ---

export interface FeedbackRequest {
  orig_request_id?: string;
  positive: boolean;
  feedback_message?: string;
  categories?: string[];
  thread_id?: number;
}

export type FeedbackEventType =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'task_start'
  | 'task_complete'
  | 'task_cancelled';

export interface FeedbackCategories {
  positive: string[];
  negative: string[];
}

export const FEEDBACK_CATEGORIES: FeedbackCategories = {
  positive: ['stars:1', 'stars:2', 'stars:3', 'stars:4', 'stars:5'],
  negative: [
    'Wrong answer',
    'Incomplete',
    'Hallucination',
    'Too slow',
    'Wrong tool used',
    'Confusing',
  ],
};

export const TASK_VALUE_OPTIONS = ['Low', 'Medium', 'High', 'Critical'] as const;
export type TaskValue = (typeof TASK_VALUE_OPTIONS)[number];

export const TIME_SAVED_OPTIONS = [
  '< 5 min',
  '5-15 min',
  '15-30 min',
  '30-60 min',
  '1+ hour',
] as const;
export type TimeSaved = (typeof TIME_SAVED_OPTIONS)[number];

// --- Chat UI Types ---

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  requestId?: string;
  threadId?: number;
  feedback?: {
    positive: boolean;
    stars?: number;
    categories?: string[];
    message?: string;
  };
  timestamp: Date;
  isStreaming?: boolean;
}

// --- Task State Types ---

export interface TaskState {
  isActive: boolean;
  startedAt?: string; // ISO timestamp
  requestId?: string;
  threadId?: number;
  description?: string;
}

// --- Dashboard Types ---

export interface ROISummaryRow {
  day_bucket: string;
  total_requests: number;
  avg_latency_ms: number | null;
  total_spans: number;
  error_spans: number;
  replan_spans: number;
  thumbs_up: number;
  thumbs_down: number;
  tasks_completed: number;
  tasks_cancelled: number;
  tasks_started: number;
  total_credits: number;
  positive_rate: number | null;
  error_rate: number | null;
  credits_per_request: number | null;
  roi_score: number | null;
}

export interface SpanRow {
  trace_id: string;
  span_id: string;
  span_name: string;
  span_kind: string;
  tool_name: string | null;
  span_duration_ms: number;
  is_replan: boolean;
  has_error: boolean;
  error_message: string | null;
  start_timestamp: string;
  end_timestamp: string;
}

export interface TaskPairRow {
  thread_id: string;
  started_at: string;
  task_description: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  stars: number | null;
  task_value: string | null;
  time_saved: string | null;
  automated: string | null;
  completion_comment: string | null;
  task_status: string;
}

// --- Agent Registry Types ---

export interface AgentConfig {
  id: string;
  name: string;
  slug: string;
  agent_type: 'cortex_agent' | 'cortex_rest_api' | 'external_agent';
  mode: 'live_chat' | 'observability_only';
  sf_database: string | null;
  sf_schema: string | null;
  sf_agent_name: string | null;
  endpoint_url: string | null;
  endpoint_method: string;
  auth_type: string | null;
  auth_secret_key: string | null;
  obs_database: string | null;
  obs_schema: string | null;
  obs_agent_name: string | null;
  description: string | null;
  routing_description: string | null;
  is_default: boolean;
  is_active: boolean;
}
