import { signInWithGoogle } from '@/hooks/useAuth';
import { toast } from 'sonner';

const MODERNIST = {
  ground: '#f3f2f2',
  ink: '#201e1d',
  accent: '#ec3013',
  muted: 'rgba(32,30,29,0.55)',
};

// Monochrome mark: the palette carries one hot colour, and Google's four would
// be the only other hues on the screen. Matches the hub and the other tools.
const GoogleMark = () => (
  <span
    className="flex h-[26px] w-[26px] flex-none items-center justify-center"
    style={{ background: MODERNIST.ground }}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={MODERNIST.ink}
        d="M21.35 11.1H12v2.9h5.3c-.25 1.4-1.8 4.1-5.3 4.1a5.9 5.9 0 1 1 0-11.8c1.6 0 2.9.62 3.6 1.28l2.2-2.13A9 9 0 1 0 12 21c5.2 0 8.6-3.65 8.6-8.8 0-.6-.08-1.05-.25-1.1Z"
      />
    </svg>
  </span>
);

// The feature list this screen used to carry ("Log — gym, cult session,
// swimming, run"…) was pitching the app to its only user, who owns it and
// built it. Same quiet layout as the hub and the other tools instead.
export default function LoginPage() {
  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch {
      toast.error('Sign in failed. Try again.');
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col justify-between px-6 py-10 md:px-10"
      style={{ background: MODERNIST.ground, color: MODERNIST.ink }}
    >
      <header className="text-[11px] font-800 uppercase tracking-[0.14em]">sachinnandal.me</header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-[380px] py-10">
        <div
          className="mb-2.5 flex h-12 w-12 items-center justify-center text-[19px] font-800"
          style={{ border: `2px solid ${MODERNIST.ink}` }}
        >
          PO
        </div>
        <h1 className="mb-1.5 text-[32px] font-800 leading-[1.05] tracking-[-0.035em]">
          Performance OS
        </h1>
        <p className="mb-8 text-[15px]" style={{ color: MODERNIST.muted }}>
          Your training log.
        </p>

        <button
          onClick={handleLogin}
          className="flex h-14 w-full items-center gap-3 px-[18px] text-left font-800 transition-colors"
          style={{
            border: `2px solid ${MODERNIST.ink}`,
            background: MODERNIST.ink,
            color: MODERNIST.ground,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = MODERNIST.accent;
            e.currentTarget.style.borderColor = MODERNIST.accent;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = MODERNIST.ink;
            e.currentTarget.style.borderColor = MODERNIST.ink;
          }}
        >
          <GoogleMark />
          <span className="flex-1">Continue with Google</span>
        </button>
        </div>
      </main>

      <footer className="text-[11px] uppercase tracking-[0.1em]" style={{ color: MODERNIST.muted }}>
        Private
      </footer>
    </div>
  );
}
