'use client';

import { useState } from 'react';
import { TASK_VALUE_OPTIONS, TIME_SAVED_OPTIONS } from '@/types';
import type { TaskValue, TimeSaved } from '@/types';

interface TaskCompleteFormProps {
  onSubmit: (data: {
    stars?: number;
    value?: TaskValue;
    timeSaved?: TimeSaved;
    automated?: boolean;
    comment?: string;
  }) => void;
  onCancel: () => void;
}

export function TaskCompleteForm({ onSubmit, onCancel }: TaskCompleteFormProps) {
  const [stars, setStars] = useState<number | undefined>(undefined);
  const [value, setValue] = useState<TaskValue | undefined>(undefined);
  const [timeSaved, setTimeSaved] = useState<TimeSaved | undefined>(undefined);
  const [automated, setAutomated] = useState<boolean | undefined>(undefined);
  const [comment, setComment] = useState('');

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Complete Task</h3>

      {/* Star Rating */}
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">How useful was the agent for this task?</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setStars(n)} className={`text-xl transition-colors ${stars && n <= stars ? 'text-amber-500' : 'text-[var(--border-strong)] hover:text-amber-400'}`}>★</button>
          ))}
        </div>
      </div>

      {/* Value of Outcome */}
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1.5">Value of outcome</label>
        <div className="flex gap-1.5">
          {TASK_VALUE_OPTIONS.map((v) => (
            <button key={v} onClick={() => setValue(v)} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${value === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* Time Saved */}
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1.5">Time saved</label>
        <div className="flex flex-wrap gap-1.5">
          {TIME_SAVED_OPTIONS.map((t) => (
            <button key={t} onClick={() => setTimeSaved(t)} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${timeSaved === t ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Fully Automated */}
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1.5">Did this fully automate the task?</label>
        <div className="flex gap-2">
          <button onClick={() => setAutomated(true)} className={`px-3 py-1 text-xs rounded-full border transition-colors ${automated === true ? 'border-green-400 bg-green-50 text-green-700' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}>Yes - fully automated</button>
          <button onClick={() => setAutomated(false)} className={`px-3 py-1 text-xs rounded-full border transition-colors ${automated === false ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}>No - still manual work</button>
        </div>
      </div>

      {/* Comment */}
      <div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment..." className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--border-strong)]" rows={2} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => onSubmit({ stars, value, timeSaved, automated, comment })} className="px-4 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">Complete Task</button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">Cancel</button>
      </div>
    </div>
  );
}
