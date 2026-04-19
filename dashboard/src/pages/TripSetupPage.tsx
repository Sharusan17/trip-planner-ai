import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { useTrip } from '@/context/TripContext';
import { useSetupProgress } from '@/hooks/useSetupProgress';
import SetupProgressStrip from '@/components/setup/SetupProgressStrip';
import SetupStepTravellers from '@/components/setup/SetupStepTravellers';
import SetupStepAccommodation from '@/components/setup/SetupStepAccommodation';
import SetupStepTransport from '@/components/setup/SetupStepTransport';
import SetupStepActivities from '@/components/setup/SetupStepActivities';

const STEP_LABELS = ['Travellers', 'Accommodation', 'Transport', 'Activities'];
const STEP_DESCRIPTIONS = [
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

  // Start at the first incomplete step, unless a ?step= override is present
  const initialStep = useMemo(() => {
    const q = new URLSearchParams(location.search).get('step');
    const parsed = q ? parseInt(q, 10) : NaN;
    if (!isNaN(parsed) && parsed >= 0 && parsed < STEP_LABELS.length) return parsed;
    return progress.firstIncompleteStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<number>(initialStep);

  if (!currentTrip) return null;
  if (!isOrganiser) {
    // Members shouldn't see the wizard — bounce them to the dashboard
    navigate('/dashboard', { replace: true });
    return null;
  }

  const doneFlags = [
    progress.travellersCount > 1,
    progress.staysCount >= 1,
    progress.transportCount >= 1,
    progress.activitiesCount >= 1,
  ];

  const goNext = () => {
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

        {step === 0 && <SetupStepTravellers tripId={currentTrip.id} />}
        {step === 1 && <SetupStepAccommodation tripId={currentTrip.id} homeCurrency={currentTrip.home_currency} />}
        {step === 2 && <SetupStepTransport tripId={currentTrip.id} homeCurrency={currentTrip.home_currency} />}
        {step === 3 && (
          <SetupStepActivities
            tripId={currentTrip.id}
            startDate={currentTrip.start_date}
            endDate={currentTrip.end_date}
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
