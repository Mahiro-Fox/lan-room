import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const MOCK = import.meta.env.VITE_MOCK === "1";

/** 统一的 Tauri 事件订阅；非 Tauri 环境（预览模式）下静默失效 */
export async function on<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  if (MOCK) return () => undefined;
  return listen<T>(event, (e) => cb(e.payload));
}
