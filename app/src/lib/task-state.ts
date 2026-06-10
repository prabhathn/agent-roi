// Task state management with localStorage persistence
// Handles the task start/complete/cancel lifecycle

import type { TaskState } from '@/types';

const TASK_STATE_KEY = 'agent_roi_task_state';
const STALE_THRESHOLD_HOURS = 4;

/**
 * Get the current task state from localStorage.
 */
export function getTaskState(): TaskState {
  if (typeof window === 'undefined') {
    return { isActive: false };
  }
  const stored = localStorage.getItem(TASK_STATE_KEY);
  if (!stored) return { isActive: false };

  try {
    return JSON.parse(stored) as TaskState;
  } catch {
    return { isActive: false };
  }
}

/**
 * Save task state to localStorage.
 */
export function setTaskState(state: TaskState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASK_STATE_KEY, JSON.stringify(state));
}

/**
 * Start a new task.
 */
export function startTask(requestId?: string, threadId?: number, description?: string): TaskState {
  const state: TaskState = {
    isActive: true,
    startedAt: new Date().toISOString(),
    requestId,
    threadId,
    description,
  };
  setTaskState(state);
  return state;
}

/**
 * Complete or cancel the current task.
 */
export function endTask(): TaskState {
  const state: TaskState = { isActive: false };
  setTaskState(state);
  return state;
}

/**
 * Check if the current task is stale (>4 hours old).
 */
export function isTaskStale(): boolean {
  const state = getTaskState();
  if (!state.isActive || !state.startedAt) return false;

  const startedAt = new Date(state.startedAt);
  const hoursElapsed = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);
  return hoursElapsed > STALE_THRESHOLD_HOURS;
}

/**
 * Get elapsed time since task start in formatted string.
 */
export function getElapsedTime(): string {
  const state = getTaskState();
  if (!state.isActive || !state.startedAt) return '00:00';

  const elapsed = Date.now() - new Date(state.startedAt).getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
