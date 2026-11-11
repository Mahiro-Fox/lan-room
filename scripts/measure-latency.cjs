// 延迟实测：通过 CDP 让 app 建一个房间，然后本进程当 UDP 对端发 Notify，量「发出 → 收到 Ack」的往返
// 用法：先启动 app（带 --remote-debugging-port=9222），再 node scripts/measure-latency.cjs
const dgram = require("node:dgram");

const PORT = Number(process.env.LAN_PORT || 47932);
const N = Number(process.env.N || 6);
const GAP = Number(process.env.GAP || 500);

const cid = "probe-" + Math.random().toString(36).slice(2, 8);

async function cdp() {
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("没有找到可调试页面，app 是否带了 --remote-debugging-port=9222？");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("CDP 连接失败"));
  });
  let seq = 0;
  const waiters = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const w = waiters.get(msg.id);
    if (w) {
      waiters.delete(msg.id);
      w(msg);
    }
  };
  const call = (method, params) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => waiters.set(id, res));
  };
  const evaluate = async (expression) => {
    const m = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) {
      throw new Error(m.result.exceptionDetails.exception?.description || "页面内执行失败");
    }
    return m.result?.result?.value;
  };
  return { evaluate, close: () => ws.close() };
}

(async () => {
  const { evaluate, close } = await cdp();

  // 等 Tauri 注入完成
  for (let i = 0; i < 40; i++) {
    if (await evaluate("typeof window.__TAURI_INTERNALS__ !== 'undefined'")) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const roomId = await evaluate(
    `window.__TAURI_INTERNALS__.invoke("create_room", { name: "延迟测试" }).then(s => s.roomId)`,
  );
  console.log("ROOM", roomId);
  await new Promise((r) => setTimeout(r, 300)); // 让房间状态落定

  const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const tx = dgram.createSocket("udp4");
  await new Promise((r) => tx.bind(0, r));
  tx.setBroadcast(true);

  const sent = new Map(); // mid -> hrtime
  const samples = [];

  tx.on("message", (buf) => {
    let p;
    try {
      p = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (p.k !== "a") return;
    const t0 = sent.get(p.mid);
    if (!t0) return;
    sent.delete(p.mid);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
    console.log(`  ack ${samples.length}/${N}  ${samples[samples.length - 1].toFixed(1)} ms`);
  });

  const pkt = (mid) =>
    Buffer.from(
      JSON.stringify({
        k: "n",
        v: 1,
        mid,
        rid: roomId,
        cid,
        nick: "延迟探针",
        title: "延迟测试",
        body: `probe ${mid}`,
        total: 2,
      }),
    );

  for (let i = 0; i < N; i++) {
    const mid = `lat-${Date.now()}-${i}`;
    sent.set(mid, process.hrtime.bigint());
    tx.send(pkt(mid), PORT, "255.255.255.255");
    await new Promise((r) => setTimeout(r, GAP));
  }

  await new Promise((r) => setTimeout(r, 1500));
  close();
  tx.close();
  sock.close();

  if (samples.length === 0) {
    console.log("RESULT 没有收到任何回执（app 是否在同一房间？防火墙？）");
    process.exit(1);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  console.log(
    `RESULT n=${samples.length} min=${sorted[0].toFixed(1)} p50=${pct(0.5).toFixed(1)} p90=${pct(0.9).toFixed(
      1,
    )} max=${sorted[sorted.length - 1].toFixed(1)} ms`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
