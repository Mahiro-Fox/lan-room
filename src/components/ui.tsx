import type { ReactNode } from "react";

export function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function initials(nick: string): string {
  const trimmed = nick.trim();
  if (!trimmed) return "?";
  const chars = Array.from(trimmed);
  return chars.length > 1 && /[\u4e00-\u9fa5]/.test(chars[0]) ? chars[0] : chars[0].toUpperCase();
}

export function Avatar({
  nick,
  size = 36,
  ring = false,
}: {
  nick: string;
  size?: number;
  ring?: boolean;
}) {
  const hue = hashHue(nick);
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-ink-950 ${
        ring ? "ring-2 ring-white/20" : ""
      }`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.4),
        background: `linear-gradient(140deg, hsl(${hue} 88% 68%), hsl(${(hue + 46) % 360} 78% 46%))`,
      }}
      title={nick}
    >
      {initials(nick)}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.04]"
    >
      <span
        className={`relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-ink-600"
        }`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? "left-[19px]" : "left-[3px]"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-mist-50">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">{hint}</span>}
      </span>
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-mist-500">{hint}</span>}
    </label>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="10" y1="46" x2="54" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EEAD4" />
          <stop offset="0.55" stopColor="#5BD8FF" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <path
        d="M6 40a38 38 0 0 1 52 0"
        stroke="url(#lg)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M16 50a24 24 0 0 1 32 0"
        stroke="url(#lg)"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.82"
      />
      <circle cx="32" cy="58" r="4.5" fill="url(#lg)" />
    </svg>
  );
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/25 border-t-white/90"
      style={{ width: size, height: size }}
    />
  );
}
