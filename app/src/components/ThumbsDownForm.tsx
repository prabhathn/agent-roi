'use client';

import { useState } from 'react';

const NEGATIVE_CATEGORIES = [
  'Wrong answer',
  'Incomplete',
  'Hallucination',
  'Too slow',
  'Wrong tool used',
  'Confusing',
];

interface ThumbsDownFormProps {
  onSubmit: (categories: string[], comment: string) => void;
  onCancel: () => void;
}

export function ThumbsDownForm({ onSubmit, onCancel }: ThumbsDownFormProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');

  const toggle = (cat: string) => {
    const next = new Set(selected);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setSelected(next);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mt-2 space-y-3 shadow-sm">
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1.5">What went wrong?</label>
        <div className="flex flex-wrap gap-1.5">
          {NEGATIVE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggle(cat)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selected.has(cat)
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more (optional)..."
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--border-strong)]"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(Array.from(selected), comment)} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">Submit</button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">Skip</button>
      </div>
    </div>
  );
}
