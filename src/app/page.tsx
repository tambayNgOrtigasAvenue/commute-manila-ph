'use client';

import dynamic from 'next/dynamic';
import { Navigation as NavIcon, AlertTriangle, CreditCard, Bike, LocateFixed, Layers, Map as MapIcon, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { TripOption } from '@/lib/routing';
import { supabase } from '@/lib/supabase';
import { Sidebar, TopBar } from '@/components/Navigation';
import type { MapSelection } from '@/components/Map';

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(() => import('@/components/Map'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-container-low animate-pulse flex items-center justify-center text-outline font-space">Loading Map...</div>
});

export default function Home() {
  const [activeTab, setActiveTab] = useState('map');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripOption | null>(null);
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [useDiscounted, setUseDiscounted] = useState(false);
  const [searchMeta, setSearchMeta] = useState<{ hasExact?: boolean; hasPartial?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; type: string; description: string; created_at: string }[]>([]);
  
  // Map Filters
  const [filters, setFilters] = useState({
    terminals: true,
    boundaries: false,
    highways: false
  });

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    const { data } = await supabase.from('alerts').select('*').eq('is_active', true);
    if (data) setAlerts(data);
  };

  const handleSearch = async () => {
    if (!origin && !destination) return;
    setIsLoading(true);
    setSelectedTrip(null);
    try {
      const params = new URLSearchParams({ origin, destination });
      if (userOrigin) {
        params.set('olat', String(userOrigin.lat));
        params.set('olng', String(userOrigin.lng));
      }
      const res = await fetch(`/api/trips/search?${params}`);
      const data = await res.json();
      const results = (data.results || []) as TripOption[];
      setTrips(results);
      setSearchMeta(data.meta || null);
      if (results.length > 0) {
        setSelectedTrip(results[0]);
      }
      if (data.geocoded?.origin && !userOrigin) {
        setUserOrigin(data.geocoded.origin);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setTrips([]);
    } finally {
      setIsLoading(false);
    }
  };

  const mapSelection: MapSelection | null =
    selectedTrip
      ? { trip: selectedTrip, userOrigin: userOrigin ?? undefined }
      : null;

  return (
    <div className="font-inter antialiased bg-background text-on-surface">
      <TopBar />
      <Sidebar activePath="/" />

      {/* Main Content Canvas */}
      <main className="pt-16 pb-20 md:pb-0 md:pl-64 min-h-screen">
        <div className="relative h-[409px] md:h-[512px] overflow-hidden">
          {/* Map Visualization */}
          <div className="absolute inset-0 z-10">
            <Map
              showTerminals={filters.terminals}
              showBoundaries={filters.boundaries}
              showHighways={filters.highways}
              selection={mapSelection}
            />
          </div>
          <div className="absolute inset-0 map-gradient-overlay pointer-events-none z-20"></div>
          
          {/* Map Floating Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
            <button 
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    setUserOrigin({ lat, lng });
                    setOrigin(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                  });
                }
              }}
              className="bg-white p-3 rounded-xl shadow-lg hover:bg-surface-container-low transition-colors text-primary"
            >
              <LocateFixed className="w-6 h-6" />
            </button>
            
            <div className="relative group">
              <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-surface-container-low transition-colors text-primary">
                <Layers className="w-6 h-6" />
              </button>
              
              {/* Layer Filters Menu */}
              <div className="absolute right-0 top-12 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-outline-variant w-48 hidden group-hover:block hover:block transition-all z-50">
                <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2 px-1">Map Filters</p>
                <div className="space-y-1">
                  <FilterToggle 
                    label="Terminals" 
                    active={filters.terminals} 
                    onClick={() => setFilters({...filters, terminals: !filters.terminals})} 
                  />
                  <FilterToggle 
                    label="City Boundaries" 
                    active={filters.boundaries} 
                    onClick={() => setFilters({...filters, boundaries: !filters.boundaries})} 
                  />
                  <FilterToggle 
                    label="Main Highways" 
                    active={filters.highways} 
                    onClick={() => setFilters({...filters, highways: !filters.highways})} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Search Panel Overlay */}
          <div className="absolute top-4 left-4 z-30 w-72 md:w-80 space-y-2 hidden md:block">
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-outline-variant">
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-blue-700"></span>
                  <input 
                    className="w-full pl-8 pr-10 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" 
                    placeholder="Origin (e.g. Cubao)" 
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition((position) => {
                          const lat = position.coords.latitude;
                          const lng = position.coords.longitude;
                          setUserOrigin({ lat, lng });
                          setOrigin(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                        });
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary"
                  >
                    <LocateFixed className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-sm"></span>
                  <input 
                    className="w-full pl-8 pr-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" 
                    placeholder="Destination (e.g. BGC)" 
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
                <button 
                  onClick={handleSearch}
                  className="w-full py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-md active:scale-95"
                >
                  {isLoading ? 'Searching...' : 'Find Route'}
                </button>
              </div>
            </div>
          </div>

          {/* Alert/Status Preview */}
          <div className="absolute bottom-4 left-4 right-4 md:left-6 md:right-auto md:w-80 z-30">
            {alerts.length > 0 ? (
              <div className="bg-error-container text-on-error-container p-4 rounded-2xl shadow-xl border border-error/20 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Traffic Alert: {alerts[0].type}</h4>
                  <p className="text-xs">{alerts[0].description}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/95 backdrop-blur shadow-xl border border-outline-variant p-4 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-tertiary font-bold uppercase tracking-wider">System Status</span>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs font-semibold">Network Live</span>
                  </div>
                </div>
                <h3 className="font-space text-lg font-bold text-on-surface">Transit Explorer</h3>
                <p className="text-sm text-on-surface-variant">Exploring Metro Manila transport hubs</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
            {/* Left Column: Route Search Results */}
            <div className="lg:col-span-7 space-y-gutter">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-space text-2xl font-bold text-on-surface">
                  {trips.length > 0 ? `Options: ${origin || '—'} → ${destination || '—'}` : 'Major Hubs'}
                </h2>
                {trips.length > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDiscounted}
                      onChange={(e) => setUseDiscounted(e.target.checked)}
                      className="rounded border-outline-variant"
                    />
                    <span className="text-on-surface-variant">Student / senior / PWD fare</span>
                  </label>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white border border-outline-variant p-5 rounded-2xl animate-pulse h-40"></div>
                  ))}
                </div>
              ) : trips.length > 0 ? (
                <div className="space-y-4">
                  {searchMeta?.hasPartial && searchMeta?.hasExact === false && (
                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      No exact route for this pair in our database. Showing trips that start or end near your search.
                    </p>
                  )}
                  {trips.map((trip) => {
                    const fare = useDiscounted ? trip.fareDiscounted : trip.fareRegular;
                    const isSelected = selectedTrip?.id === trip.id;
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => setSelectedTrip(trip)}
                        className={`w-full text-left bg-white border p-5 rounded-2xl shadow-sm hover:shadow-md transition-all ${
                          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant'
                        }`}
                      >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-full uppercase tracking-tighter mb-2 inline-block">
                            {trip.modeLabel}
                          </span>
                          {trip.matchType === 'partial' && (
                            <span className="ml-2 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-1 rounded-full">
                              Nearby match
                            </span>
                          )}
                          <h4 className="font-space font-bold text-lg">{trip.originName} → {trip.destName}</h4>
                            <p className="text-sm text-on-surface-variant mt-1">{trip.lineName}</p>
                            {(trip.distanceKm != null || trip.frequency) && (
                              <p className="text-xs text-outline mt-1">
                                {trip.distanceKm != null && `${trip.distanceKm} km`}
                                {trip.distanceKm != null && trip.frequency && ' · '}
                                {trip.frequency}
                                {trip.earliestTravelTime && (
                                  <>
                                    {' · '}
                                    {trip.operates24_7 ? '24/7' : `${trip.earliestTravelTime}–${trip.lastTravelTime}`}
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-on-surface">₱{fare.toFixed(2)}</p>
                          <p className="text-[10px] text-outline uppercase font-bold tracking-widest">{useDiscounted ? 'Discounted' : 'Regular'}</p>
                        </div>
                      </div>
                      {trip.walkLeg && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                          Walk ~{Math.round(trip.walkLeg.distanceM)} m to board
                        </p>
                      )}
                      <p className="text-[10px] text-outline font-bold italic mt-2">Source: {trip.source}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (origin || destination) ? (
                <div className="bg-white border border-outline-variant p-10 rounded-2xl text-center">
                  <NavIcon className="w-12 h-12 text-outline mx-auto mb-4" />
                  <h3 className="font-space font-bold text-lg mb-2">No routes found</h3>
                  <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
                    This app only shows trips from our imported fare sheet (~76 routes). Use place names
                    like <strong>Fairview</strong>, <strong>Cubao</strong>, <strong>PITX</strong>, or{' '}
                    <strong>SM North EDSA</strong>. Short names work (e.g. &quot;Fairview&quot; → &quot;Cubao&quot;).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                  <HubCard 
                    title="MRT-3 Ayala Station" 
                    desc="Direct access to Northbound platform. Covered rack."
                    available="12/40"
                    icon={<CreditCard className="w-6 h-6" />}
                    tags={['CCTV', 'Covered']}
                  />
                  <HubCard 
                    title="SM North EDSA Hub" 
                    desc="Grounded level parking with 24/7 security guard."
                    available="3/50"
                    icon={<CreditCard className="w-6 h-6" />}
                    variant="limited"
                    tags={['Guarded', 'Tools']}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Alerts & Info */}
            <div className="lg:col-span-5 space-y-gutter">
              <h2 className="font-space text-2xl font-bold text-on-surface">Live Traffic Alerts</h2>
              <div className="space-y-4">
                {alerts.length > 0 ? alerts.map(alert => (
                  <div key={alert.id} className="bg-surface-container-low border border-outline-variant p-4 rounded-xl flex items-start gap-3">
                    <div className="p-2 bg-error-container rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-error" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{alert.type}</p>
                      <p className="text-xs text-on-surface-variant">{alert.description}</p>
                      <p className="text-[10px] text-outline mt-1 italic">Active since {new Date(alert.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                )) : (
                  <div className="bg-tertiary-container/10 border border-tertiary/20 p-4 rounded-xl text-center">
                    <p className="text-sm font-bold text-tertiary">All roads are currently clear.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* BottomNavBar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 pb-safe h-16 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
        <MobileNavItem icon={<MapIcon className="w-6 h-6" />} label="Map" onClick={() => setActiveTab('map')} active={activeTab === 'map'} />
        <MobileNavItem icon={<NavIcon className="w-6 h-6" />} label="Routes" onClick={() => setActiveTab('routes')} active={activeTab === 'routes'} />
        <MobileNavItem icon={<Users className="w-6 h-6" />} label="Crowd" onClick={() => setActiveTab('crowd')} active={activeTab === 'crowd'} />
        <MobileNavItem icon={<Bike className="w-6 h-6" />} label="Bike" onClick={() => setActiveTab('bike')} active={activeTab === 'bike'} />
      </nav>
    </div>
  );
}

function FilterToggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <span>{label}</span>
      <div className={`w-3 h-3 rounded-full border-2 ${active ? 'bg-blue-600 border-blue-700' : 'border-slate-300'}`}></div>
    </button>
  );
}

function MobileNavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex flex-col items-center justify-center px-3 py-1 font-space text-[10px] font-medium transition-all rounded-xl cursor-pointer ${active ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function HubCard({ title, desc, available, icon, variant = 'available', tags }: { title: string, desc: string, available: string, icon: React.ReactNode, variant?: 'available' | 'limited', tags: string[] }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 bg-primary-fixed-dim rounded-lg flex items-center justify-center text-primary">
          {icon}
        </div>
        <span className={`${variant === 'available' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-secondary-fixed text-on-secondary-fixed'} text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tight`}>
          {variant === 'available' ? 'Available' : 'Limited'}: {available}
        </span>
      </div>
      <h4 className="font-space font-bold text-md text-on-surface mb-1">{title}</h4>
      <p className="text-xs text-on-surface-variant mb-4">{desc}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <span key={tag} className="flex items-center gap-1 text-[10px] font-bold bg-surface-container px-2 py-1 rounded border border-outline-variant text-on-surface-variant">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
