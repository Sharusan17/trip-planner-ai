import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/context/TripContext';
import { itineraryApi } from '@/api/itinerary';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft, ArrowRight, Wand2, MapPin, GripVertical,
  Check, X, RefreshCw, Loader2, CalendarDays, Zap, Pencil, Search,
} from 'lucide-react';
import { parseLocalDate } from '@/utils/date';
import { ACTIVITY_ICONS, type ActivityType } from '@trip-planner-ai/shared';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoOption {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface GeocodedItem {
  id: string;
  original: string;
  status: 'loading' | 'resolved' | 'failed';
  chosen?: GeoOption;
  options: GeoOption[];
}

interface OrderedItem {
  id: string;
  label: string;
  resolvedName: string;
  lat: number;
  lon: number;
}

interface AssignedItem extends OrderedItem {
  dayId: string;
  time: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseList(text: string): string[] {
  return text
    .split(/[\n;]/)
    .map((line) =>
      line
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/^\s*[-•*]\s*/, '')
        .trim()
    )
    .filter((line) => line.length > 1);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighbourSort(items: OrderedItem[]): OrderedItem[] {
  if (items.length <= 1) return [...items];
  const remaining = [...items];
  const result: OrderedItem[] = [remaining.splice(0, 1)[0]];
  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last.lat, last.lon, remaining[i].lat, remaining[i].lon);
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }
    result.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return result;
}

async function geocodeItem(name: string, tripLat?: number, tripLon?: number): Promise<GeoOption[]> {
  let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=4`;
  if (tripLat !== undefined && tripLon !== undefined) {
    url += `&lat=${tripLat}&lon=${tripLon}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  const features = (data.features ?? []) as Array<{
    properties: { name?: string; city?: string; country?: string; street?: string; county?: string };
    geometry: { coordinates: [number, number] };
  }>;
  return features
    .filter((f) => f.properties.name && f.geometry?.coordinates?.length === 2)
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const address = [p.street, p.city ?? p.county, p.country].filter(Boolean).join(', ');
      return { name: p.name!, address, lat, lon };
    });
}

const MARKER_COLOURS = [
  '#4E8080', '#F59E0B', '#10B981', '#8B5CF6',
  '#EC4899', '#F97316', '#06B6D4', '#EF4444',
];
const getColour = (i: number) => MARKER_COLOURS[i % MARKER_COLOURS.length];

function createPlannerMarker(num: number, colour: string) {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${colour};color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:Outfit,sans-serif;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3)">${num}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -20],
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FitBoundsOnce({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      fitted.current = true;
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, positions]);
  return null;
}

