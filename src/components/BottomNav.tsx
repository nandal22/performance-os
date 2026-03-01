import { Link, useLocation } from 'react-router-dom';
import { Home, Clock, TrendingUp, Target, Scale, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const TABS = [
  { path: '/',          icon: Home,       label: 'Home'     },
  { path: '/history',   icon: Clock,      label: 'History'  },
  { path: '/progress',  icon: TrendingUp, label: 'Progress' },
  { path: '/goals',     icon: Target,     label: 'Goals'    },
  { path: '/body',      icon: Scale,      label: 'Body'     },
  { path: '/settings',  icon: Settings,   label: 'Settings' },
] as const;

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 bg-background/90 backdrop-blur-2xl border-t border-white/[0.06]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex max-w-lg mx-auto">
        {TABS.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 relative"
            >
              {/* Sliding active background pill */}
              {active && (
                <motion.div
                  layoutId="nav-active-bg"
                  className="absolute inset-x-1.5 top-1 bottom-1 rounded-2xl bg-primary/10"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}

              {/* Icon */}
              <motion.div
                animate={{ scale: active ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                className={`relative z-10 transition-colors duration-150 ${active ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
              </motion.div>

              {/* Label */}
              <span
                className={`text-[10px] font-medium relative z-10 transition-colors duration-150 ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
