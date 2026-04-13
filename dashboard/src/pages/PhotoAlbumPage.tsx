import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { photosApi } from '@/api/photos';
import { itineraryApi } from '@/api/itinerary';
import type { TripPhoto } from '@trip-planner-ai/shared';
import { Camera, Trash2, X, Upload, Image } from 'lucide-react';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function PhotoAlbumPage() {
  const { currentTrip, activeTraveller } = useTrip();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [dayId, setDayId] = useState('');
  const [lightbox, setLightbox] = useState<TripPhoto | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['photos', currentTrip?.id],
    queryFn: () => photosApi.list(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });

  const uploadMutation = useMutation({
    mutationFn: () => photosApi.upload(currentTrip!.id, selectedFile!, activeTraveller!.id, caption || undefined, dayId || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['photos'] });
      resetUpload();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => photosApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  });

  function resetUpload() {
    setShowUpload(false);
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    setDayId('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  const photoUrl = (id: string) => `/api/v1/photos/${id}/image`;

  if (!currentTrip) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Photos</h2>
          <p className="text-sm text-ink-faint mt-0.5">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
          <Camera size={16} strokeWidth={2} />
          Add Photo
        </button>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={resetUpload}>
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-md p-5 sm:p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink mb-4">Add Photo</h3>

            {/* File picker */}
            {!selectedFile ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-parchment-dark rounded-xl flex flex-col items-center justify-center gap-2 hover:border-navy/40 hover:bg-parchment/50 transition-colors"
              >
                <Upload size={28} strokeWidth={1.5} className="text-ink-faint" />
                <span className="text-sm text-ink-faint font-body">Click to choose a photo</span>
                <span className="text-xs text-ink-faint">JPG, PNG, HEIC up to 10 MB</span>
              </button>
            ) : (
              <div className="relative">
                <img src={preview!} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => { setSelectedFile(null); setPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-ink/60 text-white rounded-full flex items-center justify-center hover:bg-ink"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Caption (optional)</label>
                <input className="vintage-input" value={caption} onChange={(e) => setCaption(e.target.value)}
                  placeholder="What's happening here?" />
              </div>
              {days.length > 0 && (
                <div>
                  <label className="block text-sm font-display text-ink-light mb-1">Tag to day (optional)</label>
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
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={resetUpload} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploadMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo grid */}
      {isLoading ? (
        <div className="vintage-card p-8 text-center text-ink-faint text-sm">Loading…</div>
      ) : photos.length === 0 ? (
        <div className="vintage-card p-12 text-center">
          <Image size={36} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No photos yet</h3>
          <p className="text-sm text-ink-faint">Upload your first trip photo to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden aspect-square bg-parchment-dark">
              <img
                src={photoUrl(photo.id)}
                alt={photo.caption ?? photo.original_name}
                className="w-full h-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-105"
                onClick={() => setLightbox(photo)}
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors duration-200 pointer-events-none" />
              {/* Delete button */}
              {(photo.uploader_id === activeTraveller?.id) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this photo?')) deleteMutation.mutate(photo.id);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 bg-ink/60 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-terracotta"
                >
                  <Trash2 size={13} />
                </button>
              )}
              {/* Caption strip */}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-ink/60 px-2 py-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white font-body truncate">{photo.caption}</p>
                </div>
              )}
              {/* Uploader avatar */}
              <div
                className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: photo.uploader_colour ?? '#2563EB' }}
              >
                {(photo.uploader_name ?? '?').charAt(0).toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white"
            >
              <X size={24} />
            </button>
            <img
              src={photoUrl(lightbox.id)}
              alt={lightbox.caption ?? ''}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
            {(lightbox.caption || lightbox.uploader_name) && (
              <div className="mt-3 flex items-center gap-2">
                {lightbox.uploader_colour && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: lightbox.uploader_colour }}
                  >
                    {(lightbox.uploader_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  {lightbox.caption && <p className="text-white text-sm font-body">{lightbox.caption}</p>}
                  <p className="text-white/50 text-xs font-body">{lightbox.uploader_name} · {timeAgo(lightbox.created_at)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
