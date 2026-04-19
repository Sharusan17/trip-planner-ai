import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { useTrip } from '@/context/TripContext';
import { useSetupProgress } from '@/hooks/useSetupProgress';
import SetupProgressStrip from '@/components/setup/SetupProgressStrip';
import SetupStepHolidayType from '@/components/setup/SetupStepHolidayType';
import SetupStepTravellers from '@/components/setup/SetupStepTravellers';
import SetupStepAccommodation from '@/components/setup/SetupStepAccommodation';
import SetupStepTransport from '@/components/setup/SetupStepTransport';
import SetupStepActivities from '@/components/setup/SetupStepActivities';

const STEP_LABELS = ['Holiday Type', 'Travellers', 'Accommodation', 'Transport', 'Activities'];
const STEP_DESCRIPTIONS = [
  "Tell us what kind of trip this is — we'll tailor tips and suggestions to match.",
  'Add everyone in your group. You can always edit these later.',
  'Enter your hotels and stays — dates, cost, and who they cover.',
  'Add flights, trains, and any other transport bookings.',
  'Sketch out activities for each day — high level is fine.',
];

export default function TripSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTrip, isOrganiser } = useTrip();
  const progress = useSetupProgress();

  const [holidayType, setHolidayType] = useState<string>('');

  // Determine the starting step.
  // For a brand new trip (sectionsDone === 0, no stays/transport/activities), start at step 0.
  // For a returning organiser, skip step 0 and resume at the first incomplete content step.
  const initialStep = useMemo(() => {
    const q = new URLSearchParams(location.search).get('step');
    const parsed = q ? parseInt(q, 10) : NaN;
    if (!isNaN(parsed) && parsed >= 0 && parsed < STEP_LABELS.length) return parsed;
    // If all content sections are untouched → new trip → step 0
    if (progress.sectionsDone === 0) return 0;
    // Otherwise resume at first incomplete content step (offset by 1 for holiday type step)
    return progress.firstIncompleteStep + 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<number>(initialStep);

  if (!currentTrip) return null;
  if (!isOrganiser) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const doneFlags = [
    holidayType !== '',               // step 0: holiday type selected
    progress.travellersCount > 1,     // step 1: travellers
    progress.staysCount >= 1,         // step 2: accommodation
    progress.transportCount >= 1,     // step 3: transport
    progress.activitiesCount >= 1,    // step 4: activities
  ];

  const goNext = () => {
    // Auto-set a default holiday type if the user skipped step 0
    if (step === 0 && !holidayType) setHolidayType('general');
    if (step < STEP_LABELS.length - 1) setStep(step + 1);
    else navigate('/dashboard');
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">Set up your trip</h1>
          <p className="text-sm text-ink-faint mt-0.5">
            Pour in everything you&rsquo;ve already booked. Each row saves automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="btn-secondary text-sm py-2 px-3 flex-shrink-0 flex items-center gap-1.5"
        >
          <SkipForward size={14} strokeWidth={2} />
          <span className="hidden sm:inline">Skip to dashboard</span>
          <span className="sm:hidden">Skip</span>
        </button>
      </div>

      {/* Progress strip */}
      <div className="vintage-card p-4">
        <SetupProgressStrip
          step={step}
          stepLabels={STEP_LABELS}
          doneFlags={doneFlags}
          onStepClick={setStep}
        />
      </div>

      {/* Step body */}
      <div className="vintage-card p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Step {step + 1}: {STEP_LABELS[step]}
          </h2>
          <p className="text-sm text-ink-faint mt-0.5">{STEP_DESCRIPTIONS[step]}</p>
        </div>

        {step === 0 && (
          <SetupStepHolidayType value={holidayType} onChange={setHolidayType} />
        )}
        {step === 1 && (
          <SetupStepTravellers tripId={currentTrip.id} holidayType={holidayType} />
        )}
        {step === 2 && (
          <SetupStepAccommodation
            tripId={currentTrip.id}
            homeCurrency={currentTrip.home_currency}
            holidayType={holidayType}
          />
        )}
        {step === 3 && (
          <SetupStepTransport
            tripId={currentTrip.id}
            homeCurrency={currentTrip.home_currency}
            holidayType={holidayType}
          />
        )}
        {step === 4 && (
          <SetupStepActivities
            tripId={currentTrip.id}
            startDate={currentTrip.start_date}
            endDate={currentTrip.end_date}
            holidayType={holidayType}
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="btn-secondary flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} strokeWidth={2} /> Back
        </button>
        <button type="button" onClick={goNext} className="btn-primary flex items-center gap-1.5">
          {step < STEP_LABELS.length - 1 ? (
            <>Continue <ChevronRight size={16} strokeWidth={2} /></>
          ) : (
            <>Finish &amp; go to dashboard</>
          )}
        </button>
      </div>
    </div>
  );
}
