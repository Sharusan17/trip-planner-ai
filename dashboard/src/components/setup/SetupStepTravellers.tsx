import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Crown, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { travellersApi } from '@/api/travellers';
import { familiesApi } from '@/api/families';
import type { CreateTravellerInput, TravellerType } from '@trip-planner-ai/shared';
import SetupTip from './SetupTip';

const AVATAR_COLOURS = [
  '#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A',
  '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574',
];

const TIPS: Record<string, string> = {
  family:      "Add all the kids — they'll be on the trip too!",
  couple:      'Just the two of you? Add both names so costs split equally.',
  friends:     'Add everyone in the group — each person gets their own colour for tracking costs.',
  celebration: "Don't forget the guest of honour! Add all attendees, including any latecomers.",
  business:    'Add each attendee so expenses can be tracked and split per person.',
  solo:        'Just add yourself — you can still add a contact for reference if needed.',
};

function getTip(holidayType: string) {
  return TIPS[holidayType];
}

interface Draft {
  name: string;
  type: TravellerType;
  colour: string;
}

interface FamilyDraft {
  name: string;
  colour: string;
  lead_traveller_id: string;
  member_ids: string[];
}

const FAMILY_COLOURS = [
  '#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A',
  '#9A7B2F', '#6B8E7B', '#8B6FAE',
];

interface Props {
  tripId: string;
  holidayType: string;
}

