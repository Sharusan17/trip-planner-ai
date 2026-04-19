interface HolidayTypeOption {
  value: string;
  label: string;
  emoji: string;
  description: string;
}

const HOLIDAY_TYPES: HolidayTypeOption[] = [
  { value: 'family',      label: 'Family',       emoji: '👨‍👩‍👧', description: 'All ages welcome' },
  { value: 'couple',      label: 'Couple',        emoji: '💑',    description: 'Just the two of you' },
  { value: 'friends',     label: 'Friends',       emoji: '🎉',    description: 'Group getaway' },
  { value: 'celebration', label: 'Celebration',   emoji: '🥂',    description: 'Birthday, hen/stag, anniversary' },
  { value: 'business',    label: 'Business',      emoji: '💼',    description: 'Work trip or conference' },
  { value: 'solo',        label: 'Solo',          emoji: '🎓',    description: 'Flying solo' },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SetupStepHolidayType({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-faint">
        Who are you travelling with? We&rsquo;ll tailor prompts and tips to match your trip.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {HOLIDAY_TYPES.map((type) => {
          const selected = value === type.value;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange(type.value)}
              className={`
                rounded-xl border-2 p-4 text-left transition-all
                hover:border-navy/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-navy/30
                ${selected
                  ? 'border-navy bg-navy/5 shadow-sm'
                  : 'border-parchment-dark bg-white'}
              `}
            >
              <div className="text-3xl mb-2 leading-none">{type.emoji}</div>
              <div className={`font-display text-sm font-semibold ${selected ? 'text-navy' : 'text-ink'}`}>
                {type.label}
              </div>
              <div className="text-xs text-ink-faint mt-0.5">{type.description}</div>
              {selected && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-navy">
                  <span className="w-1.5 h-1.5 rounded-full bg-navy inline-block" />
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>
      {!value && (
        <p className="text-xs text-ink-faint text-center">Select one to continue, or click Continue to skip.</p>
      )}
    </div>
  );
}
