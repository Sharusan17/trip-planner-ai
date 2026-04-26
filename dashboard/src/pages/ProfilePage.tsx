import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { travellersApi } from '@/api/travellers';
import { ArrowLeft, Camera, Trash2, User } from 'lucide-react';

const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function ProfilePage() {
  const { activeTraveller, setActiveTraveller } = useTrip();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [colour, setColour] = useState(AVATAR_COLOURS[0]);
  const [notes, setNotes] = useState('');

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTraveller) {
      setName(activeTraveller.name);
      setColour(activeTraveller.avatar_colour);
      setNotes(activeTraveller.notes || '');
      setHasExistingPhoto(activeTraveller.has_photo);
    }
  }, [activeTraveller]);

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

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeTraveller) throw new Error('No active traveller');
      const updated = await travellersApi.update(activeTraveller.id, {
        name: name.trim(),
        avatar_colour: colour,
        notes: notes || undefined,
      });
      if (photoFile) await travellersApi.uploadPhoto(activeTraveller.id, photoFile);
      else if (removePhoto && hasExistingPhoto) await travellersApi.deletePhoto(activeTraveller.id);
      return updated;
    },
    onSuccess: (updated) => {
      // Update activeTraveller in context so sidebar/header reflect changes immediately
      setActiveTraveller({ ...updated, has_photo: photoFile ? true : (removePhoto ? false : hasExistingPhoto) });
      qc.invalidateQueries({ queryKey: ['travellers'] });
      navigate('/dashboard');
    },
  });

  if (!activeTraveller) return null;

  const existingPhotoUrl = hasExistingPhoto && !removePhoto
    ? travellersApi.getPhotoUrl(activeTraveller.id)
    : null;
  const showPhoto = photoPreview || existingPhotoUrl;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">My Profile</h1>
      </div>

      <div className="vintage-card p-6 space-y-5">
        {/* Avatar */}
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
                {name ? name.charAt(0).toUpperCase() : <User size={32} />}
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

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <p className="text-xs text-ink-faint">Tap the camera icon to upload a profile photo</p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Name *</label>
          <input
            className="vintage-input w-full"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        {/* Colour */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Avatar Colour</label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all ${colour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          {!showPhoto && (
            <div className="mt-3 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base"
                style={{ backgroundColor: colour }}
              >
                {name ? name.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="text-sm text-ink-faint font-body">{name || 'Preview'}</span>
            </div>
          )}
        </div>

        {/* Bio / Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
            Bio / Notes <span className="normal-case font-normal">(optional)</span>
          </label>
          <textarea
            className="vintage-input w-full"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell the group a bit about yourself — dietary needs, fun facts, etc."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            disabled={updateMutation.isPending || !name.trim()}
            onClick={() => updateMutation.mutate()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
