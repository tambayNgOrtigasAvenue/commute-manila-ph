import { Navigation, Search, Bell, User, LayoutDashboard, AlertTriangle, CreditCard, Bike, MessageSquare, LocateFixed, Layers } from 'lucide-react';
import Link from 'next/link';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

export function NavItem({ icon, label, href, active = false }: NavItemProps) {
  return (
    <Link 
      href={href}
      className={`flex items-center gap-3 px-4 py-3 transition-all cursor-pointer font-space text-sm ${active ? 'bg-blue-100 text-blue-700 font-bold border-l-4 border-blue-700' : 'text-slate-600 hover:bg-slate-200'}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 overflow-y-auto bg-slate-50 w-64 border-r border-slate-200 pt-20">
      <div className="px-6 mb-6">
        <p className="font-space text-lg font-bold text-blue-700">ManilaTransit</p>
        <p className="text-xs text-outline">Reliable Urban Navigation</p>
      </div>
      <nav className="flex-1">
        <NavItem icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" href="/" active={activePath === '/'} />
        <NavItem icon={<AlertTriangle className="w-5 h-5" />} label="Live Alerts" href="/alerts" active={activePath === '/alerts'} />
        <NavItem icon={<CreditCard className="w-5 h-5" />} label="Fare Guide" href="/fares" active={activePath === '/fares'} />
        <NavItem icon={<Bike className="w-5 h-5" />} label="Bicycle Hub" href="/bike" active={activePath === '/bike'} />
        <NavItem icon={<MessageSquare className="w-5 h-5" />} label="Community" href="/community" active={activePath === '/community'} />
      </nav>
      <div className="p-4">
        <button className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all">
          Report Traffic
        </button>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm font-space">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-xl font-bold tracking-tighter text-blue-700">ManilaTransit</Link>
      </div>
      <div className="flex-1 max-w-md mx-8 hidden md:block">
        <div className="relative flex items-center bg-surface-container-low px-4 py-2 rounded-full border border-outline-variant">
          <Search className="w-5 h-5 text-outline mr-2" />
          <input 
            className="bg-transparent border-none focus:ring-0 text-sm w-full outline-none" 
            placeholder="Search..." 
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-slate-50 transition-colors active:scale-95 duration-150 rounded-full">
          <Bell className="w-6 h-6 text-slate-600" />
        </button>
        <button className="p-2 hover:bg-slate-50 transition-colors active:scale-95 duration-150 rounded-full relative">
          <User className="w-6 h-6 text-slate-600" />
        </button>
      </div>
    </header>
  );
}
