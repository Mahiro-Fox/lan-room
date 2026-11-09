// 模拟局域网里的另一个节点，用于端到端验证协议
const dgram = require("dgram");

const PORT = Number(process.env.LAN_PORT || 47932);
const RID = process.argv[2];
const NICK = process.env.LAN_NICK || "节点A";
const cid = "peer-" + Math.random().toString(36).slice(2, 8);
let appCid = null;
let sawNotify = false;

const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
sock.on("error", (e) => {
  console.log("SOCKET_ERR", e.code, e.message);
  process.exit(1);
});

// 发送用独立端口，这样对方的单播回执能准确回到这里
const tx = dgram.createSocket("udp4");
tx.on("error", (e) => console.log("TX_ERR", e.message));
tx.bind(0, () => tx.setBroadcast(true));

function send(obj, port = PORT, addr = "255.255.255.255") {
  const b = Buffer.from(JSON.stringify(obj));
  tx.send(b, 0, b.length, port, addr);
}

sock.bind({ port: PORT, address: "0.0.0.0", exclusive: false }, () => {
  console.log("BOUND", PORT);
  sock.setBroadcast(true);
  const beat = () =>
    send({
      k: "p",
      v: 1,
      rid: RID,
      rname: "联调房",
      cid,
      nick: NICK,
      joined: Date.now(),
      created: Date.now() - 60000,
    });
  beat();
  setInterval(beat, 1000);
});

function onPacket(buf, rinfo) {
  let p;
  try {
    p = JSON.parse(buf.toString());
  } catch {
    return;
  }
  if (p.cid && p.cid !== cid) appCid = p.cid;
  if (p.k === "n") {
    if (p.cid === cid) return; // 忽略自己广播的回声
    sawNotify = true;
    console.log("NOTIFY_RECEIVED", JSON.stringify({ title: p.title, body: p.body, from: p.nick }));
    send({ k: "a", v: 1, mid: p.mid, to: p.cid, nick: NICK }, rinfo.port, rinfo.address);
  } else if (p.k === "p") {
    if (p.cid !== cid) console.log("PRESENCE", p.nick, p.rid.slice(0, 8));
  } else if (p.k === "a") {
    console.log("ACK_SEEN", p.nick);
  }
}

sock.on("message", onPacket);
tx.on("message", onPacket);

// 4 秒后主动向对方发一条通知，验证「接收 → 弹窗 → 回执」
setTimeout(() => {
  if (!appCid) {
    console.log("NO_APP_CID");
    return;
  }
  console.log("SEND_NOTIFY_TO_APP");
  send({
    k: "n",
    v: 1,
    mid: "mid-from-peer-" + Date.now(),
    rid: RID,
    cid,
    nick: NICK,
    title: "联调通知",
    body: "这条来自模拟节点，用于验证接收链路",
    total: 2,
  });
}, 4000);

setTimeout(() => {
  console.log("RESULT", JSON.stringify({ appCid: !!appCid, sawNotify }));
  process.exit(0);
}, 9000);
