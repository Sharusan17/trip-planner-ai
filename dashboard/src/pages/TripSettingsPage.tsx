import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { tripsApi } from '@/api/trips';
import { ArrowLeft, Copy, Check, MapPin, Search, X } from 'lucide-react';

const COMMON_CURRENCIES = ['GBP', 'EUR', 'USD', 'AED', 'AUD', 'CAD', 'CHF', 'DKK', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR'];

export default function TripSettingsPage() {
  const { currentTrip, setCurrentTrip, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [homeCurrency, setHomeCurrency] = useState('GBP');
  const [destCurrency, setDestCurrency] = useState('EUR');
  const [saved, setSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Location search
  const [locSearch, setLocSearch] = useState('');
  const [locResults, setLocResults] = useState<Array<{ place_id: number; display_name: string; lat: string; lon: string }>>([]);
  const [showLocResults, setShowLocResults] = useState(false);
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentTrip) {
      setTripName(currentTrip.name);
      setDestination(currentTrip.destination);
      setLocSearch(currentTrip.destination);
      setLat(String(currentTrip.latitude));
      setLng(String(currentTrip.longitude));
      setStartDate(currentTrip.start_date.slice(0, 10));
      setEndDate(currentTrip.end_date.slice(0, 10));
      setHomeCurrency(currentTrip.home_currency);
      setDestCurrency(currentTrip.dest_currency);
    }
  }, [currentTrip]);

  // Guard: non-organisers redirected
  useEffect(() => {
    if (!isOrganiser) navigate('/dashboard', { replace: true });
  }, [isOrganiser, navigate]);

  const handleLocSearch = (q: string) => {
    setLocSearch(q);
    setDestination(q);
    setLat('');
    setLng('');
    if (locTimer.current) clearTimeout(locTimer.current);
    if (q.length < 3) { setLocResults([]); setShowLocResults(false); return; }
    locTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
        );
        const data = await res.json();
        setLocResults(data);
        setShowLocResults(true);
      } catch {
        setLocResults([]);
      }
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

  const updateMutation = useMutation({
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const copyCode = () => {
    if (!currentTrip) return;
    navigator.clipboard.writeText(currentTrip.group_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  if (!currentTrip || !isOrganiser) return null;

  const canSave = tripName.trim() && destination && lat && lng && startDate && endDate;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-parchment-dark/40 transition-colors text-ink-faint hover:text-ink">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Trip Settings</h1>
      </div>

      <div className="vintage-card p-6 space-y-5">
        {/* Group code (read-only) */}
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
          <p className="text-xs text-ink-faint mt-1">Share this code with travellers so they can join</p>
        </div>

        {/* Trip name */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Trip Name *</label>
          <input
            className="vintage-input w-full"
            required
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder="e.g. Faro Summer 2025"
          />
        </div>

        {/* Destination search */}
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
                    <div className="text-sm font-medium text-ink leading-snug truncate">
                      {r.display_name.split(',')[0]}
                    </div>
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
            <input type="date" className="vintage-input w-full" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">End Date *</label>
            <input type="date" className="vintage-input w-full" value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)} />
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

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
