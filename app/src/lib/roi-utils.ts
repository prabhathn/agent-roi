// ROI calculation utilities

import type { TaskValue } from '@/types';

const VALUE_WEIGHTS: Record<TaskValue, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

/**
 * Calculate the weighted task value score.
 */
export function getTaskValueWeight(value: TaskValue): number {
  return VALUE_WEIGHTS[value] || 0;
}

/**
 * Calculate the composite ROI score.
 * ROI = (Positive Rate x (1 - Error Rate)) / Credits Per Request
 */
export function calculateROIScore(
  positiveRate: number | null,
  errorRate: number | null,
  creditsPerRequest: number | null
): number | null {
  if (positiveRate === null || errorRate === null || creditsPerRequest === null) return null;
  if (creditsPerRequest === 0) return null;

  return (positiveRate * (1 - errorRate)) / creditsPerRequest;
}

/**
 * Get the color for an ROI score.
 */
export function getROIColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score > 0.7) return 'text-green-500';
  if (score > 0.4) return 'text-amber-500';
  return 'text-red-500';
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format credit values.
 */
export function formatCredits(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(4);
}
