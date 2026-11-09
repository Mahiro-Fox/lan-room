import { useState } from "react";
import { Logo, Spinner } from "./ui";

export function Welcome({
  initial,
  onSubmit,
  version,
}: {
  initial: string;
  onSubmit: (nick: string) => Promise<void>;
  version: string;
}) {
  const [nick, setNick] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = nick.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onSubmit(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center">
      <div className="card animate-in w-full max-w-[440px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Logo size={26} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">欢迎使用 LanRoom</h1>
            <p className="text-xs text-mist-500">局域网通知 · v{version}</p>
          </div>
        </div>

        <h2 className="text-[26px] leading-tight font-semibold tracking-tight">
          先给自己起个名字
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          你会以这个名字出现在房间成员列表和通知里。所有消息只在你所在的局域网内传播。
        </p>

        <div className="mt-6">
          <input
            autoFocus
            className="input h-12 text-base"
            placeholder="例如：小明 / Mahiro"
            maxLength={24}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>

        <button
          className="btn btn-primary mt-4 h-11 w-full text-[15px]"
          disabled={!nick.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? <Spinner /> : null}
          进入 LanRoom
        </button>

        <p className="mt-5 text-center text-xs leading-relaxed text-mist-500">
          昵称可以随时在「设置」里修改
        </p>
      </div>
    </div>
  );
}
