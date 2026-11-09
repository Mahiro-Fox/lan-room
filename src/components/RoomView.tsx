import { useEffect, useRef, useState } from "react";
import type { LogEntry, Snapshot } from "../types";
import { shortcutTokens } from "../lib/api";
import { Avatar, formatClock, Spinner } from "./ui";

function LogRow({ entry }: { entry: LogEntry }) {
  if (entry.kind === "system") {
    return (
      <div className="py-1 text-center text-[11px] text-mist-500">{entry.title}</div>
    );
  }
  const sent = entry.kind === "sent";
  return (
    <div className="animate-float-up flex gap-3 rounded-xl p-2 transition hover:bg-white/[0.03]">
      <div className="mt-0.5">
        {sent ? (
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 text-accent">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 19V5M12 5l-6 6M12 5l6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <Avatar nick={entry.nick} size={32} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-mist-50">
            {sent ? "我" : entry.nick}
          </span>
          <span className="shrink-0 text-[11px] text-mist-500">
            {sent ? "发送了通知" : "收到了通知"}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-mist-500">
            {formatClock(entry.ts)}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] text-mist-200">{entry.title}</p>
        {entry.body && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-mist-500">
            {entry.body}
          </p>
        )}
        {sent && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                entry.acks.length > 0
                  ? "bg-accent-3/12 text-accent-3"
                  : "bg-white/[0.06] text-mist-500"
              }`}
            >
              {entry.acks.length > 0
                ? `已回执 ${entry.acks.length}${entry.total > 0 ? `/${entry.total}` : ""}`
                : "等待回执"}
            </span>
            {entry.acks.slice(0, 4).map((n) => (
              <span key={`${entry.id}-${n}`} className="text-[10px] text-mist-500">
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RoomView({
  snap,
  onSend,
  onLeave,
  onOpenSettings,
}: {
  snap: Snapshot;
  onSend: (custom?: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const fire = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSend(showCustom && custom.trim() ? custom : undefined);
      setPulse((p) => p + 1);
      setFlash(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFlash(false), 900);
      if (showCustom) setCustom("");
    } finally {
      setBusy(false);
    }
  };

  const others = snap.members.filter((m) => !m.isMe).length;
  const tokens = shortcutTokens(snap.settings.shortcut);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] leading-tight font-semibold tracking-tight">
                {snap.roomName}
              </h1>
              <span className="rounded-md bg-accent-3/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-3">
                已连接
              </span>
            </div>
            <p className="mt-1 text-xs text-mist-500">
              {snap.members.length} 人在线 · 通知将送达其余 {others} 人
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost h-9 px-3 text-xs" onClick={onOpenSettings}>
            设置
          </button>
          <button className="btn btn-danger h-9 px-3 text-xs" onClick={() => void onLeave()}>
            退出房间
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_284px] gap-4">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="card relative overflow-hidden p-5">
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                flash ? "opacity-100" : "opacity-0"
              }`}
              style={{
                background:
                  "radial-gradient(420px 220px at 50% 60%, rgba(91,216,255,0.16), transparent 70%)",
              }}
            />
            <div className="relative flex items-center gap-6">
              <div className="relative shrink-0">
                <button
                  onClick={() => void fire()}
                  disabled={busy}
                  className="group relative grid h-[136px] w-[136px] place-items-center rounded-full transition-transform duration-150 active:scale-95 disabled:opacity-60"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 30%, #7CE6FF 0%, #4FC8F2 42%, #2F86C9 100%)",
                    boxShadow:
                      "0 18px 46px -14px rgba(79,200,242,.65), inset 0 -6px 16px rgba(6,40,70,.35), inset 0 6px 16px rgba(255,255,255,.35)",
                  }}
                >
                  <span
                    key={pulse}
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent/60 animate-pulse-ring"
                    style={{ opacity: pulse === 0 ? 0 : 1 }}
                  />
                  <span className="flex flex-col items-center gap-1.5 text-[#04222f]">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3.6 11.1 20 4.2l-6.9 16.4-2.4-6.4-7.1-3.1z"
                        fill="currentColor"
                        fillOpacity="0.95"
                      />
                      <path
                        d="m10.7 14.2 9.3-10-11.5 6.2"
                        stroke="#04222f"
                        strokeOpacity="0.35"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[13px] font-semibold tracking-wide">
                      {busy ? "发送中" : "发送通知"}
                    </span>
                  </span>
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-mist-200">
                  点一下，整个房间都会收到 Windows 通知
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-mist-500">全局快捷键</span>
                  {tokens.map((t) => (
                    <span key={t} className="kbd">
                      {t}
                    </span>
                  ))}
                  <span className="text-[11px] text-mist-500">· 窗口最小化到托盘也生效</span>
                </div>

                <button
                  className="mt-3 text-[11px] text-accent/90 underline-offset-4 hover:underline"
                  onClick={() => setShowCustom((v) => !v)}
                >
                  {showCustom ? "收起自定义内容" : "自定义这一次的通知内容"}
                </button>

                {showCustom && (
                  <div className="animate-in mt-2">
                    <textarea
                      className="input h-[62px] resize-none py-2 leading-relaxed"
                      placeholder="留空则使用设置里的默认内容"
                      maxLength={200}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void fire();
                        }
                      }}
                    />
                    <p className="mt-1 text-[10px] text-mist-500">Ctrl + Enter 快速发送</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card flex min-h-0 flex-1 flex-col p-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[13px] font-semibold tracking-tight">活动记录</h3>
              <span className="text-[11px] text-mist-500">{snap.log.length} 条</span>
            </div>
            <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {snap.log.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-mist-500">
                  还没有任何通知
                </div>
              ) : (
                snap.log.map((entry) => <LogRow key={entry.id} entry={entry} />)
              )}
            </div>
          </div>
        </div>

        <div className="card flex min-h-0 flex-col p-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[13px] font-semibold tracking-tight">成员</h3>
            <span className="text-[11px] text-mist-500">{snap.members.length}</span>
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {snap.members.map((m) => (
              <div
                key={m.cid}
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 transition hover:bg-white/[0.03]"
              >
                <Avatar nick={m.nick} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-mist-50">{m.nick}</p>
                </div>
                {m.isHost && (
                  <span className="rounded bg-amber-300/12 px-1.5 py-0.5 text-[10px] text-amber-200/90">
                    房主
                  </span>
                )}
                {m.isMe && (
                  <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-mist-400">
                    我
                  </span>
                )}
              </div>
            ))}
            {snap.members.length <= 1 && (
              <p className="px-1.5 pt-2 text-[11px] leading-relaxed text-mist-500">
                房间里暂时只有你。等其他人加入后，他们也会出现在这里。
              </p>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[10px] leading-relaxed text-mist-500">
              回执
              {snap.settings.sendReceipt ? "已开启" : "已关闭"}：对方收到通知后会回传一条确认，
              你会在活动记录里看到「已回执」。
              {snap.settings.sendReceipt ? " 同时会弹一条系统回执通知。" : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoomLoading() {
  return (
    <div className="grid h-full place-items-center text-mist-500">
      <Spinner size={18} />
    </div>
  );
}
