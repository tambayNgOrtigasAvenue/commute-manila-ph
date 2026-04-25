import { Sidebar, TopBar } from "@/components/Navigation";
import { Bike, MapPin, Shield, Wrench, Info } from "lucide-react";

export default function BikeHubPage() {
  const hubs = [
    {
      id: 1,
      name: "MRT-3 Ayala Station",
      location: "Ayala Ave, Makati",
      capacity: "12/40 slots available",
      features: ["24/7 CCTV", "Covered Rack", "Guard on Duty"],
      status: "Available"
    },
    {
      id: 2,
      name: "SM North EDSA",
      location: "North Ave, Quezon City",
      capacity: "3/50 slots available",
      features: ["Basic Repair Tools", "Guarded", "Charging Station"],
      status: "Limited"
    },
    {
      id: 3,
      name: "BGC High Street Hub",
      location: "7th Ave, Taguig",
      capacity: "25/30 slots available",
      features: ["Premium Locker", "Shower Access", "Secure Lock"],
      status: "Available"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar activePath="/bike" />
      <main className="pt-20 md:pl-64 p-6 text-on-surface">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="font-space text-3xl font-bold">Secure Bicycle Hubs</h1>
              <p className="text-on-surface-variant font-inter">Find safe parking and repair stations for your mixed-mode commute.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {hubs.map((hub) => (
              <div key={hub.id} className="bg-white rounded-3xl border border-outline-variant p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-primary-fixed-dim rounded-2xl flex items-center justify-center text-primary">
                    <Bike className="w-7 h-7" />
                  </div>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${
                    hub.status === 'Available' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-secondary-fixed text-on-secondary-fixed'
                  }`}>
                    {hub.status}: {hub.capacity.split(' ')[0]}
                  </span>
                </div>
                
                <h3 className="font-space text-xl font-bold mb-1">{hub.name}</h3>
                <div className="flex items-center gap-1 text-xs text-outline mb-4">
                  <MapPin className="w-3 h-3" />
                  {hub.location}
                </div>

                <div className="space-y-2 mb-6">
                  {hub.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/30">
                      {feature.includes('CCTV') || feature.includes('Guard') ? <Shield className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                      {feature}
                    </div>
                  ))}
                </div>

                <button className="w-full py-2.5 bg-surface-container text-on-surface rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors">
                  Get Directions
                </button>
              </div>
            ))}
          </div>

          <div className="bg-blue-600 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="font-space text-2xl font-bold mb-2">Pedal-to-Transit Program</h2>
              <p className="text-blue-100 mb-6 text-sm max-w-lg">Did you know? Folding bikes are allowed inside all Manila rail lines (MRT/LRT) anytime. Standard bikes are allowed during off-peak hours.</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-xs bg-blue-500/50 px-4 py-2 rounded-full backdrop-blur-sm">
                  <Info className="w-4 h-4" />
                  Off-peak: 9AM - 4PM
                </div>
                <div className="flex items-center gap-2 text-xs bg-blue-500/50 px-4 py-2 rounded-full backdrop-blur-sm">
                  <Info className="w-4 h-4" />
                  Weekends: All day
                </div>
              </div>
            </div>
            <Bike className="absolute -right-10 -bottom-10 w-64 h-64 text-blue-500/30 rotate-12" />
          </div>
        </div>
      </main>
    </div>
  );
}
