'use client';

import { useState } from 'react';

interface ThumbsUpFormProps {
  onSubmit: (stars: number | undefined, comment: string) => void;
  onCancel: () => void;
}

export function ThumbsUpForm({ onSubmit, onCancel }: ThumbsUpFormProps) {
  const [stars, setStars] = useState<number | undefined>(undefined);
  const [comment, setComment] = useState('');

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mt-2 space-y-3 shadow-sm">
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">How useful was this answer?</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setStars(n)}
              className={`text-xl transition-colors ${
                stars && n <= stars ? 'text-amber-500' : 'text-[var(--border-strong)] hover:text-amber-400'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment..."
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--border-strong)]"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(stars, comment)} className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">Submit</button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">Skip</button>
      </div>
    </div>
  );
}
