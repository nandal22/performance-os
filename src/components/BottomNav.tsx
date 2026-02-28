import { Link, useLocation } from 'react-router-dom';
import { Home, Clock, Moon, BarChart2, Target } from 'lucide-react';

const TABS = [
  { path: '/',          icon: Home,      label: 'Home'    },
  { path: '/history',   icon: Clock,     label: 'History' },
  { path: '/sleep',     icon: Moon,      label: 'Sleep'   },
  { path: '/analytics', icon: BarChart2, label: 'Stats'   },
  { path: '/goals',     icon: Target,    label: 'Goals'   },
] as const;

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex max-w-lg mx-auto">
        {TABS.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
