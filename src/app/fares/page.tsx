import { Sidebar, TopBar } from "@/components/Navigation";
import { Bus, Train, Car, Info } from "lucide-react";

export default function FaresPage() {
  const fareRates = [
    { type: "Traditional Jeepney", base: 14, extra: 1.50, desc: "First 4km base fare" },
    { type: "Modern Jeepney", base: 17, extra: 1.80, desc: "First 4km base fare" },
    { type: "Ordinary Bus", base: 15, extra: 2.25, desc: "First 5km base fare" },
    { type: "Aircon Bus", base: 18, extra: 2.65, desc: "First 5km base fare" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar activePath="/fares" />
      <main className="pt-20 md:pl-64 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-space text-3xl font-bold mb-2">Fare Guide 2026</h1>
          <p className="text-on-surface-variant mb-8 font-inter">Official LTFRB rates for public transportation in Metro Manila.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fareRates.map((fare) => (
              <div key={fare.type} className="bg-white p-6 rounded-2xl shadow-sm border border-outline-variant hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-xl">{fare.type}</h3>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">P{fare.base.toFixed(2)}</span>
                    <p className="text-[10px] text-outline font-bold uppercase tracking-widest">Base Fare</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                    <span className="text-on-surface-variant">Distance Coverage</span>
                    <span className="font-semibold text-on-surface">{fare.desc.split(' ')[1]}</span>
                  </div>
                  <div className="flex justify-between text-sm py-2 border-b border-slate-50">
                    <span className="text-on-surface-variant">Succeeding km</span>
                    <span className="font-semibold text-on-surface">P{fare.extra.toFixed(2)}/km</span>
                  </div>
                </div>
                <div className="mt-6 flex items-start gap-2 text-xs text-blue-600 bg-blue-50 p-3 rounded-lg">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>Fare discounts apply to students, seniors, and PWDs (20% off).</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-surface-container-low p-8 rounded-3xl border border-outline-variant">
            <h2 className="font-space text-2xl font-bold mb-4">Railway Rates</h2>
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl flex justify-between items-center border border-outline-variant">
                <div className="flex items-center gap-3">
                  <Train className="w-5 h-5 text-blue-700" />
                  <span className="font-bold">MRT-3 (EDSA)</span>
                </div>
                <span className="font-inter font-bold">P13.00 - P28.00</span>
              </div>
              <div className="bg-white p-4 rounded-xl flex justify-between items-center border border-outline-variant">
                <div className="flex items-center gap-3">
                  <Train className="w-5 h-5 text-green-700" />
                  <span className="font-bold">LRT-1 (North-South)</span>
                </div>
                <span className="font-inter font-bold">P15.00 - P35.00</span>
              </div>
              <div className="bg-white p-4 rounded-xl flex justify-between items-center border border-outline-variant">
                <div className="flex items-center gap-3">
                  <Train className="w-5 h-5 text-purple-700" />
                  <span className="font-bold">LRT-2 (East-West)</span>
                </div>
                <span className="font-inter font-bold">P15.00 - P35.00</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
