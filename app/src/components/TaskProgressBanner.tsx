'use client';

import { useState, useEffect } from 'react';
import { getElapsedTime } from '@/lib/task-state';

interface TaskProgressBannerProps {
  description?: string;
  onComplete: () => void;
  onUndo: () => void;
}

export function TaskProgressBanner({ description, onComplete, onUndo }: TaskProgressBannerProps) {
  const [elapsed, setElapsed] = useState(getElapsedTime());

  useEffect(() => {
    const interval = setInterval(() => setElapsed(getElapsedTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-sm text-amber-800 font-medium">Task in progress</span>
        {description && <span className="text-xs text-amber-600 truncate max-w-[200px]">{description}</span>}
        <span className="text-xs font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{elapsed}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onComplete} className="px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">Complete Task</button>
        <button onClick={onUndo} className="text-xs text-amber-600 hover:text-red-600 transition-colors">Undo</button>
      </div>
    </div>
  );
}
