// 仅用于开发/预览的假数据（VITE_MOCK=1 时生效，生产构建会被 tree-shake）
import type { LogEntry, Member, Room, Settings, Snapshot } from "../types";

const now = Date.now();
/** 预览用的发送冷却时间戳 */
let sendableAt = 0;

const settings: Settings = {
  nickname: "Mahiro",
  shortcut: "Ctrl+Alt+D",
  notifyTitle: "来自 {nick} 的局域网通知",
  notifyBody: "{nick} 在「{room}」里喊你一下",
  sendReceipt: true,
  closeToTray: true,
  autoCheckUpdate: true,
};

const rooms: Room[] = [
  {
    id: "r1",
    name: "设计组",
    hostNick: "Mahiro",
    memberCount: 4,
    members: ["Mahiro", "小林", "Yuki", "小王"],
    isCurrent: false,
    created: now - 1000 * 60 * 26,
  },
  {
    id: "r2",
    name: "前端联调",
    hostNick: "Ada",
    memberCount: 2,
    members: ["Ada", "Kevin"],
    isCurrent: false,
    created: now - 1000 * 60 * 74,
  },
  {
    id: "r3",
    name: "测试机群",
    hostNick: "Zoe",
    memberCount: 3,
    members: ["Zoe", "阿哲", "Tom"],
    isCurrent: false,
    created: now - 1000 * 60 * 8,
  },
];

const members: Member[] = [
  { cid: "c1", nick: "Mahiro", isMe: true, isHost: true, joined: now - 100000 },
  { cid: "c2", nick: "小林", isMe: false, isHost: false, joined: now - 80000 },
  { cid: "c3", nick: "Yuki", isMe: false, isHost: false, joined: now - 50000 },
  { cid: "c4", nick: "小王", isMe: false, isHost: false, joined: now - 20000 },
];

const log: LogEntry[] = [
  {
    id: "l1",
    kind: "received",
    nick: "小林",
    title: "来自 小林 的局域网通知",
    body: "小林 在「设计组」里喊你一下",
    ts: now - 12000,
    acks: [],
    total: 3,
  },
  {
    id: "l2",
    kind: "sent",
    nick: "Mahiro",
    title: "来自 Mahiro 的局域网通知",
    body: "Figma 稿件已更新，帮忙看一眼前端溢出",
    ts: now - 65000,
    acks: ["小林", "Yuki", "小王"],
    total: 3,
  },
  {
    id: "l3",
    kind: "sent",
    nick: "Mahiro",
    title: "来自 Mahiro 的局域网通知",
    body: "Mahiro 在「设计组」里喊你一下",
    ts: now - 300000,
    acks: ["小林"],
    total: 3,
  },
  { id: "l4", kind: "system", nick: "", title: "已加入房间「设计组」", body: "", ts: now - 600000, acks: [], total: 0 },
];

export const mock = {
  snapshot(): Snapshot {
    const view = new URLSearchParams(location.search).get("view");
    const inRoom = view === "room";
    return {
      settings: view === "welcome" ? { ...settings, nickname: "" } : settings,
      cid: "c1",
      localIp: "192.168.31.42",
      roomId: inRoom ? "r1" : null,
      roomName: inRoom ? "设计组" : null,
      rooms,
      members: inRoom ? members : [],
      log: inRoom ? log : [],
      version: "0.1.2",
      port: 47932,
      sendableAt: sendableAt > Date.now() ? sendableAt : 0,
      rev: Math.floor(Date.now() / 100),
    };
  },
  send(): Snapshot {
    sendableAt = Date.now() + 3000;
    return mock.snapshot();
  },
};
