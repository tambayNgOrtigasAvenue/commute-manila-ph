import { Sidebar, TopBar } from "@/components/Navigation";
import { AlertTriangle, Clock, MapPin } from "lucide-react";

export default function AlertsPage() {
  const alerts = [
    { id: 1, type: "Heavy Traffic", location: "EDSA Guadalupe", time: "10 mins ago", status: "Critical" },
    { id: 2, type: "Road Closure", location: "España Blvd", time: "30 mins ago", status: "Warning" },
    { id: 3, type: "Accident", location: "C5 Bagong Ilog", time: "1 hour ago", status: "Moderate" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar activePath="/alerts" />
      <main className="pt-20 md:pl-64 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-space text-3xl font-bold mb-6">Live Transit Alerts</h1>
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className="bg-white p-5 rounded-2xl shadow-sm border border-outline-variant flex items-start gap-4 hover:shadow-md transition-all">
                <div className={`p-3 rounded-xl ${alert.status === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-lg">{alert.type}</h3>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${alert.status === 'Critical' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                      {alert.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {alert.location}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {alert.time}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
