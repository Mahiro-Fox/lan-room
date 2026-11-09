import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { on } from "./lib/events";
import { api } from "./lib/api";
import type { Notice, Settings, Snapshot, UpdateInfo } from "./types";
import { Welcome } from "./components/Welcome";
import { Lobby } from "./components/Lobby";
import { RoomView } from "./components/RoomView";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { Logo, Spinner } from "./components/ui";

type Progress = { downloaded: number; total?: number | null; done?: boolean };

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(
    () =>
      import.meta.env.VITE_MOCK === "1" &&
      new URLSearchParams(location.search).get("settings") === "1",
  );
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const notify = useCallback((kind: Notice["kind"], text: string) => {
    setNotice({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let disposed = false;
    const subs: Promise<UnlistenFn>[] = [];

    api
      .bootstrap()
      .then((s) => !disposed && setSnap(s))
      .catch((e) => !disposed && setFatal(String(e)));

    subs.push(on<Snapshot>("snapshot", (p) => setSnap(p)));
    subs.push(on<string>("notice", (p) => notify("info", p)));
    subs.push(
      on<string>("toast-error", (p) => notify("error", `系统通知没有弹出来：${p}`)),
    );
    subs.push(on<string>("navigate", () => setSettingsOpen(true)));
    subs.push(on<UpdateInfo>("update-available", (p) => setUpdate(p)));
    subs.push(on<Progress>("update-progress", (p) => setProgress(p)));

    return () => {
      disposed = true;
      subs.forEach((p) => void p.then((un) => un()).catch(() => undefined));
    };
  }, [notify]);

  const run = useCallback(
    async (fn: () => Promise<Snapshot>) => {
      try {
        setSnap(await fn());
      } catch (e) {
        notify("error", String(e));
      }
    },
    [notify],
  );

  const saveSettings = useCallback(
    async (next: Settings) => {
      const s = await api.saveSettings(next);
      setSnap(s);
      notify("success", "设置已保存");
    },
    [notify],
  );

  const checkUpdate = useCallback(async () => {
    const info = await api.checkUpdate();
    setUpdate(info);
    return info;
  }, []);

  const installUpdate = useCallback(async () => {
    try {
      await api.installUpdate();
    } catch (e) {
      notify("error", String(e));
    }
  }, [notify]);

  if (fatal) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="card max-w-md p-6 text-center">
          <p className="text-sm text-danger">启动失败</p>
          <p className="mt-2 text-xs leading-relaxed text-mist-400">{fatal}</p>
          <button className="btn btn-ghost mt-4 w-full" onClick={() => location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-2 text-xs text-mist-500">
          <Spinner size={14} />
          正在接入局域网…
        </div>
      </div>
    );
  }

  const body = !snap.settings.nickname ? (
    <Welcome
      initial={snap.settings.nickname}
      version={snap.version}
      onSubmit={async (nick) => {
        try {
          const s = await api.saveSettings({ ...snap.settings, nickname: nick });
          setSnap(s);
        } catch (e) {
          notify("error", String(e));
        }
      }}
    />
  ) : snap.roomId ? (
    <RoomView
      snap={snap}
      onSend={async (custom) => {
        await run(() => api.send(custom));
      }}
      onLeave={async () => {
        await run(() => api.leaveRoom());
      }}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  ) : (
    <Lobby
      snap={snap}
      onCreate={async (name) => {
        await run(() => api.createRoom(name));
      }}
      onJoin={async (id) => {
        await run(() => api.joinRoom(id));
      }}
      onRefresh={() => void run(() => api.refresh())}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between px-6 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Logo size={26} />
          <div>
            <p className="text-[15px] leading-none font-semibold tracking-tight">LanRoom</p>
            <p className="mt-1 text-[11px] text-mist-500">局域网通知房间</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {update && (
            <button
              className="flex h-8 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.08] px-2.5 text-[11px] text-accent transition hover:bg-accent/[0.14]"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              新版本 v{update.version}
            </button>
          )}
          <div className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                snap.roomId ? "bg-accent-3" : "bg-mist-500"
              }`}
            />
            <span className="font-mono text-[11px] text-mist-400">
              {snap.localIp} · {snap.port}
            </span>
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-mist-400 transition hover:border-white/15 hover:text-mist-50"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M19.4 13.6a7.9 7.9 0 0 0 0-3.2l1.7-1.3-1.9-3.3-2 .8a7.9 7.9 0 0 0-2.8-1.6L14.1 2H9.9l-.3 2.9a7.9 7.9 0 0 0-2.8 1.6l-2-.8L2.9 9l1.7 1.3a7.9 7.9 0 0 0 0 3.2L2.9 15l1.9 3.3 2-.8a7.9 7.9 0 0 0 2.8 1.6l.3 2.9h4.2l.3-2.9a7.9 7.9 0 0 0 2.8-1.6l2 .8 1.9-3.3-1.7-1.4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-6 pb-5">{body}</main>

      {settingsOpen && (
        <SettingsDrawer
          snap={snap}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          update={update}
          onCheckUpdate={checkUpdate}
          onInstallUpdate={installUpdate}
          progress={progress}
        />
      )}

      {notice && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div
            className={`animate-in flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] shadow-2xl backdrop-blur-xl ${
              notice.kind === "error"
                ? "border-danger/30 bg-[#2a0f18]/95 text-danger"
                : notice.kind === "success"
                  ? "border-accent-3/30 bg-[#0c2320]/95 text-accent-3"
                  : "border-white/12 bg-ink-800/95 text-mist-200"
            }`}
          >
            {notice.text}
          </div>
        </div>
      )}
    </div>
  );
}
