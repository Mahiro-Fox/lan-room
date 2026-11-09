export interface Settings {
  nickname: string;
  shortcut: string;
  notifyTitle: string;
  notifyBody: string;
  sendReceipt: boolean;
  closeToTray: boolean;
  autoCheckUpdate: boolean;
}

export interface Member {
  cid: string;
  nick: string;
  isMe: boolean;
  isHost: boolean;
  joined: number;
}

export interface Room {
  id: string;
  name: string;
  hostNick: string;
  memberCount: number;
  members: string[];
  isCurrent: boolean;
  created: number;
}

export interface LogEntry {
  id: string;
  kind: "sent" | "received" | "system";
  nick: string;
  title: string;
  body: string;
  ts: number;
  acks: string[];
  total: number;
}

export interface Snapshot {
  settings: Settings;
  cid: string;
  localIp: string;
  roomId: string | null;
  roomName: string | null;
  rooms: Room[];
  members: Member[];
  log: LogEntry[];
  version: string;
  port: number;
}

export interface UpdateInfo {
  current: string;
  version: string;
  notes?: string | null;
  date?: string | null;
}

export type NoticeKind = "error" | "info" | "success";

export interface Notice {
  kind: NoticeKind;
  text: string;
  id: number;
}
