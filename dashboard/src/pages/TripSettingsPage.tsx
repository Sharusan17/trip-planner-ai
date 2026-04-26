import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { tripsApi } from '@/api/trips';
import { travellersApi } from '@/api/travellers';
import { ArrowLeft, Copy, Check, MapPin, Search, X, Camera, Trash2 } from 'lucide-react';
import { toDateInput } from '@/utils/date';

const COMMON_CURRENCIES = ['GBP', 'EUR', 'USD', 'AED', 'AUD', 'CAD', 'CHF', 'DKK', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR'];
const AVATAR_COLOURS = ['#1B3A5C', '#C65D3E', '#B8963E', '#2A5580', '#D4806A', '#9A7B2F', '#5C4D3C', '#6B8E7B', '#8B6FAE', '#D4A574'];

export default function TripSettingsPage() {
  const { currentTrip, setCurrentTrip, isOrganiser, activeTraveller, setActiveTraveller } = useTrip();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Trip settings state (organiser only) ──────────────────────────────
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [homeCurrency, setHomeCurrency] = useState('GBP');
  const [destCurrency, setDestCurrency] = useState('EUR');
  const [tripSaved, setTripSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Location search
  const [locSearch, setLocSearch] = useState('');
  const [locResults, setLocResults] = useState<Array<{ place_id: number; display_name: string; lat: string; lon: string }>>([]);
  const [showLocResults, setShowLocResults] = useState(false);
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Profile state (all users) ─────────────────────────────────────────
  const [profName, setProfName] = useState('');
  const [profColour, setProfColour] = useState(AVATAR_COLOURS[0]);
  const [profNotes, setProfNotes] = useState('');
  const [profSaved, setProfSaved] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate trip fields
  useEffect(() => {
    if (currentTrip && isOrganiser) {
      setTripName(currentTrip.name);
      setDestination(currentTrip.destination);
      setLocSearch(currentTrip.destination);
      setLat(String(currentTrip.latitude));
      setLng(String(currentTrip.longitude));
      setStartDate(toDateInput(currentTrip.start_date));
      setEndDate(toDateInput(currentTrip.end_date));
      setHomeCurrency(currentTrip.home_currency);
      setDestCurrency(currentTrip.dest_currency);
    }
  }, [currentTrip, isOrganiser]);

  // Populate profile fields
  useEffect(() => {
    if (activeTraveller) {
      setProfName(activeTraveller.name);
      setProfColour(activeTraveller.avatar_colour);
      setProfNotes(activeTraveller.notes || '');
      setHasExistingPhoto(activeTraveller.has_photo);
    }
  }, [activeTraveller]);

  // ── Location search handlers ──────────────────────────────────────────
  const handleLocSearch = (q: string) => {
    setLocSearch(q);
    setDestination(q);
    setLat('');
    setLng('');
    if (locTimer.current) clearTimeout(locTimer.current);
    if (q.length < 3) { setLocResults([]); setShowLocResults(false); return; }
    locTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
        const data = await res.json();
        setLocResults(data);
        setShowLocResults(true);
      } catch { setLocResults([]); }
    }, 400);
  };

  const selectLocation = (r: { display_name: string; lat: string; lon: string }) => {
    const short = r.display_name.split(',').slice(0, 2).join(',').trim();
    setDestination(short);
    setLocSearch(short);
    setLat(parseFloat(r.lat).toFixed(6));
    setLng(parseFloat(r.lon).toFixed(6));
    setShowLocResults(false);
  };

  // ── Photo handlers ────────────────────────────────────────────────────
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

  // ── Mutations ─────────────────────────────────────────────────────────
  const tripMutation = useMutation({
    mutationFn: () => tripsApi.update(currentTrip!.id, {
      name: tripName.trim(),
      destination,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      start_date: startDate,
      end_date: endDate,
      home_currency: homeCurrency,
      dest_currency: destCurrency,
    }),
    onSuccess: (updated) => {
      setCurrentTrip(updated);
      qc.invalidateQueries({ queryKey: ['trip'] });
      setTripSaved(true);
      setTimeout(() => setTripSaved(false), 2500);
    },
  });

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (!activeTraveller) throw new Error('No active traveller');
      const updated = await travellersApi.update(activeTraveller.id, {
        name: profName.trim(),
        avatar_colour: profColour,
        notes: profNotes || undefined,
      });
      if (photoFile) await travellersApi.uploadPhoto(activeTraveller.id, photoFile);
      else if (removePhoto && hasExistingPhoto) await travellersApi.deletePhoto(activeTraveller.id);
      return updated;
    },
    onSuccess: (updated) => {
      const newHasPhoto = photoFile ? true : (removePhoto ? false : hasExistingPhoto);
      setActiveTraveller({ ...updated, has_photo: newHasPhoto });
      // Reset photo state to reflect new reality
      setHasExistingPhoto(newHasPhoto);
      setPhotoFile(null);
      setPhotoPreview(null);
      setRemovePhoto(false);
      qc.invalidateQueries({ queryKey: ['travellers'] });
      setProfSaved(true);
      setTimeout(() => setProfSaved(false), 2500);
    },
  });

  const copyCode = () => {
    if (!currentTrip) return;
    navigator.clipboard.writeText(currentTrip.group_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  if (!currentTrip) return null;

  const canSaveTrip = tripName.trim() && destination && lat && lng && startDate && endDate;

  const existingPhotoUrl = hasExistingPhoto && !removePhoto
    ? travellersApi.getPhotoUrl(activeTraveller!.id)
    : null;
  const showPhoto = photoPreview || existingPhotoUrl;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
      </div>

      {/* ── My Profile (all users) ─────────────────────────────────── */}
      <div className="vintage-card overflow-hidden">
        <div className="px-5 py-4 border-b border-parchment-dark">
          <h2 className="font-display text-base font-semibold text-ink">My Profile</h2>
          <p className="text-xs text-ink-faint mt-0.5">Update your name, avatar and bio</p>
        </div>
        <div className="p-5 space-y-5">

          {/* Photo + avatar row */}
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {showPhoto ? (
                <img
                  src={photoPreview ?? existingPhotoUrl!}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover border-4 border-parchment-dark"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl border-4 border-parchment-dark"
                  style={{ backgroundColor: profColour }}
                >
                  {profName ? profName.charAt(0).toUpperCase() : '?'}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 bg-navy text-white rounded-full flex items-center justify-center shadow-md hover:bg-navy-dark transition-colors"
              >
                <Camera size={12} strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <input
                className="vintage-input w-full"
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                placeholder="Your name"
              />
              {showPhoto && (
                <button type="button" onClick={handleRemovePhoto}
                  className="flex items-center gap-1 text-xs text-terracotta hover:opacity-70">
                  <Trash2 size={10} /> Remove photo
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          {/* Colour picker */}
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-2 uppercase tracking-wider">Avatar Colour</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLOURS.map((c) => (
                <button key={c} type="button" onClick={() => setProfColour(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${profColour === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">
              Bio / Notes <span className="normal-case font-normal">(optional)</span>
            </label>
            <textarea
              className="vintage-input w-full"
              rows={2}
              value={profNotes}
              onChange={(e) => setProfNotes(e.target.value)}
              placeholder="Dietary needs, fun facts, anything the group should know…"
            />
          </div>

          <button
            type="button"
            disabled={profileMutation.isPending || !profName.trim()}
            onClick={() => profileMutation.mutate()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {profileMutation.isPending ? 'Saving…' : profSaved ? '✓ Profile Saved' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Trip Settings (organiser only) ────────────────────────── */}
      {isOrganiser && (
        <div className="vintage-card overflow-hidden">
          <div className="px-5 py-4 border-b border-parchment-dark">
            <h2 className="font-display text-base font-semibold text-ink">Trip Settings</h2>
            <p className="text-xs text-ink-faint mt-0.5">Edit trip details — only you can see this section</p>
          </div>
          <div className="p-5 space-y-5">

            {/* Group code */}
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Group Code</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-parchment text-ink text-lg tracking-[0.3em] font-mono px-4 py-2 rounded-xl text-center border border-parchment-dark">
                  {currentTrip.group_code}
                </code>
                <button onClick={copyCode} className="btn-secondary py-2 px-3 flex items-center gap-1.5 text-sm flex-shrink-0">
                  {codeCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-ink-faint mt-1">Share this with travellers so they can join</p>
            </div>

            {/* Trip name */}
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Trip Name *</label>
              <input className="vintage-input w-full" value={tripName}
                onChange={(e) => setTripName(e.target.value)} placeholder="e.g. Faro Summer 2025" />
            </div>

            {/* Destination */}
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={12} /> Destination *
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  className="vintage-input w-full pl-8 pr-8"
                  value={locSearch}
                  onChange={(e) => handleLocSearch(e.target.value)}
                  onFocus={() => locResults.length > 0 && setShowLocResults(true)}
                  onBlur={() => setTimeout(() => setShowLocResults(false), 200)}
                  placeholder="Search for a city or place…"
                />
                {locSearch && (
                  <button type="button"
                    onClick={() => { setLocSearch(''); setDestination(''); setLat(''); setLng(''); setLocResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                    <X size={13} />
                  </button>
                )}
                {showLocResults && locResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-parchment-dark rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {locResults.map((r) => (
                      <button key={r.place_id} type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors"
                        onMouseDown={() => selectLocation(r)}>
                        <div className="text-sm font-medium text-ink leading-snug truncate">{r.display_name.split(',')[0]}</div>
                        <div className="text-xs text-ink-faint mt-0.5 truncate">{r.display_name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {lat && lng && (
                <p className="text-xs text-ink-faint mt-1.5 flex items-center gap-1">
                  <MapPin size={10} className="text-navy" /> {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Start Date *</label>
                <input type="date" className="vintage-input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">End Date *</label>
                <input type="date" className="vintage-input w-full" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Currencies */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Home Currency</label>
                <select className="vintage-input" value={homeCurrency} onChange={(e) => setHomeCurrency(e.target.value)}>
                  {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Destination Currency</label>
                <select className="vintage-input" value={destCurrency} onChange={(e) => setDestCurrency(e.target.value)}>
                  {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={!canSaveTrip || tripMutation.isPending}
              onClick={() => tripMutation.mutate()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {tripMutation.isPending ? 'Saving…' : tripSaved ? '✓ Trip Saved' : 'Save Trip Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
