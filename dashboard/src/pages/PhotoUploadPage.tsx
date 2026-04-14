import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { photosApi } from '@/api/photos';
import { itineraryApi } from '@/api/itinerary';
import { ArrowLeft, Upload, X } from 'lucide-react';

export default function PhotoUploadPage() {
  const navigate = useNavigate();
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [dayId, setDayId] = useState('');

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const uploadMutation = useMutation({
    mutationFn: () => photosApi.upload(currentTrip!.id, selectedFile!, activeTraveller!.id, caption || undefined, dayId || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['photos'] }); navigate('/community'); },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community')}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Upload Photo</h1>
      </div>

      <div className="vintage-card p-6 space-y-5">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {/* File picker */}
        {!selectedFile ? (
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-full h-48 border-2 border-dashed border-parchment-dark rounded-xl flex flex-col items-center justify-center gap-3 hover:border-navy/40 hover:bg-parchment/50 transition-colors">
            <div className="w-12 h-12 rounded-full bg-parchment flex items-center justify-center">
              <Upload size={22} strokeWidth={1.5} className="text-ink-faint" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink-light">Click to choose a photo</p>
              <p className="text-xs text-ink-faint mt-0.5">JPG, PNG, HEIC up to 10 MB</p>
            </div>
          </button>
        ) : (
          <div className="relative rounded-xl overflow-hidden">
            <img src={preview!} alt="Preview" className="w-full h-56 object-cover" />
            <button type="button"
              onClick={() => { setSelectedFile(null); setPreview(null); }}
              className="absolute top-3 right-3 w-8 h-8 bg-[#1C1917]/70 text-white rounded-full flex items-center justify-center hover:bg-[#1C1917]">
              <X size={15} />
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Caption (optional)</label>
          <input className="vintage-input" value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="What's happening here?" />
        </div>

        {days.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Tag to day (optional)</label>
            <select className="vintage-input" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              <option value="">No tag</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/community')} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!selectedFile || uploadMutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {uploadMutation.isPending ? 'Uploading…' : 'Upload Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
