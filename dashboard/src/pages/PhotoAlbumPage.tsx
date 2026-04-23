import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { photosApi } from '@/api/photos';
import { itineraryApi } from '@/api/itinerary';
import { API_BASE } from '@/api/client';
import type { TripPhoto } from '@trip-planner-ai/shared';
import { Camera, Trash2, X, Image, CalendarDays } from 'lucide-react';
import { parseLocalDate } from '@/utils/date';

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lightbox, setLightbox] = useState<TripPhoto | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => photosApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  });

  const photoUrl = (id: string) => `${API_BASE}/photos/${id}/image`;

  // Group photos: tagged-to-day first (sorted by day), then untagged
  const dayMap = new Map(days.map((d) => [d.id, d]));

  const grouped: Array<{ label: string; photos: TripPhoto[] }> = [];

  // Photos tagged to a day, grouped
  const byDay = new Map<string, TripPhoto[]>();
  const untagged: TripPhoto[] = [];
  for (const p of photos) {
    if (p.day_id && dayMap.has(p.day_id)) {
      if (!byDay.has(p.day_id)) byDay.set(p.day_id, []);
      byDay.get(p.day_id)!.push(p);
    } else {
      untagged.push(p);
    }
  }

  // Sort days chronologically
  const sortedDays = days.filter((d) => byDay.has(d.id)).sort((a, b) => a.day_number - b.day_number);
  for (const day of sortedDays) {
    grouped.push({
      label: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''} · ${parseLocalDate(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      photos: byDay.get(day.id)!,
    });
  }
  if (untagged.length > 0) {
    grouped.push({ label: 'General', photos: untagged });
  }

  // Flat list for lightbox navigation
  const allPhotos = grouped.flatMap((g) => g.photos);

  function openLightbox(photo: TripPhoto) {
    const idx = allPhotos.findIndex((p) => p.id === photo.id);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightbox(photo);
  }

  function lightboxNav(dir: 1 | -1) {
    const next = (lightboxIndex + dir + allPhotos.length) % allPhotos.length;
    setLightboxIndex(next);
    setLightbox(allPhotos[next]);
  }

  if (!currentTrip) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-navy">Photos</h2>
          <p className="text-sm text-ink-faint mt-0.5">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/community/photos/upload')} className="btn-primary flex items-center gap-2">
          <Camera size={16} strokeWidth={2} />
          Add Photo
        </button>
      </div>

      {isLoading ? (
        <div className="vintage-card p-8 text-center text-ink-faint text-sm">Loading…</div>
      ) : photos.length === 0 ? (
        <div className="vintage-card p-12 text-center">
          <Image size={36} className="text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-semibold text-navy mb-1">No photos yet</h3>
          <p className="text-sm text-ink-faint mb-4">Be the first to add a trip photo</p>
          <button onClick={() => navigate('/community/photos/upload')} className="btn-primary">
            <Camera size={14} strokeWidth={2} className="inline mr-1.5" />
            Upload Photo
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={13} className="text-ink-faint" strokeWidth={2} />
                <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">{group.label}</span>
                <span className="text-xs text-ink-faint">· {group.photos.length}</span>
              </div>

              {/* Photo grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {group.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative rounded-xl overflow-hidden aspect-square bg-parchment-dark cursor-pointer"
                    onClick={() => openLightbox(photo)}
                  >
                    <img
                      src={photoUrl(photo.id)}
                      alt={photo.caption ?? photo.original_name}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/20 transition-colors duration-200 pointer-events-none" />

                    {/* Delete (own photos) — always visible on mobile, hover-only on desktop */}
                    {photo.uploader_id === activeTraveller?.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this photo?')) deleteMutation.mutate(photo.id);
                        }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-ink/60 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-terracotta z-10"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}

                    {/* Uploader dot — always visible on mobile, hover-only on desktop */}
                    <div
                      className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: photo.uploader_colour ?? '#2563EB' }}
                    >
                      {(photo.uploader_name ?? '?').charAt(0).toUpperCase()}
                    </div>

                    {/* Caption hint — always visible on mobile, hover-only on desktop */}
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/70 to-transparent px-2 py-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white font-body truncate">{photo.caption}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-ink/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* Close */}
            <button onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white z-10">
              <X size={22} />
            </button>

            {/* Counter */}
            <div className="absolute -top-10 left-0 text-white/50 text-sm">
              {lightboxIndex + 1} / {allPhotos.length}
            </div>

            {/* Prev */}
            {allPhotos.length > 1 && (
              <button
                onClick={() => lightboxNav(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-lg leading-none"
              >‹</button>
            )}

            <img
              src={photoUrl(lightbox.id)}
              alt={lightbox.caption ?? ''}
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />

            {/* Next */}
            {allPhotos.length > 1 && (
              <button
                onClick={() => lightboxNav(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-lg leading-none"
              >›</button>
            )}

            {/* Caption + uploader */}
            {(lightbox.caption || lightbox.uploader_name) && (
              <div className="mt-4 flex items-center gap-3 self-start">
                {lightbox.uploader_colour && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: lightbox.uploader_colour }}>
                    {(lightbox.uploader_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  {lightbox.caption && <p className="text-white text-sm">{lightbox.caption}</p>}
                  <p className="text-white/50 text-xs">{lightbox.uploader_name} · {timeAgo(lightbox.created_at)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
