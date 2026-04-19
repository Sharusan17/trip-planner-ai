interface HolidayTypeOption {
  value: string;
  label: string;
  emoji: string;
  description: string;
}

const HOLIDAY_TYPES: HolidayTypeOption[] = [
  { value: 'beach',      label: 'Beach',       emoji: '🏖️', description: 'Sun, sea & sand' },
  { value: 'city',       label: 'City Break',  emoji: '🏙️', description: 'Culture & nightlife' },
  { value: 'adventure',  label: 'Adventure',   emoji: '🧗', description: 'Outdoors & thrills' },
  { value: 'family',     label: 'Family',      emoji: '👨‍👩‍👧', description: 'Kids & all ages' },
  { value: 'ski',        label: 'Ski',         emoji: '⛷️', description: 'Slopes & après' },
  { value: 'cruise',     label: 'Cruise',      emoji: '🚢', description: 'Ports & sea days' },
  { value: 'cultural',   label: 'Cultural',    emoji: '🏛️', description: 'History & food' },
  { value: 'road_trip',  label: 'Road Trip',   emoji: '🚗', description: 'Drive & explore' },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SetupStepHolidayType({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-faint">
        This helps us give you the right prompts and suggestions throughout the setup.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
