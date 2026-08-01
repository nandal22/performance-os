import { Link, useLocation } from 'react-router-dom';
import { Home, TrendingUp, Scale, Settings } from 'lucide-react';

const TABS = [
  { path: '/',          icon: Home,       label: 'Home'     },
  { path: '/progress',  icon: TrendingUp, label: 'Progress' },
  { path: '/weight',    icon: Scale,      label: 'Weight'   },
  { path: '/settings',  icon: Settings,   label: 'Settings' },
] as const;

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20"
      style={{ background: '#f3f2f2', borderTop: '2px solid #201e1d', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex max-w-lg mx-auto overflow-x-auto no-scrollbar">
        {TABS.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className="min-w-[48px] flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              style={{ minHeight: 44, background: active ? '#201e1d' : 'transparent', color: active ? '#f3f2f2' : '#201e1d' }}
            >
              <Icon className="w-5 h-5" strokeWidth={2.4} />
              <span className="text-[10px] font-800 uppercase tracking-[0.04em]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
