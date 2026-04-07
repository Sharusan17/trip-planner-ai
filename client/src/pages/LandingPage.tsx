import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '@/context/TripContext';
import { tripsApi } from '@/api/trips';
import { travellersApi } from '@/api/travellers';
import type { Trip, Traveller } from '@trip-planner-ai/shared';

type View = 'home' | 'create' | 'join' | 'select-traveller';

export default function LandingPage() {
  const [view, setView] = useState<View>('home');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setCurrentTrip, setActiveTraveller } = useTrip();

  // Create trip state
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [homeCurrency, setHomeCurrency] = useState('GBP');
  const [destCurrency, setDestCurrency] = useState('EUR');

  // Join trip state
  const [groupCode, setGroupCode] = useState('');
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [travellers, setTravellers] = useState<Traveller[]>([]);

  // Organiser name for create flow
  const [organiserName, setOrganiserName] = useState('');

  const handleCreate = async () => {
    try {
      setError('');
      if (!tripName || !destination || !startDate || !endDate || !organiserName) {
        setError('Please fill in all required fields');
        return;
      }
      const trip = await tripsApi.create({
        name: tripName,
        destination,
        latitude: parseFloat(latitude) || 0,
        longitude: parseFloat(longitude) || 0,
        start_date: startDate,
        end_date: endDate,
        home_currency: homeCurrency,
        dest_currency: destCurrency,
      });

      // Create the organiser as first traveller
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
    }
  };

  const handleJoinLookup = async () => {
    try {
      setError('');
      const trip = await tripsApi.getByCode(groupCode.toUpperCase().trim());
      setFoundTrip(trip);
      const travs = await travellersApi.list(trip.id);
      setTravellers(travs);
      setView('select-traveller');
    } catch {
      setError('Trip not found. Check the group code and try again.');
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🧭</div>
          <h1 className="font-display text-4xl font-bold text-navy mb-2">
            Holiday Planner
          </h1>
          <p className="text-ink-light font-body text-lg">
            Plan your group adventure together
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-terracotta/10 border border-terracotta/30 text-terracotta text-sm rounded-sm">
            {error}
          </div>
        )}

        {/* Home view */}
        {view === 'home' && (
          <div className="vintage-card p-8 space-y-4">
            <button onClick={() => setView('create')} className="btn-primary w-full text-center py-3 text-lg">
              Create a Trip
            </button>
            <button onClick={() => setView('join')} className="btn-secondary w-full text-center py-3 text-lg">
              Join a Trip
            </button>
          </div>
        )}

        {/* Create trip form */}
        {view === 'create' && (
          <div className="vintage-card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-navy mb-4">Create a Trip</h2>

            <div>
              <label className="block text-sm font-display text-ink-light mb-1">Your Name *</label>
              <input
                className="vintage-input"
                placeholder="e.g. Alex"
                value={organiserName}
                onChange={(e) => setOrganiserName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-display text-ink-light mb-1">Trip Name *</label>
              <input
                className="vintage-input"
                placeholder="e.g. Portugal Family Holiday"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-display text-ink-light mb-1">Destination *</label>
              <input
                className="vintage-input"
                placeholder="e.g. Faro, Algarve"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Latitude</label>
                <input
                  className="vintage-input"
                  type="number"
                  step="any"
                  placeholder="37.0194"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Longitude</label>
                <input
                  className="vintage-input"
                  type="number"
                  step="any"
                  placeholder="-7.9304"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Start Date *</label>
                <input
                  className="vintage-input"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">End Date *</label>
                <input
                  className="vintage-input"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Home Currency</label>
                <select
                  className="vintage-input"
                  value={homeCurrency}
                  onChange={(e) => setHomeCurrency(e.target.value)}
                >
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-display text-ink-light mb-1">Destination Currency</label>
                <select
                  className="vintage-input"
                  value={destCurrency}
                  onChange={(e) => setDestCurrency(e.target.value)}
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setView('home')} className="btn-secondary flex-1">
                Back
              </button>
              <button onClick={handleCreate} className="btn-primary flex-1">
                Create Trip
              </button>
            </div>
          </div>
        )}

        {/* Join trip form */}
        {view === 'join' && (
          <div className="vintage-card p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-navy mb-4">Join a Trip</h2>
            <div>
              <label className="block text-sm font-display text-ink-light mb-1">Group Code</label>
              <input
                className="vintage-input text-center text-xl tracking-widest font-mono"
                placeholder="XXXX-XXXX"
                maxLength={9}
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setView('home')} className="btn-secondary flex-1">
                Back
              </button>
              <button onClick={handleJoinLookup} className="btn-primary flex-1">
                Find Trip
              </button>
            </div>
          </div>
        )}

        {/* Select traveller */}
        {view === 'select-traveller' && foundTrip && (
          <div className="vintage-card p-6">
            <h2 className="font-display text-xl font-bold text-navy mb-2">
              {foundTrip.name}
            </h2>
            <p className="text-sm text-ink-light mb-4">
              📍 {foundTrip.destination} — Select your name to join
            </p>

            <div className="space-y-2">
              {travellers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTraveller(t)}
                  className="w-full flex items-center gap-3 p-3 vintage-card hover:border-navy/50 transition-all text-left"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-parchment-light"
                    style={{ backgroundColor: t.avatar_colour }}
                  >
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-display font-semibold">{t.name}</div>
                    <div className="text-xs text-ink-faint capitalize">
                      {t.type} • {t.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => { setView('join'); setFoundTrip(null); }}
              className="btn-secondary w-full mt-4"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
