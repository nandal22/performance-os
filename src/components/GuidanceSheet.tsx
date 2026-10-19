import type { Guidance } from '@/services/plans';

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const MUTED = 'rgba(32,30,29,0.55)';

export default function GuidanceSheet({
  name,
  guidance,
  onClose,
}: {
  name: string;
  guidance: Guidance | null;
  onClose: () => void;
}) {
  const frames = guidance?.image_urls?.slice(0, 2) ?? [];
  return (
    <div className="sheet-overlay z-[70]">
      <div className="sheet-safe-bar" aria-hidden="true" />
      <div className="sheet-stage">
        <button type="button" aria-label="Close guidance" className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          className="sheet-panel relative max-w-lg mx-auto"
          style={{ background: GROUND, color: INK, border: `2px solid ${INK}` }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <h2 className="text-base font-800">{name}</h2>
            <button type="button" onClick={onClose} className="min-h-11 min-w-11 text-sm font-800">Close</button>
          </div>
          <div className="overflow-y-auto px-4 py-4 space-y-4">
            {frames.length > 0 && (
              <div className="relative h-52" style={{ border: `2px solid ${INK}`, background: '#eae9e9' }}>
                {frames.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    className="motion-media-frame object-contain"
                    style={{ animationDuration: '1.6s', animationDelay: index === 0 ? '0s' : '0.8s' }}
                  />
                ))}
              </div>
            )}
            {guidance ? (
              <>
                <Cue label="Setup" text={guidance.setup} />
                <Cue label="Movement" text={guidance.movement} />
                <Cue label="Common mistakes" text={guidance.common_mistakes} />
                {guidance.video_url && (
                  <a href={guidance.video_url} className="inline-flex min-h-11 items-center text-sm font-800" style={{ color: '#ae1800' }}>
                    Watch video
                  </a>
                )}
                {guidance.source && (
                  <p className="text-[11px]" style={{ color: MUTED }}>{guidance.source} · {guidance.license}</p>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: MUTED }}>No guidance for this exercise yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cue({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>{label}</p>
      <p className="text-sm mt-1">{text}</p>
    </div>
  );
}
