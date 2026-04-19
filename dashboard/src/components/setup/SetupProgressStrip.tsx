import { Check } from 'lucide-react';

interface SetupProgressStripProps {
  step: number; // 0-indexed current step
  stepLabels: string[];
  doneFlags: boolean[]; // same length as stepLabels
  onStepClick?: (idx: number) => void;
}

export default function SetupProgressStrip({
  step,
  stepLabels,
  doneFlags,
  onStepClick,
}: SetupProgressStripProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1">
      {stepLabels.map((label, i) => {
        const isActive = i === step;
        const isDone = doneFlags[i];
        const clickable = !!onStepClick;
        return (
          <div key={label} className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(i)}
              className={`flex items-center gap-2 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-colors flex-shrink-0
                  ${isActive
                    ? 'bg-navy text-white'
                    : isDone
                    ? 'bg-emerald-500 text-white'
                    : 'bg-parchment-dark text-ink-faint'}
                `}
              >
                {isDone ? <Check size={16} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`
                  font-display text-sm whitespace-nowrap hidden sm:inline
                  ${isActive ? 'text-ink font-semibold' : 'text-ink-faint'}
                `}
              >
                {label}
              </span>
            </button>
            {i < stepLabels.length - 1 && (
              <span
                className={`h-px w-4 sm:w-8 ${isDone ? 'bg-emerald-400' : 'bg-parchment-dark'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
