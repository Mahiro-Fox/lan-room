import { useState } from "react";
import type { Room, Snapshot } from "../types";
import { Avatar, Spinner } from "./ui";

function relative(ts: number): string {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚创建";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  return `${Math.floor(hour / 24)} 天前`;
}

function RoomCard({
  room,
  onJoin,
  busy,
}: {
  room: Room;
  onJoin: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-200 hover:border-accent/35 hover:bg-white/[0.05]">
      <div className="pointer-events-none absolute -top-16 -right-10 h-32 w-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-mist-50">
              {room.name || "未命名房间"}
            </h3>
            <span className="shrink-0 rounded-md bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {room.memberCount} 人
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-mist-500">
            房主 {room.hostNick} · {relative(room.created)}
          </p>
        </div>
        <button
          className="btn btn-primary h-8 shrink-0 px-3 text-xs"
          disabled={busy}
          onClick={() => onJoin(room.id)}
        >
          加入
        </button>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {room.members.slice(0, 5).map((nick, i) => (
          <div key={`${room.id}-${nick}-${i}`} className="-ml-1 first:ml-0">
            <Avatar nick={nick} size={22} ring />
          </div>
        ))}
        {room.memberCount > room.members.length && (
          <span className="ml-1 text-[11px] text-mist-500">
            +{room.memberCount - room.members.length}
          </span>
        )}
      </div>
    </div>
  );
}

export function Lobby({
  snap,
  onCreate,
  onJoin,
  onRefresh,
  onOpenSettings,
}: {
  snap: Snapshot;
  onCreate: (name: string) => Promise<void>;
  onJoin: (id: string) => Promise<void>;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim() || `${snap.settings.nickname} 的房间`);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const join = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onJoin(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[352px_1fr] gap-5">
      {/* 左：身份 + 创建 */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <Avatar nick={snap.settings.nickname} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{snap.settings.nickname}</p>
              <p className="mt-0.5 text-xs text-mist-500">
                {snap.localIp} · UDP {snap.port}
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost mt-4 h-9 w-full text-xs"
            onClick={onOpenSettings}
          >
            修改昵称 / 设置
          </button>
        </div>

        <div className="card flex flex-1 flex-col p-5">
          <h2 className="text-sm font-semibold tracking-tight">创建房间</h2>
          <p className="mt-1 text-xs leading-relaxed text-mist-500">
            同一局域网的朋友会自动看到你的房间，无需填写 IP。
          </p>
          <input
            className="input mt-4"
            placeholder="房间名，例如「设计组」"
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
          <button
            className="btn btn-primary mt-3 w-full"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? <Spinner /> : null}
            创建并进入
          </button>

          <div className="mt-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[11px] leading-relaxed text-mist-500">
              收不到房间？确认大家连的是同一个 Wi-Fi，并在 Windows 防火墙提示时允许 LanRoom
              访问专用网络。发现使用 UDP {snap.port} 端口。
            </p>
          </div>
        </div>
      </div>

      {/* 右：房间列表 */}
      <div className="card flex min-h-0 flex-col p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">局域网里的房间</h2>
            <p className="mt-1 text-xs text-mist-500">
              {snap.rooms.length > 0
                ? `发现 ${snap.rooms.length} 个房间 · 列表实时更新`
                : "正在监听局域网广播……"}
            </p>
          </div>
          <button className="btn btn-ghost h-8 px-3 text-xs" onClick={onRefresh}>
            刷新
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {snap.rooms.length === 0 ? (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/8 bg-white/[0.03]">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="2.2" fill="#5BD8FF" />
                    <path
                      d="M6.5 15.5a8 8 0 0 1 11 0M9.2 11.9a4.6 4.6 0 0 1 5.6 0"
                      stroke="#5BD8FF"
                      strokeOpacity=".45"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="mt-4 text-sm text-mist-200">还没有发现房间</p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-mist-500">
                  先在左侧创建一个房间，其他人打开 LanRoom 就能看到并加入。
                </p>
              </div>
            </div>
          ) : (
            snap.rooms.map((room) => (
              <RoomCard key={room.id} room={room} onJoin={(id) => void join(id)} busy={busy} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
