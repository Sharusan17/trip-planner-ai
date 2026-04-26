import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import type { CreateTravellerInput, TravellerType, TravellerRole } from '@trip-planner-ai/shared';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react';

const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function TravellerFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { currentTrip, isOrganiser } = useTrip();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [type, setType] = useState<TravellerType>('adult');
  const [role, setRole] = useState<TravellerRole>('member');
  const [colour, setColour] = useState(AVATAR_COLOURS[0]);
  const [notes, setNotes] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [medicalPin, setMedicalPin] = useState('');

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers', currentTrip?.id],
    queryFn: () => travellersApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  // Populate form when editing
  useEffect(() => {
    if (isEditing && travellers.length > 0) {
      const t = travellers.find((x) => x.id === id);
      if (t) {
        setName(t.name);
        setType(t.type);
        setRole(t.role);
        setColour(t.avatar_colour);
        setNotes(t.notes || '');
        setHasExistingPhoto(t.has_photo);
      }
    }
  }, [id, isEditing, travellers]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createMutation = useMutation({
    mutationFn: async (data: CreateTravellerInput) => {
      const traveller = await travellersApi.create(currentTrip!.id, data);
      if (photoFile) await travellersApi.uploadPhoto(traveller.id, photoFile);
      return traveller;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travellers'] }); navigate('/travellers'); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const traveller = await travellersApi.update(id!, data);
      if (photoFile) await travellersApi.uploadPhoto(id!, photoFile);
      else if (removePhoto && hasExistingPhoto) await travellersApi.deletePhoto(id!);
      return traveller;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travellers'] }); navigate('/travellers'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { name, type, role, avatar_colour: colour, cost_split_weight: 1.0, notes: notes || undefined };
    if (medicalNotes) data.medical_notes = medicalNotes;
    if (medicalPin) data.medical_pin = medicalPin;
    if (isEditing) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Current avatar display: photo preview > existing photo url > colour circle
  const existingPhotoUrl = isEditing && hasExistingPhoto && !removePhoto
    ? travellersApi.getPhotoUrl(id!)
    : null;
  const showPhoto = photoPreview || existingPhotoUrl;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/travellers')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">
          {isEditing ? 'Edit Traveller' : 'Add Traveller'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="vintage-card p-6 space-y-5">

        {/* Avatar / Photo */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {showPhoto ? (
              <img
                src={photoPreview ?? existingPhotoUrl!}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-parchment-dark"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl border-4 border-parchment-dark"
                style={{ backgroundColor: colour }}
              >
                {name ? name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 bg-navy text-white rounded-full flex items-center justify-center shadow-md hover:bg-navy-dark transition-colors"
              title="Upload photo"
            >
              <Camera size={14} strokeWidth={2} />
            </button>
          </div>

          {showPhoto && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="flex items-center gap-1.5 text-xs text-terracotta hover:opacity-70"
            >
              <Trash2 size={11} /> Remove photo
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <p className="text-xs text-ink-faint">Tap the camera icon to upload a profile photo</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Name *</label>
          <input className="vintage-input w-full" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
        </div>

        {isOrganiser && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Type</label>
              <select className="vintage-input" value={type} onChange={(e) => setType(e.target.value as TravellerType)}>
                <option value="adult">Adult</option>
                <option value="child">Child</option>
                <option value="infant">Infant</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Role</label>
              <select className="vintage-input" value={role} onChange={(e) => setRole(e.target.value as TravellerRole)}>
                <option value="member">Member</option>
                <option value="organiser">Organiser</option>
              </select>
            </div>
          </div>
        )}

        {/* Avatar Colour */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Avatar Colour</label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLOURS.map((c) => (
              <button key={c} type="button" onClick={() => setColour(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all ${colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        {/* Bio / Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Bio / Notes <span className="normal-case font-normal">(optional)</span></label>
          <textarea className="vintage-input w-full" rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="A short bio or anything useful for the group…" />
        </div>

        {isOrganiser && (
          <>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Medical Notes <span className="normal-case font-normal">(optional)</span></label>
              <textarea className="vintage-input w-full" rows={3} value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                placeholder="Allergies, medications, conditions…" />
            </div>

            {medicalNotes && (
              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">PIN to protect medical notes</label>
                <input className="vintage-input w-36 text-center tracking-widest" type="password"
                  maxLength={4} placeholder="4 digits"
                  value={medicalPin}
                  onChange={(e) => setMedicalPin(e.target.value.replace(/\D/g, ''))} />
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/travellers')} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={isPending || !name.trim()} className="btn-primary flex-1 disabled:opacity-50">
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Traveller'}
          </button>
        </div>
      </form>
    </div>
  );
}
