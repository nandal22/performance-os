import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';

const CLIENT_ID_KEY = 'perf-os-client-id';
const HEARTBEAT_KEY = 'perf-os-workout-heartbeat';
const CHANNEL_NAME = 'perf-os-workout-session';
const HEARTBEAT_MS = 25000;
const PEER_STALE_MS = 90000;

type WakeLockState = 'active' | 'released' | 'unsupported' | 'blocked';

interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
};

interface WorkoutHeartbeat {
  type: 'workout-heartbeat';
  clientId: string;
  sessionKey: string;
  updatedAt: number;
}

export interface WorkoutReliabilityState {
  online: boolean;
  wakeLock: WakeLockState;
  otherTabs: number;
  lastPulseAt: number | null;
}

function getClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function readHeartbeat(): WorkoutHeartbeat | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(HEARTBEAT_KEY) ?? 'null');
    if (
      parsed &&
      parsed.type === 'workout-heartbeat' &&
      typeof parsed.clientId === 'string' &&
      typeof parsed.sessionKey === 'string' &&
      typeof parsed.updatedAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    localStorage.removeItem(HEARTBEAT_KEY);
  }
  return null;
}

export function useWorkoutReliability(enabled: boolean, sessionKey: string): WorkoutReliabilityState {
  const [clientId] = useState(() => getClientId());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [wakeLock, setWakeLock] = useState<WakeLockState>(() => ('wakeLock' in navigator ? 'released' : 'unsupported'));
  const [lastPulseAt, setLastPulseAt] = useState<number | null>(null);
  const [peerTouches, setPeerTouches] = useState<Record<string, number>>({});
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) {
      return undefined;
    }

    let cancelled = false;

    const requestWakeLock = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        wakeLockRef.current = await nav.wakeLock?.request('screen') ?? null;
        if (cancelled) {
          await wakeLockRef.current?.release();
          return;
        }
        setWakeLock(wakeLockRef.current?.released ? 'released' : 'active');
        wakeLockRef.current?.addEventListener('release', () => setWakeLock('released'));
      } catch {
        setWakeLock('blocked');
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

    const publish = async () => {
      const heartbeat: WorkoutHeartbeat = {
        type: 'workout-heartbeat',
        clientId,
        sessionKey,
        updatedAt: Date.now(),
      };
      localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(heartbeat));
      channel?.postMessage(heartbeat);
      setLastPulseAt(heartbeat.updatedAt);
      await supabase.auth.getSession().catch(() => undefined);
    };

    const consume = (heartbeat: WorkoutHeartbeat | null) => {
      if (!heartbeat || heartbeat.sessionKey !== sessionKey || heartbeat.clientId === clientId) return;
      setPeerTouches(prev => ({ ...prev, [heartbeat.clientId]: heartbeat.updatedAt }));
    };

    channel?.addEventListener('message', event => {
      const heartbeat = event.data as WorkoutHeartbeat;
      if (heartbeat?.type === 'workout-heartbeat') consume(heartbeat);
    });

    consume(readHeartbeat());
    void publish();
    const interval = window.setInterval(() => {
      void publish();
      const now = Date.now();
      setPeerTouches(prev => Object.fromEntries(
        Object.entries(prev).filter(([, touchedAt]) => now - touchedAt < PEER_STALE_MS),
      ));
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(interval);
      channel?.close();
    };
  }, [clientId, enabled, sessionKey]);

  const otherTabs = useMemo(() => Object.keys(peerTouches).length, [peerTouches]);

  return { online, wakeLock, otherTabs, lastPulseAt };
}
