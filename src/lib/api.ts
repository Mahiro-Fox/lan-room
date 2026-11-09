import { invoke } from "@tauri-apps/api/core";
import type { Settings, Snapshot, UpdateInfo } from "../types";
import { mock } from "./mock";

/** VITE_MOCK=1 时用假数据跑纯前端预览，生产构建下该分支会被移除 */
const MOCK = import.meta.env.VITE_MOCK === "1";

export const api = {
  bootstrap: () => (MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("bootstrap")),
  refresh: () => (MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("refresh")),
  saveSettings: (next: Settings) =>
    MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("save_settings", { next }),
  createRoom: (name: string) =>
    MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("create_room", { name }),
  joinRoom: (roomId: string) =>
    MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("join_room", { roomId }),
  leaveRoom: () => (MOCK ? Promise.resolve(mock.snapshot()) : invoke<Snapshot>("leave_room")),
  send: (body?: string) =>
    MOCK
      ? Promise.resolve(mock.send())
      : invoke<Snapshot>("send_notification", { body: body && body.trim() ? body : null }),
  testNotification: () => (MOCK ? Promise.resolve() : invoke<void>("test_notification")),
  hideWindow: () => (MOCK ? Promise.resolve() : invoke<void>("hide_window")),
  quit: () => (MOCK ? Promise.resolve() : invoke<void>("quit_app")),
  checkUpdate: () =>
    MOCK
      ? Promise.resolve(null)
      : invoke<UpdateInfo | null>("check_update"),
  installUpdate: () => (MOCK ? Promise.resolve() : invoke<void>("install_update")),
};

/** 把 "Ctrl+Alt+D" 拆成标签，便于渲染 */
export function shortcutTokens(value: string): string[] {
  if (!value) return [];
  return value
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const k = s.toLowerCase();
      if (k === "control" || k === "ctrl") return "Ctrl";
      if (k === "alt") return "Alt";
      if (k === "shift") return "Shift";
      if (k === "win" || k === "super" || k === "meta") return "Win";
      return s.length === 1 ? s.toUpperCase() : s;
    });
}

const KEY_ALIAS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
};

/** 从键盘事件推导出可写入设置的快捷键字符串 */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Win");

  const code = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (KEY_ALIAS[code]) key = KEY_ALIAS[code];

  if (!key) return null;
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}