export default function SetupStepTravellers({ tripId, holidayType }: Props) {
  const qc = useQueryClient();
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', tripId],
    queryFn: () => travellersApi.list(tripId),
  });
  const { data: families = [] } = useQuery({
    queryKey: ['families', tripId],
    queryFn: () => familiesApi.list(tripId),
  });

  const getNextColour = () => {
    const usedColours = new Set(travellers.map((t) => t.avatar_colour));
    return AVATAR_COLOURS.find((c) => !usedColours.has(c)) ?? AVATAR_COLOURS[travellers.length % AVATAR_COLOURS.length];
  };

  const [draft, setDraft] = useState<Draft>({ name: '', type: 'adult', colour: getNextColour() });
  const [rowError, setRowError] = useState<string | null>(null);

  // Family form state
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyDraft, setFamilyDraft] = useState<FamilyDraft>({
    name: '', colour: FAMILY_COLOURS[0], lead_traveller_id: '', member_ids: [],
  });
  const [familyError, setFamilyError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateTravellerInput) => travellersApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travellers', tripId] });
      setRowError(null);
    },
    onError: (err: Error) => setRowError(err.message || 'Failed to add traveller'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => travellersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travellers', tripId] });
      qc.invalidateQueries({ queryKey: ['families', tripId] });
    },
  });

  const createFamilyMutation = useMutation({
    mutationFn: (data: { name: string; colour: string; lead_traveller_id: string; member_ids: string[] }) =>
      familiesApi.create(tripId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families', tripId] });
      qc.invalidateQueries({ queryKey: ['travellers', tripId] });
      setFamilyDraft({ name: '', colour: FAMILY_COLOURS[0], lead_traveller_id: '', member_ids: [] });
      setShowFamilyForm(false);
      setFamilyError(null);
    },
    onError: (err: Error) => setFamilyError(err.message || 'Failed to create family'),
  });

  const deleteFamilyMutation = useMutation({
    mutationFn: (id: string) => familiesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families', tripId] });
      qc.invalidateQueries({ queryKey: ['travellers', tripId] });
    },
  });

  const saveDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    createMutation.mutate({
      name,
      type: draft.type,
      role: 'member',
      avatar_colour: draft.colour,
      cost_split_weight: 1.0,
    });
    const usedAfter = new Set([...travellers.map((t) => t.avatar_colour), draft.colour]);
    const nextColour = AVATAR_COLOURS.find((c) => !usedAfter.has(c)) ?? AVATAR_COLOURS[(travellers.length + 1) % AVATAR_COLOURS.length];
    setDraft({ name: '', type: 'adult', colour: nextColour });
  };

  const toggleFamilyMember = (id: string) => {
    setFamilyDraft((d) => {
      const has = d.member_ids.includes(id);
      const member_ids = has ? d.member_ids.filter((x) => x !== id) : [...d.member_ids, id];
      // Lead must always be a member
      const lead_traveller_id = member_ids.includes(d.lead_traveller_id) ? d.lead_traveller_id : '';
      return { ...d, member_ids, lead_traveller_id };
    });
  };

  const saveFamily = () => {
    if (!familyDraft.name.trim()) { setFamilyError('Family name is required'); return; }
    if (familyDraft.member_ids.length < 2) { setFamilyError('Add at least 2 members'); return; }
    if (!familyDraft.lead_traveller_id) { setFamilyError('Select a lead traveller'); return; }
    createFamilyMutation.mutate(familyDraft);
  };

  // Members already in a family (can't be in two families)
  const assignedMemberIds = new Set(families.flatMap((f) => f.members.map((m: any) => m.id)));

  // Travellers eligible to add as new family members
  const eligibleTravellers = travellers.filter(
    (t) => !assignedMemberIds.has(t.id)
  );

  return (
    <div className="space-y-3">
      <SetupTip tip={getTip(holidayType)} />

      {/* Existing travellers */}
      {travellers.length > 0 && (
        <div className="space-y-2">
          {travellers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                style={{ backgroundColor: t.avatar_colour }}
              >
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-semibold text-ink truncate">{t.name}</div>
                <div className="text-xs text-ink-faint capitalize">
                  {t.type} &middot; {t.role}
                </div>
              </div>
              {t.role !== 'organiser' && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove ${t.name}?`)) deleteMutation.mutate(t.id);
                  }}
                  className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                  aria-label={`Remove ${t.name}`}
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Draft row */}
      <div className="p-3 rounded-xl border-2 border-dashed border-parchment-dark bg-parchment/30 space-y-2.5">
        {/* Row 1: colour circle + name input */}
        <div className="flex gap-2 items-center">
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
            style={{ backgroundColor: draft.colour }}
          />
          <input
            className="vintage-input flex-1"
            placeholder="Name (e.g. Alex, Sarah…)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveDraft()}
            autoComplete="off"
          />
        </div>
        {/* Row 2: type select + add button — indented to align under the name input */}
        <div className="flex gap-2 items-center pl-11">
          <select
            className="vintage-input text-sm flex-1"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as TravellerType })}
          >
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="infant">Infant</option>
          </select>
          <button
            type="button"
            onClick={saveDraft}
            disabled={!draft.name.trim() || createMutation.isPending}
            className="btn-primary flex items-center gap-1.5 px-4 disabled:opacity-50 flex-shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} /> Add
          </button>
        </div>
        {/* Colour picker */}
        <div className="flex flex-wrap gap-1.5 pl-11">
          {AVATAR_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDraft({ ...draft, colour: c })}
              className={`w-6 h-6 rounded-full border-2 transition-all ${draft.colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {rowError && <p className="text-xs text-terracotta">{rowError}</p>}

      <p className="text-xs text-ink-faint">
        {travellers.length} {travellers.length === 1 ? 'person' : 'people'} added
      </p>

      {/* ── Families section ── */}
      {travellers.length >= 2 && (
        <div className="pt-2 border-t border-parchment-dark space-y-2">
          {/* Existing families */}
          {families.length > 0 && (
            <div className="space-y-2">
              {families.map((fam: any) => (
                <div key={fam.id} className="flex items-center gap-3 p-3 rounded-xl border border-parchment-dark bg-white">
                  <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: fam.colour }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-sm font-semibold text-ink flex items-center gap-1.5">
                      <Users size={12} className="text-ink-faint" />
                      {fam.name}
                    </div>
                    <div className="text-xs text-ink-faint">
                      {fam.members.length} members ·{' '}
                      {fam.members.map((m: any) => (
                        <span key={m.id} className="inline-flex items-center gap-0.5">
                          {m.id === fam.lead_traveller_id && <Crown size={9} className="text-amber-500" />}
                          {m.name}
                        </span>
                      )).reduce((acc: any, el: any, i: number) => i === 0 ? [el] : [...acc, ', ', el], [])}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Remove ${fam.name}?`)) deleteFamilyMutation.mutate(fam.id); }}
                    className="text-terracotta hover:opacity-70 p-1.5 flex-shrink-0"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toggle button */}
          <button
            type="button"
            onClick={() => setShowFamilyForm((v) => !v)}
            className="w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-dashed border-parchment-dark bg-parchment/20 text-sm font-semibold text-ink hover:bg-parchment/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Users size={14} className="text-navy" />
              {families.length === 0 ? 'Group into families?' : '+ Add another family'}
            </span>
            {showFamilyForm ? <ChevronUp size={14} className="text-ink-faint" /> : <ChevronDown size={14} className="text-ink-faint" />}
          </button>

          {/* Family creation form */}
          {showFamilyForm && (
            <div className="p-3 rounded-xl border border-parchment-dark bg-white space-y-3">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">New Family</p>

              {/* Name + colour */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: familyDraft.colour }} />
                <input
                  className="vintage-input flex-1"
                  placeholder="Family name (e.g. Smith family)"
                  value={familyDraft.name}
                  onChange={(e) => setFamilyDraft({ ...familyDraft, name: e.target.value })}
                />
              </div>

              {/* Colour picker */}
              <div className="flex flex-wrap gap-1.5 pl-10">
                {FAMILY_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFamilyDraft({ ...familyDraft, colour: c })}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${familyDraft.colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              {/* Member selection */}
              <div>
                <p className="text-xs text-ink-faint mb-1.5">Select members</p>
                <div className="flex flex-wrap gap-1.5">
                  {eligibleTravellers.map((t) => {
                    const sel = familyDraft.member_ids.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleFamilyMember(t.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                          sel ? 'border-navy bg-navy/10 text-navy' : 'border-parchment-dark bg-white text-ink-faint hover:border-navy/40'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0"
                          style={{ backgroundColor: t.avatar_colour }}
                        >
                          {t.name.charAt(0)}
                        </span>
                        {t.name}
                      </button>
                    );
                  })}
                  {eligibleTravellers.length === 0 && (
                    <p className="text-xs text-ink-faint">All travellers are already in a family.</p>
                  )}
                </div>
              </div>

              {/* Lead selection — only from selected members */}
              {familyDraft.member_ids.length >= 1 && (
                <div>
                  <p className="text-xs text-ink-faint mb-1.5">Lead traveller <Crown size={10} className="inline text-amber-500" /></p>
                  <select
                    className="vintage-input w-full text-sm"
                    value={familyDraft.lead_traveller_id}
                    onChange={(e) => setFamilyDraft({ ...familyDraft, lead_traveller_id: e.target.value })}
                  >
                    <option value="">Select lead…</option>
                    {familyDraft.member_ids.map((id) => {
                      const t = travellers.find((x) => x.id === id);
                      return t ? <option key={id} value={id}>{t.name}</option> : null;
                    })}
                  </select>
                </div>
              )}

              {familyError && <p className="text-xs text-terracotta">{familyError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveFamily}
                  disabled={createFamilyMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                >
                  <Plus size={13} strokeWidth={2.5} /> Create Family
                </button>
                <button
                  type="button"
                  onClick={() => { setShowFamilyForm(false); setFamilyError(null); }}
                  className="btn-secondary px-4 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
