import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Settings, Snapshot, UpdateInfo } from "../types";
import { api, shortcutFromEvent, shortcutTokens } from "../lib/api";
import { Field, Logo, Spinner, Toggle } from "./ui";

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-white/[0.06] px-5 py-5">
      <h3 className="text-[13px] font-semibold tracking-tight text-mist-50">{title}</h3>
      {desc && <p className="mt-1 text-xs leading-relaxed text-mist-500">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setHint(null);
        return;
      }
      const combo = shortcutFromEvent(e);
      if (combo) {
        onChangeRef.current(combo);
        setRecording(false);
        setHint(null);
      } else {
        setHint("还需要一个主键：字母、数字或 F1–F24");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  const tokens = shortcutTokens(value);

  return (
    <div>
      <button
        type="button"
        onClick={() => setRecording((v) => !v)}
        className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 transition ${
          recording
            ? "border-accent/70 bg-accent/[0.08] ring-4 ring-accent/10"
            : "border-white/10 bg-ink-850 hover:border-white/20"
        }`}
      >
        {recording ? (
          <span className="text-sm text-accent">请按下新的快捷键组合…</span>
        ) : (
          <span className="flex items-center gap-1.5">
            {tokens.map((t) => (
              <span key={t} className="kbd">
                {t}
              </span>
            ))}
            {tokens.length === 0 && (
              <span className="text-sm text-mist-500">未设置</span>
            )}
          </span>
        )}
        <span className="text-[11px] text-mist-500">
          {recording ? "Esc 取消" : "点击修改"}
        </span>
      </button>
      <p className="mt-1.5 text-[11px] text-mist-500">
        {hint ?? "至少包含一个修饰键（Ctrl / Alt / Shift / Win），建议不要与系统截图等常用组合冲突。"}
      </p>
    </div>
  );
}

export function SettingsDrawer({
  snap,
  onClose,
  onSave,
  update,
  onCheckUpdate,
  onInstallUpdate,
  progress,
}: {
  snap: Snapshot;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
  update: UpdateInfo | null;
  onCheckUpdate: () => Promise<UpdateInfo | null>;
  onInstallUpdate: () => Promise<void>;
  progress: { downloaded: number; total?: number | null; done?: boolean } | null;
}) {
  const [draft, setDraft] = useState<Settings>(snap.settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 只在「已保存的设置」真正变化时同步草稿，避免成员变动等快照刷新打断输入
  const savedKey = JSON.stringify(snap.settings);
  useEffect(() => {
    setDraft(snap.settings);
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(snap.settings),
    [draft, snap.settings],
  );

  const patch = useCallback((p: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
    setError(null);
  }, []);

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await api.testNotification();
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const info = await onCheckUpdate();
      setCheckMsg(info ? `发现新版本 v${info.version}` : "当前已是最新版本");
    } catch (e) {
      setCheckMsg(String(e));
    } finally {
      setChecking(false);
    }
  };

  const pct =
    progress && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="animate-in relative flex h-full w-[452px] flex-col border-l border-white/10 bg-ink-900/95 shadow-[-30px_0_80px_-40px_rgba(0,0,0,0.9)]"
        style={{ animationDuration: "0.18s" }}
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
            <h2 className="text-sm font-semibold tracking-tight">设置</h2>
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-mist-400 transition hover:bg-white/[0.06] hover:text-mist-50"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="身份" desc="这个昵称会显示在房间成员列表与通知里。">
            <Field label="昵称">
              <input
                className="input"
                maxLength={24}
                value={draft.nickname}
                onChange={(e) => patch({ nickname: e.target.value })}
                placeholder="必填"
              />
            </Field>
          </Section>

          <Section
            title="全局快捷键"
            desc="窗口最小化到托盘后依然生效，按下即向当前房间发送通知。"
          >
            <ShortcutRecorder value={draft.shortcut} onChange={(v) => patch({ shortcut: v })} />
            <button
              className="text-[11px] text-accent/90 underline-offset-4 hover:underline"
              onClick={() => patch({ shortcut: "Ctrl+Alt+D" })}
            >
              恢复默认 Ctrl+Alt+D
            </button>
          </Section>

          <Section
            title="通知内容"
            desc="接收方看到的 Windows 通知文案。支持占位符：{nick} 发送者、{room} 房间名、{time} 时间。"
          >
            <Field label="通知标题">
              <input
                className="input"
                maxLength={64}
                value={draft.notifyTitle}
                onChange={(e) => patch({ notifyTitle: e.target.value })}
              />
            </Field>
            <Field label="通知正文">
              <textarea
                className="input h-[74px] resize-none py-2 leading-relaxed"
                maxLength={200}
                value={draft.notifyBody}
                onChange={(e) => patch({ notifyBody: e.target.value })}
              />
            </Field>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost h-9 px-3 text-xs" onClick={() => void test()}>
                {testing ? <Spinner size={12} /> : null}
                发送测试通知
              </button>
              <span className="text-[11px] text-mist-500">用于确认系统通知是否正常</span>
            </div>
          </Section>

          <Section title="行为">
            <Toggle
              checked={draft.sendReceipt}
              onChange={(v) => patch({ sendReceipt: v })}
              label="接收执行回执"
              hint="对方收到通知后回传确认，你会额外收到一条系统回执通知。"
            />
            <Toggle
              checked={draft.closeToTray}
              onChange={(v) => patch({ closeToTray: v })}
              label="关闭窗口时最小化到托盘"
              hint="关闭后仍会在托盘运行，快捷键继续生效。"
            />
            <Toggle
              checked={draft.autoCheckUpdate}
              onChange={(v) => patch({ autoCheckUpdate: v })}
              label="启动时自动检查更新"
              hint="从 GitHub Release 拉取最新版本。"
            />
          </Section>

          <Section title="版本与更新">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <div>
                <p className="text-[13px] text-mist-50">LanRoom v{snap.version}</p>
                <p className="mt-0.5 text-[11px] text-mist-500">
                  {update ? `可更新至 v${update.version}` : "已安装版本"}
                </p>
              </div>
              <button
                className="btn btn-ghost h-8 px-3 text-xs"
                disabled={checking}
                onClick={() => void check()}
              >
                {checking ? <Spinner size={12} /> : null}
                检查更新
              </button>
            </div>
            {checkMsg && <p className="text-[11px] text-mist-400">{checkMsg}</p>}
            {update && (
              <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
                <p className="text-[12px] font-medium text-accent">
                  新版本 v{update.version} 可用
                </p>
                {update.notes && (
                  <p className="mt-1 max-h-20 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap text-mist-400">
                    {update.notes}
                  </p>
                )}
                <button
                  className="btn btn-primary mt-3 h-9 w-full text-xs"
                  onClick={() => void onInstallUpdate()}
                >
                  下载并安装更新
                </button>
                {progress && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: pct === null ? "35%" : `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-mist-500">
                      {pct === null ? "正在下载…" : `下载中 ${pct}%`} · 安装完成后会自动重启
                    </p>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="关于">
            <p className="text-[11px] leading-relaxed text-mist-500">
              LanRoom 通过在局域网内广播 UDP 包来发现房间与发送通知，不经过任何服务器，
              内容不会离开你的网络。发现端口 {snap.port}，本机地址 {snap.localIp}。
            </p>
          </Section>
        </div>

        <footer className="border-t border-white/[0.06] px-5 py-4">
          {error && (
            <p className="mb-2 rounded-lg border border-danger/25 bg-danger/[0.08] px-3 py-2 text-[11px] text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>
              关闭
            </button>
            <button
              className="btn btn-primary flex-1"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? <Spinner /> : null}
              {saved ? "已保存" : dirty ? "保存更改" : "无更改"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
