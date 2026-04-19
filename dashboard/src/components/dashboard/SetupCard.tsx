import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useTrip } from '@/context/TripContext';
import { useSetupProgress } from '@/hooks/useSetupProgress';

/**
 * "Finish setting up your trip" card shown at the top of the dashboard for
 * organisers whenever any of the four onboarding sections (travellers,
 * accommodation, transport, activities) is still empty.
 *
 * Hides when:
 *  - viewer is not the organiser
 *  - all 4 sections are done
 *  - the organiser dismissed it for this trip (localStorage per trip id)
 */
export default function SetupCard() {
  const navigate = useNavigate();
  const { isOrganiser } = useTrip();
  const progress = useSetupProgress();

  if (!isOrganiser) return null;
  if (progress.allComplete) return null;
  if (progress.dismissed) return null;

  const { sectionsDone, totalSections } = progress;
  const pct = Math.round((sectionsDone / totalSections) * 100);

  return (
    <div className="vintage-card p-4 sm:p-5 relative overflow-hidden">
      <button
        type="button"
        onClick={progress.dismiss}
        aria-label="Dismiss setup card"
        className="absolute top-2 right-2 p-1.5 text-ink-faint hover:text-ink rounded-lg"
      >
        <X size={16} strokeWidth={2} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} strokeWidth={2} className="text-navy" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-ink">
            Finish setting up your trip
          </h3>
          <p className="text-sm text-ink-faint mt-0.5">
            Add your travellers, hotels, transport, and activities in one flow.
          </p>

          {/* Progress bar */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-ink-light">
              <span className="font-medium">
                {sectionsDone} of {totalSections} sections added
              </span>
              <span className="text-ink-faint">{pct}%</span>
            </div>
            <div className="progress-bar-track h-2">
              <div className="progress-bar-fill h-full" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Sections mini-legend */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
            <SectionChip label="Travellers" done={progress.travellersCount > 1} />
            <SectionChip label="Stays" done={progress.staysCount >= 1} />
            <SectionChip label="Transport" done={progress.transportCount >= 1} />
            <SectionChip label="Activities" done={progress.activitiesCount >= 1} />
          </div>

          <button
            type="button"
            onClick={() => navigate('/setup')}
            className="btn-primary mt-4 text-sm py-2 px-4"
          >
            Continue setup
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionChip({ label, done }: { label: string; done: boolean }) {
  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs
        ${done
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-parchment border-parchment-dark text-ink-faint'}
      `}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-ink-faint/40'}`}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
