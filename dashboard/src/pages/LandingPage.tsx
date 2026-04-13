import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { tripsApi } from '@/api/trips';
import { travellersApi } from '@/api/travellers';
import type { Trip, Traveller } from '@trip-planner-ai/shared';
import { Plane, ArrowLeft, AlertCircle, MapPin, Users, Search, Check, Loader2, X } from 'lucide-react';

type View = 'home' | 'create' | 'join' | 'select-traveller';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
  type?: string;
}

export default function LandingPage() {
  const [view, setView] = useState<View>('home');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setCurrentTrip, setActiveTraveller } = useTrip();

  // Create trip state
  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [homeCurrency, setHomeCurrency] = useState('GBP');
  const [destCurrency, setDestCurrency] = useState('EUR');
  const [organiserName, setOrganiserName] = useState('');

  // Location autocomplete state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationPinned, setLocationPinned] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  // Join trip state
  const [groupCode, setGroupCode] = useState('');
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [travellers, setTravellers] = useState<Traveller[]>([]);

  // Debounced location search
  useEffect(() => {
    if (locationQuery.length < 2 || locationPinned) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationQuery)}&format=json&limit=6&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data: NominatimResult[] = await res.json();
        setLocationSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // silently ignore
      } finally {
        setLocationSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [locationQuery, locationPinned]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleLocationSelect(result: NominatimResult) {
    const city =
      result.address?.city ||
      result.address?.town ||
      result.address?.village ||
      result.display_name.split(',')[0];
    const country = result.address?.country;
    const displayName = [city, country].filter(Boolean).join(', ');
    setLocationPinned({ name: displayName, lat: parseFloat(result.lat), lng: parseFloat(result.lon) });
    setLocationQuery(displayName);
    setLocationSuggestions([]);
    setShowSuggestions(false);
  }

  function clearLocation() {
    setLocationPinned(null);
    setLocationQuery('');
    setLocationSuggestions([]);
  }

  const handleCreate = async () => {
    setError('');
    if (!tripName || !locationQuery || !startDate || !endDate || !organiserName) {
      setError('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const trip = await tripsApi.create({
        name: tripName,
        destination: locationPinned?.name ?? locationQuery,
        latitude: locationPinned?.lat ?? 0,
        longitude: locationPinned?.lng ?? 0,
        start_date: startDate,
        end_date: endDate,
        home_currency: homeCurrency,
        dest_currency: destCurrency,
      });
      const traveller = await travellersApi.create(trip.id, {
        name: organiserName,
        type: 'adult',
        role: 'organiser',
      });
      setCurrentTrip(trip);
      setActiveTraveller(traveller);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLookup = async () => {
    setError('');
    setLoading(true);
    try {
      const trip = await tripsApi.getByCode(groupCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
      setFoundTrip(trip);
      const travs = await travellersApi.list(trip.id);
      setTravellers(travs);
      setView('select-traveller');
    } catch {
      setError('Trip not found. Check the group code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTraveller = (traveller: Traveller) => {
    if (foundTrip) {
      setCurrentTrip(foundTrip);
      setActiveTraveller(traveller);
      navigate('/dashboard');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(160deg, #4E8080 0%, #6B9999 35%, #7BAAA8 65%, #507878 100%)',
      }}
    >
      {/* Soft radial highlight */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(255,255,255,0.10) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Brand mark — home only */}
        {view === 'home' && (
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-4 shadow-lg">
              <Plane size={28} className="text-[#4E8080]" strokeWidth={1.75} />
            </div>
            <h1 className="font-display text-3xl font-bold text-white mb-1.5 tracking-tight">
              Trip Planner
            </h1>
            <p className="text-white/60 text-sm font-body">Plan your group adventure together</p>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm backdrop-blur-sm">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
            {error}
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(28,25,23,0.25)] overflow-hidden">

          {/* ── Home ── */}
          {view === 'home' && (
            <div className="p-7 space-y-3">
              <button
                onClick={() => setView('create')}
                className="w-full btn-primary py-3 text-base font-semibold"
              >
                Create a Trip
              </button>
              <button
                onClick={() => setView('join')}
                className="w-full btn-secondary py-3 text-base font-semibold"
              >
                Join a Trip
              </button>
            </div>
          )}

          {/* ── Create trip ── */}
          {view === 'create' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('home')}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-parchment transition-colors text-ink-faint hover:text-ink"
                >
                  <ArrowLeft size={16} strokeWidth={2} />
                </button>
                <h2 className="font-display text-lg font-bold text-ink">Create a Trip</h2>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">
                  Your Name *
                </label>
                <input
                  className="vintage-input"
                  placeholder="e.g. Alex"
                  value={organiserName}
                  onChange={(e) => setOrganiserName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">
                  Trip Name *
                </label>
                <input
                  className="vintage-input"
                  placeholder="e.g. Portugal Family Holiday"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                />
              </div>

              {/* Location autocomplete */}
              <div ref={locationRef}>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">
                  Destination *
                </label>
                <div className="relative">
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-ink-faint pointer-events-none">
                      {locationSearching ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : locationPinned ? (
                        <Check size={15} className="text-emerald-500" />
                      ) : (
                        <Search size={15} />
                      )}
                    </span>
                    <input
                      className={`vintage-input pl-9 pr-8 ${locationPinned ? 'border-emerald-400 bg-emerald-50/40' : ''}`}
                      placeholder="Search for a city or place…"
                      value={locationQuery}
                      onChange={(e) => {
                        setLocationQuery(e.target.value);
                        if (locationPinned) setLocationPinned(null);
                      }}
                      onFocus={() => {
                        if (locationSuggestions.length > 0) setShowSuggestions(true);
                      }}
                      autoComplete="off"
                    />
                    {locationQuery && (
                      <button
                        type="button"
                        onClick={clearLocation}
                        className="absolute right-3 text-ink-faint hover:text-ink transition-colors"
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>

                  {showSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-parchment-dark rounded-xl shadow-[var(--shadow-elevated)] z-50 overflow-hidden">
                      {locationSuggestions.map((result) => {
                        const city =
                          result.address?.city ||
                          result.address?.town ||
                          result.address?.village ||
                          result.display_name.split(',')[0];
                        const detail = result.display_name.split(',').slice(1, 3).join(',').trim();
                        return (
                          <button
                            key={result.place_id}
                            type="button"
                            onClick={() => handleLocationSelect(result)}
                            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-parchment transition-colors text-left border-b border-parchment-dark last:border-0"
                          >
                            <MapPin size={14} strokeWidth={2} className="text-ink-faint flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-ink font-display truncate">{city}</div>
                              {detail && <div className="text-xs text-ink-faint font-body truncate">{detail}</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {locationPinned && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Check size={11} strokeWidth={2.5} />
                    Location pinned · {locationPinned.lat.toFixed(4)}, {locationPinned.lng.toFixed(4)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">Start Date *</label>
                  <input className="vintage-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">End Date *</label>
                  <input className="vintage-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">Home Currency</label>
                  <select className="vintage-input" value={homeCurrency} onChange={(e) => setHomeCurrency(e.target.value)}>
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">Dest. Currency</label>
                  <select className="vintage-input" value={destCurrency} onChange={(e) => setDestCurrency(e.target.value)}>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="btn-primary w-full py-3 font-semibold text-base disabled:opacity-60"
                >
                  {loading ? 'Creating…' : 'Create Trip'}
                </button>
              </div>
            </div>
          )}

          {/* ── Join trip ── */}
          {view === 'join' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('home')}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-parchment transition-colors text-ink-faint hover:text-ink"
                >
                  <ArrowLeft size={16} strokeWidth={2} />
                </button>
                <h2 className="font-display text-lg font-bold text-ink">Join a Trip</h2>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider font-body">
                  Group Code
                </label>
                <input
                  className="vintage-input text-center text-2xl tracking-[0.4em] font-mono"
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  value={groupCode}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
                    setGroupCode(raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4) : raw);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && groupCode.endsWith('-')) {
                      e.preventDefault();
                      setGroupCode(groupCode.slice(0, -1));
                    }
                  }}
                />
                <p className="text-xs text-ink-faint mt-1.5 text-center">Works with or without the dash</p>
              </div>

              <button
                onClick={handleJoinLookup}
                disabled={loading}
                className="btn-primary w-full py-3 font-semibold text-base disabled:opacity-60"
              >
                {loading ? 'Searching…' : 'Find Trip'}
              </button>
            </div>
          )}

          {/* ── Select traveller ── */}
          {view === 'select-traveller' && foundTrip && (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <button
                  onClick={() => { setView('join'); setFoundTrip(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-parchment transition-colors text-ink-faint hover:text-ink"
                >
                  <ArrowLeft size={16} strokeWidth={2} />
                </button>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold text-ink leading-tight truncate">{foundTrip.name}</h2>
                  <p className="text-xs text-ink-faint flex items-center gap-1 mt-0.5">
                    <MapPin size={11} strokeWidth={2} />
                    {foundTrip.destination}
                  </p>
                </div>
              </div>

              <p className="text-sm text-ink-light mb-3 flex items-center gap-1.5">
                <Users size={14} strokeWidth={2} className="text-ink-faint" />
                Select your name to join
              </p>

              <div className="space-y-2">
                {travellers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTraveller(t)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-parchment-dark hover:border-[#1C1917]/20 hover:bg-parchment/60 transition-all text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: t.avatar_colour }}
                    >
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink font-display text-sm">{t.name}</div>
                      <div className="text-xs text-ink-faint capitalize font-body">{t.type} · {t.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {view === 'home' && (
          <p className="text-center text-white/40 text-xs mt-5">No account needed — just a group code</p>
        )}
      </div>
    </div>
  );
}
