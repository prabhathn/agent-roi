'use client';

interface MetricCardProps {
  label: string;
  value: string;
  subvalue?: string;
  color?: string;
}

export function MetricCard({ label, value, subvalue, color }: MetricCardProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || 'text-white'}`}>{value}</div>
      {subvalue && <div className="text-xs text-gray-500 mt-1">{subvalue}</div>}
    </div>
  );
}