function StepStrip({ step }: { step: number }) {
  const steps = ['Paste', 'Confirm', 'Reorder', 'Assign'];
  return (
    <div className="flex items-center mb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done ? 'bg-navy text-white' :
                active ? 'bg-navy text-white shadow-[0_0_0_4px_rgba(78,128,128,0.2)]' :
                'bg-parchment-dark text-ink-faint'
              }`}>
                {done ? <Check size={13} strokeWidth={3} /> : n}
              </div>
              <span className={`text-[10px] font-semibold hidden sm:block ${active ? 'text-navy' : 'text-ink-faint'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors ${n < step ? 'bg-navy' : 'bg-parchment-dark'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GeocodedRow({
  item, onSelect, onRetry, tripLat, tripLon,
}: {
  item: GeocodedItem;
  onSelect: (opt: GeoOption) => void;
  onRetry: () => void;
  tripLat?: number;
  tripLon?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openEdit() {
    setQuery(item.original);
    setResults([]);
    setShowResults(false);
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
  }

  function closeEdit() {
    setEditing(false);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  function handleQueryChange(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const opts = await geocodeItem(q, tripLat, tripLon);
        setResults(opts);
        setShowResults(opts.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function selectResult(opt: GeoOption) {
    onSelect(opt);
    closeEdit();
  }

  return (
    <div className="px-4 py-3.5 relative">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-4">
          {item.status === 'loading' && <Loader2 size={15} className="text-navy animate-spin" />}
          {item.status === 'resolved' && <Check size={15} className="text-emerald-500" strokeWidth={2.5} />}
          {item.status === 'failed' && <X size={15} className="text-terracotta" strokeWidth={2.5} />}
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="relative">
              <div className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 transition-colors ${
                showResults ? 'border-navy/40 shadow-[0_0_0_3px_rgba(78,128,128,0.12)]' : 'border-parchment-dark'
              }`}>
                <Search size={12} className="text-ink-faint flex-shrink-0" />
                <input
                  ref={inputRef}
                  className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-ink-faint min-w-0"
                  placeholder="Search for the correct place…"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)}
                />
                {searching && <Loader2 size={12} className="text-ink-faint animate-spin flex-shrink-0" />}
              </div>
              {showResults && results.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-parchment-dark rounded-xl shadow-[var(--shadow-elevated)] overflow-hidden z-[500]">
                  {results.map((opt, i) => (
                    <button
                      key={i}
                      onMouseDown={() => selectResult(opt)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors flex items-start gap-2.5"
                    >
                      <MapPin size={12} className="text-navy mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{opt.name}</p>
                        {opt.address && <p className="text-[11px] text-ink-faint truncate">{opt.address}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink leading-snug">{item.original}</p>

              {item.status === 'resolved' && item.chosen && (
                <div className="mt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs text-ink-faint">
                      {item.chosen.name}
                      {item.chosen.address ? ` · ${item.chosen.address}` : ''}
                    </p>
                    {item.options.length > 1 && (
                      <button
                        onClick={() => setExpanded((v) => !v)}
                        className="text-[11px] text-navy font-medium hover:underline flex-shrink-0"
                      >
                        {expanded ? 'Less' : `${item.options.length - 1} other${item.options.length > 2 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                  {expanded && item.options.length > 1 && (
                    <div className="mt-2 space-y-1">
                      {item.options.map((opt, i) => {
                        const selected = item.chosen?.lat === opt.lat && item.chosen?.lon === opt.lon;
                        return (
                          <button
                            key={i}
                            onClick={() => { onSelect(opt); setExpanded(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                              selected
                                ? 'bg-navy text-white border-navy'
                                : 'bg-white border-parchment-dark text-ink hover:border-navy/40'
                            }`}
                          >
                            <span className="font-medium">{opt.name}</span>
                            {opt.address && <span className="opacity-70"> · {opt.address}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {item.status === 'failed' && (
                <p className="text-xs text-terracotta mt-0.5">Couldn't find this place — edit the name or retry</p>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {editing ? (
            <button
              onClick={closeEdit}
              title="Cancel"
              className="p-1 text-ink-faint hover:text-terracotta transition-colors"
            >
              <X size={14} />
            </button>
          ) : (
            <>
              {item.status === 'failed' && (
                <>
                  <button
                    onClick={openEdit}
                    title="Edit name"
                    className="p-1 text-ink-faint hover:text-navy transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={onRetry}
                    title="Retry with original name"
                    className="p-1 text-ink-faint hover:text-navy transition-colors"
                  >
                    <RefreshCw size={13} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableRow({
  item, index, tripLat, tripLon, onUpdate,
}: {
  item: OrderedItem;
  index: number;
  tripLat?: number;
  tripLon?: number;
  onUpdate: (id: string, opt: GeoOption) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openEdit() {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeEdit() {
    setEditing(false);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  function handleQueryChange(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const opts = await geocodeItem(q, tripLat, tripLon);
        setResults(opts);
        setShowResults(opts.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function selectResult(opt: GeoOption) {
    onUpdate(item.id, opt);
    closeEdit();
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className={`flex items-center gap-2.5 bg-white border rounded-xl px-3 py-2.5 shadow-sm select-none transition-colors ${
        editing ? 'border-navy/40 shadow-[0_0_0_3px_rgba(78,128,128,0.12)]' : 'border-parchment-dark'
      }`}>
        {/* Drag handle — hidden while editing */}
        <button
          className={`touch-none flex-shrink-0 p-0.5 transition-colors ${
            editing
              ? 'text-ink-faint/30 cursor-default'
              : 'cursor-grab active:cursor-grabbing text-ink-faint hover:text-ink'
          }`}
          {...(editing ? {} : { ...attributes, ...listeners })}
          aria-label="Drag to reorder"
          tabIndex={editing ? -1 : 0}
        >
          <GripVertical size={15} />
        </button>

        {/* Number badge */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: getColour(index) }}
        >
          {index + 1}
        </div>

        {/* Content / search input */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <Search size={12} className="text-ink-faint flex-shrink-0" />
                <input
                  ref={inputRef}
                  className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-ink-faint min-w-0"
                  placeholder={`Search to replace "${item.label}"…`}
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onBlur={() => setTimeout(() => { setShowResults(false); }, 200)}
                />
                {searching && <Loader2 size={12} className="text-ink-faint animate-spin flex-shrink-0" />}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink leading-snug truncate">{item.label}</p>
              {item.resolvedName !== item.label && (
                <p className="text-[11px] text-ink-faint truncate">{item.resolvedName}</p>
              )}
            </>
          )}
        </div>

        {/* Edit / Cancel button */}
        {editing ? (
          <button
            onClick={closeEdit}
            className="flex-shrink-0 p-1 text-ink-faint hover:text-terracotta transition-colors"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            onClick={openEdit}
            className="flex-shrink-0 p-1 text-ink-faint hover:text-navy transition-colors"
            aria-label="Change location"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {editing && showResults && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-parchment-dark rounded-xl shadow-[var(--shadow-elevated)] overflow-hidden z-[500]">
          {results.map((opt, i) => (
            <button
              key={i}
              onMouseDown={() => selectResult(opt)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-parchment/60 border-b border-parchment-dark last:border-0 transition-colors flex items-start gap-2.5"
            >
              <MapPin size={12} className="text-navy mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{opt.name}</p>
                {opt.address && (
                  <p className="text-[11px] text-ink-faint truncate">{opt.address}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ActivityPlannerPage() {
  const { currentTrip, isOrganiser } = useTrip();
  const navigate = useNavigate();
  const location = useLocation();
  const contextDayId = (location.state as { defaultDayId?: string } | null)?.defaultDayId;
  const qc = useQueryClient();

  useEffect(() => {
    if (!isOrganiser) navigate('/itinerary', { replace: true });
  }, [isOrganiser, navigate]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawText, setRawText] = useState('');
  const [parsedLabels, setParsedLabels] = useState<string[]>([]);
  const [geocoded, setGeocoded] = useState<GeocodedItem[]>([]);
  const [ordered, setOrdered] = useState<OrderedItem[]>([]);
  const [assigned, setAssigned] = useState<AssignedItem[]>([]);
  const [applying, setApplying] = useState(false);

  const { data: days = [] } = useQuery({
    queryKey: ['days', currentTrip?.id],
    queryFn: () => itineraryApi.getDays(currentTrip!.id),
    enabled: !!currentTrip,
  });
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function goBack() {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4);
    else navigate('/itinerary');
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────

  function handleTextChange(text: string) {
    setRawText(text);
    setParsedLabels(parseList(text));
  }

  function removeChip(i: number) {
    setParsedLabels((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleAnalyse() {
    if (parsedLabels.length === 0) return;

    const initial: GeocodedItem[] = parsedLabels.map((label, i) => ({
      id: `geo-${i}-${label.replace(/\s+/g, '-')}`,
      original: label,
      status: 'loading',
      options: [],
    }));
    setGeocoded(initial);
    setStep(2);

    for (let i = 0; i < initial.length; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const opts = await geocodeItem(
          initial[i].original,
          currentTrip?.latitude,
          currentTrip?.longitude,
        );
        setGeocoded((prev) => {
          const next = [...prev];
          next[i] = opts.length > 0
            ? { ...next[i], status: 'resolved', chosen: opts[0], options: opts }
            : { ...next[i], status: 'failed', options: [] };
          return next;
        });
      } catch {
        setGeocoded((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'failed', options: [] };
          return next;
        });
      }
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────

  function selectOption(id: string, opt: GeoOption) {
    setGeocoded((prev) =>
      prev.map((g) => (g.id === id ? { ...g, chosen: opt, status: 'resolved' } : g))
    );
  }

  function retryGeocode(item: GeocodedItem) {
    setGeocoded((prev) =>
      prev.map((g) => (g.id === item.id ? { ...g, status: 'loading' } : g))
    );
    geocodeItem(item.original, currentTrip?.latitude, currentTrip?.longitude)
      .then((opts) => {
        setGeocoded((prev) =>
          prev.map((g) =>
            g.id === item.id
              ? { ...g, status: opts.length > 0 ? 'resolved' : 'failed', chosen: opts[0], options: opts }
              : g
          )
        );
      })
      .catch(() => {
        setGeocoded((prev) =>
          prev.map((g) => (g.id === item.id ? { ...g, status: 'failed' } : g))
        );
      });
  }

  function handleConfirm() {
    const resolved = geocoded
      .filter((g) => g.status === 'resolved' && g.chosen)
      .map((g) => ({
        id: g.id,
        label: g.original,
        resolvedName: g.chosen!.name,
        lat: g.chosen!.lat,
        lon: g.chosen!.lon,
      }));
    setOrdered(resolved);
    setStep(3);
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrdered((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }

  function handleUpdateLocation(id: string, opt: GeoOption) {
    setOrdered((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, resolvedName: opt.name, lat: opt.lat, lon: opt.lon }
          : item
      )
    );
  }

  function autoGroupAndProceed() {
    if (ordered.length === 0) return;
    const sorted = nearestNeighbourSort(ordered);
    // If launched from a specific day, start distribution from that day's index
    const startIdx = contextDayId
      ? Math.max(0, sortedDays.findIndex((d) => d.id === contextDayId))
      : 0;
    const remainingDays = sortedDays.slice(startIdx);
    const pool = remainingDays.length > 0 ? remainingDays : sortedDays;
    const n = Math.max(1, pool.length);
    const perDay = Math.ceil(sorted.length / n);
    const result: AssignedItem[] = sorted.map((item, i) => ({
      ...item,
      dayId: pool[Math.min(Math.floor(i / perDay), n - 1)]?.id ?? pool[0]?.id ?? '',
      time: '',
    }));
    setOrdered(sorted);
    setAssigned(result);
    setStep(4);
  }

  function proceedManually() {
    const fallbackDayId = contextDayId ?? sortedDays[0]?.id ?? '';
    setAssigned(
      ordered.map((item) => {
        const existing = assigned.find((a) => a.id === item.id);
        return existing ?? { ...item, dayId: fallbackDayId, time: '' };
      })
    );
    setStep(4);
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────

  async function handleApply() {
    if (applying) return;
    setApplying(true);
    try {
      for (const item of assigned) {
        await itineraryApi.createActivity(item.dayId, {
          type: 'sightseeing',
          description: item.label,
          location_tag: item.resolvedName !== item.label ? item.resolvedName : item.label,
          latitude: item.lat,
          longitude: item.lon,
          time: item.time || undefined,
          kid_friendly: true,
        });
      }
      qc.invalidateQueries({ queryKey: ['days'] });
      navigate('/itinerary');
    } catch {
      alert('Failed to add some activities. Please try again.');
      setApplying(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const mapPositions: [number, number][] = ordered.map((i) => [i.lat, i.lon]);
  const center: [number, number] = currentTrip
    ? [currentTrip.latitude, currentTrip.longitude]
    : [48.8566, 2.3522];

  const allLoading = geocoded.some((g) => g.status === 'loading');
  const resolvedCount = geocoded.filter((g) => g.status === 'resolved').length;
  const failedCount = geocoded.filter((g) => g.status === 'failed').length;

  if (!isOrganiser) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="w-9 h-9 rounded-full bg-white border border-parchment-dark flex items-center justify-center text-ink-light hover:text-navy hover:border-navy/40 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-navy flex items-center gap-2">
            <Wand2 size={19} className="text-gold flex-shrink-0" />
            Plan Activities
          </h2>
          <p className="text-xs text-ink-faint truncate">{currentTrip?.destination}</p>
        </div>
      </div>

      {/* Progress */}
      <StepStrip step={step} />

      {/* ── STEP 1: Paste & Parse ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="vintage-card p-5">
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-2.5">
              Your places list
            </label>
            <textarea
              className="vintage-input w-full resize-none text-sm leading-relaxed"
              style={{ minHeight: '180px', padding: '0.75rem' }}
              placeholder={
                'Eiffel Tower\nLouvre Museum\nSacré-Cœur\nPalais Royal\nMusée d\'Orsay\nNotre Dame Cathedral'
              }
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
              One place per line. Numbered or bulleted lists work too. Each will be geocoded and plotted on the map.
            </p>
          </div>

          {parsedLabels.length > 0 && (
            <div className="vintage-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                  {parsedLabels.length} place{parsedLabels.length !== 1 ? 's' : ''} detected
                </span>
                <button
                  onClick={() => { setRawText(''); setParsedLabels([]); }}
                  className="text-xs text-ink-faint hover:text-terracotta transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {parsedLabels.map((label, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 bg-parchment border border-parchment-dark text-ink text-xs font-medium px-2.5 py-1.5 rounded-full"
                  >
                    <MapPin size={9} className="text-navy flex-shrink-0" />
                    <span className="max-w-[180px] truncate">{label}</span>
                    <button
                      onClick={() => removeChip(i)}
                      className="text-ink-faint hover:text-terracotta ml-0.5 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyse}
            disabled={parsedLabels.length === 0}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wand2 size={15} />
            Analyse {parsedLabels.length > 0 ? `${parsedLabels.length} Places` : 'Places'}
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* ── STEP 2: Geocode & Confirm ────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {allLoading && (
            <div className="flex items-center gap-2.5 bg-navy/5 border border-navy/15 rounded-xl px-4 py-3">
              <Loader2 size={15} className="text-navy animate-spin flex-shrink-0" />
              <p className="text-sm text-navy font-medium">
                Finding locations… {resolvedCount}/{geocoded.length}
              </p>
            </div>
          )}

          <div className="vintage-card divide-y divide-parchment-dark overflow-hidden">
            {geocoded.map((item) => (
              <GeocodedRow
                key={item.id}
                item={item}
                onSelect={(opt) => selectOption(item.id, opt)}
                onRetry={() => retryGeocode(item)}
                tripLat={currentTrip?.latitude}
                tripLon={currentTrip?.longitude}
              />
            ))}
          </div>

          {!allLoading && (
            <div className="space-y-3">
              {failedCount > 0 && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <X size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    {failedCount} place{failedCount !== 1 ? 's' : ''} not found and will be skipped. You can retry or remove them.
                  </p>
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={resolvedCount === 0}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={15} />
                Confirm {resolvedCount} Location{resolvedCount !== 1 ? 's' : ''}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Map & Reorder ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-ink-light">
            Drag the list to reorder your route. The map updates live. When happy, auto-group across your{' '}
            <strong className="text-ink">{sortedDays.length} day{sortedDays.length !== 1 ? 's' : ''}</strong> or assign manually.
          </p>

          {/* Map + List — stacked on mobile, side-by-side on large screens */}
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Map */}
            <div
              className="w-full lg:flex-1 rounded-2xl overflow-hidden border border-parchment-dark shadow-[var(--shadow-card)]"
              style={{ height: 'min(45vw + 60px, 420px)', minHeight: '240px' }}
            >
              <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                <FitBoundsOnce positions={mapPositions} />
                {ordered.map((item, i) => (
                  <Marker
                    key={item.id}
                    position={[item.lat, item.lon]}
                    icon={createPlannerMarker(i + 1, getColour(i))}
                  >
                    <Popup>
                      <div className="font-body text-sm min-w-[140px]">
                        <div className="font-display font-bold text-navy">{item.label}</div>
                        {item.resolvedName !== item.label && (
                          <div className="text-xs text-ink-faint mt-0.5">{item.resolvedName}</div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {mapPositions.length > 1 && (
                  <Polyline
                    positions={mapPositions}
                    pathOptions={{ color: '#4E8080', weight: 2.5, opacity: 0.55, dashArray: '8 5' }}
                  />
                )}
              </MapContainer>
            </div>

            {/* Sortable list */}
            <div className="w-full lg:w-60 xl:w-72">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {ordered.map((item, i) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        index={i}
                        tripLat={currentTrip?.latitude}
                        tripLon={currentTrip?.longitude}
                        onUpdate={handleUpdateLocation}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <p className="text-[11px] text-ink-faint text-center mt-2.5">Hold and drag to reorder</p>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={autoGroupAndProceed}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Zap size={15} className="text-gold" />
              Auto-group Days
            </button>
            <button
              onClick={proceedManually}
              className="btn-primary flex items-center justify-center gap-2"
            >
              Assign Manually
              <ArrowRight size={15} />
            </button>
          </div>

          <p className="text-[11px] text-ink-faint text-center">
            Auto-group clusters nearby places into the same day using your route order.
          </p>
        </div>
      )}

      {/* ── STEP 4: Assign Days & Times ──────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="vintage-card divide-y divide-parchment-dark overflow-hidden">
            {assigned.map((item, i) => (
              <div key={item.id} className="px-4 py-3.5">
                {/* Place name row */}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: getColour(i) }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{item.label}</p>
                    {item.resolvedName !== item.label && (
                      <p className="text-[11px] text-ink-faint truncate">{item.resolvedName}</p>
                    )}
                  </div>
                </div>
                {/* Controls row */}
                <div className="flex items-center gap-2 ml-8">
                  <div className="flex items-center gap-1.5 flex-1">
                    <CalendarDays size={12} className="text-ink-faint flex-shrink-0" />
                    <select
                      className="vintage-input flex-1 text-xs"
                      style={{ height: '2rem', padding: '0 0.5rem' }}
                      value={item.dayId}
                      onChange={(e) =>
                        setAssigned((prev) =>
                          prev.map((a, idx) => (idx === i ? { ...a, dayId: e.target.value } : a))
                        )
                      }
                    >
                      {sortedDays.map((day, di) => (
                        <option key={day.id} value={day.id}>
                          Day {di + 1} · {parseLocalDate(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="time"
                    className="vintage-input text-xs flex-shrink-0"
                    style={{ width: '7rem', height: '2rem', padding: '0 0.5rem' }}
                    value={item.time}
                    onChange={(e) =>
                      setAssigned((prev) =>
                        prev.map((a, idx) => (idx === i ? { ...a, time: e.target.value } : a))
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Existing activities on the context day — times only */}
          {(() => {
            const contextDay = sortedDays.find((d) => d.id === contextDayId);
            if (!contextDay || contextDay.activities.length === 0) return null;
            const di = sortedDays.indexOf(contextDay);
            const existing = [...contextDay.activities].sort((a, b) => {
              if (!a.time && !b.time) return 0;
              if (!a.time) return 1;
              if (!b.time) return -1;
              return a.time.localeCompare(b.time);
            });
            return (
              <div className="vintage-card overflow-hidden">
                <div className="px-4 py-3 border-b border-parchment-dark flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-navy/10 flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">
                    {di + 1}
                  </div>
                  <p className="text-xs font-semibold text-ink">
                    {parseLocalDate(contextDay.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </p>
                  <span className="text-[10px] text-ink-faint ml-auto">{existing.length} existing</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {existing.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 bg-parchment border border-parchment-dark rounded-full px-2.5 py-1">
                      <span className="text-sm leading-none">{ACTIVITY_ICONS[a.type as ActivityType]}</span>
                      <span className="text-[11px] font-mono text-ink-faint">
                        {a.time ? a.time.slice(0, 5) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <button
            onClick={handleApply}
            disabled={applying || assigned.length === 0}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying
              ? <><Loader2 size={15} className="animate-spin" /> Adding to Itinerary…</>
              : <><Check size={15} /> Add {assigned.length} Activit{assigned.length === 1 ? 'y' : 'ies'} to Itinerary</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
