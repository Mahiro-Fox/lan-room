//! 局域网发现与通知广播。
//!
//! 协议：所有成员在 UDP 端口上周期性广播 `Presence` 包，任何收到包的实例都能
//! 据此推断出「房间」「成员」两组信息 —— 无需中心服务器，也没有单点故障。
//! 通知与回执分别是 `Notify` / `Ack` 包。

use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::{HashMap, HashSet, VecDeque};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::settings::{clean, Settings};

/// 局域网发现端口（所有客户端必须一致）
pub const PORT: u16 = 47932;

const TICK: Duration = Duration::from_millis(200);
const BEAT: Duration = Duration::from_millis(2000);
const TTL: Duration = Duration::from_millis(7000);
const RECEIPT_DELAY: Duration = Duration::from_millis(900);
/// 两次发送之间的最小间隔：按钮和全局快捷键共用同一把闸门，防止误触/连按刷屏
pub const SEND_GAP: Duration = Duration::from_millis(3000);
const MAX_LOG: usize = 80;
const PROTOCOL: u8 = 1;

macro_rules! trace {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!("[net] {}", format!($($arg)*));
    };
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "k")]
enum Packet {
    /// 有人在某个房间里（用于房间/成员发现）
    #[serde(rename = "p")]
    Presence {
        v: u8,
        rid: String,
        rname: String,
        cid: String,
        nick: String,
        joined: u64,
        created: u64,
    },
    /// 发送通知
    #[serde(rename = "n")]
    Notify {
        v: u8,
        mid: String,
        rid: String,
        cid: String,
        nick: String,
        title: String,
        body: String,
        total: u32,
    },
    /// 执行回执
    #[serde(rename = "a")]
    Ack {
        v: u8,
        mid: String,
        to: String,
        nick: String,
    },
    /// 离开房间
    #[serde(rename = "b")]
    Bye { v: u8, rid: String, cid: String },
}

pub struct Peer {
    pub nick: String,
    pub joined: u64,
    pub seen: Instant,
    /// 对方的收包地址（端口固定为 PORT），用于通知的单播直投
    pub addr: SocketAddr,
}

pub struct Room {
    pub id: String,
    pub name: String,
    pub created: u64,
    pub peers: HashMap<String, Peer>,
}

struct Me {
    room: Option<String>,
    joined: u64,
    nick: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    /// sent | received | system
    pub kind: String,
    pub nick: String,
    pub title: String,
    pub body: String,
    pub ts: u64,
    pub acks: Vec<String>,
    pub total: u32,
}

struct Inner {
    rooms: HashMap<String, Room>,
    me: Me,
    log: VecDeque<LogEntry>,
    receipt_fired: HashSet<String>,
    pending_receipts: Vec<(String, Instant)>,
    /// 上一次成功发送的单调时间，用于 3 秒冷却
    last_sent: Option<Instant>,
    /// 冷却结束的墙钟时间（毫秒），下发给界面做倒计时
    sendable_at: u64,
    /// 已处理过的通知 mid，用于过滤重复到达的广播包
    seen_notify: HashSet<String>,
    notify_order: VecDeque<String>,
    /// 快照版本号：每次生成快照时自增，前端据此丢弃过期的快照
    rev: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    pub cid: String,
    pub nick: String,
    pub is_me: bool,
    pub is_host: bool,
    pub joined: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoomView {
    pub id: String,
    pub name: String,
    pub host_nick: String,
    pub member_count: u32,
    pub members: Vec<String>,
    pub is_current: bool,
    pub created: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub settings: Settings,
    pub cid: String,
    pub local_ip: String,
    pub room_id: Option<String>,
    pub room_name: Option<String>,
    pub rooms: Vec<RoomView>,
    pub members: Vec<MemberView>,
    pub log: Vec<LogEntry>,
    pub version: String,
    pub port: u16,
    /// 冷却结束的墙钟毫秒时间戳；0 表示现在就能发
    pub sendable_at: u64,
    /// 快照版本号：数值越大表示状态越新，前端用它丢弃乱序到达的旧快照
    pub rev: u64,
}

pub struct Net {
    app: AppHandle,
    settings: Arc<Mutex<Settings>>,
    cid: String,
    sock: UdpSocket,
    local_ip: Option<Ipv4Addr>,
    inner: Mutex<Inner>,
    last_emit: Mutex<String>,
    force_beat: AtomicU32,
}

impl Net {
    pub fn new(app: AppHandle, settings: Arc<Mutex<Settings>>) -> Result<Arc<Self>, String> {
        let sock = bind_socket()?;

        let local_ip = detect_local_ip();
        let nick = lock(&settings).nickname.clone();

        Ok(Arc::new(Self {
            app,
            settings,
            cid: Uuid::new_v4().to_string(),
            sock,
            local_ip,
            inner: Mutex::new(Inner {
                rooms: HashMap::new(),
                me: Me {
                    room: None,
                    joined: 0,
                    nick,
                },
                log: VecDeque::new(),
                receipt_fired: HashSet::new(),
                pending_receipts: Vec::new(),
                last_sent: None,
                sendable_at: 0,
                seen_notify: HashSet::new(),
                notify_order: VecDeque::new(),
                rev: 1,
            }),
            last_emit: Mutex::new(String::new()),
            force_beat: AtomicU32::new(0),
        }))
    }

    /// 后台循环：收包线程 + 维护线程
    ///
    /// 收包必须独立成阻塞线程：早先的写法是「recv_from 80ms 超时 + sleep 200ms」轮询，
    /// 空闲时循环周期约 280ms，通知平均要多等 ~90ms、最坏 ~280ms 才被读出来。
    pub fn spawn(self: &Arc<Self>) {
        let recv = Arc::clone(self);
        thread::spawn(move || {
            let mut buf = [0u8; 2048];
            loop {
                match recv.sock.recv_from(&mut buf) {
                    Ok((n, src)) => {
                        if let Ok(pkt) = serde_json::from_slice::<Packet>(&buf[..n]) {
                            recv.handle(pkt, src);
                        }
                    }
                    Err(e) => {
                        // 超时不会出现（无读超时）；Windows 收到 ICMP 端口不可达时
                        // 可能给 UDP socket 报 ConnectionReset，忽略后继续收即可
                        if e.kind() != std::io::ErrorKind::WouldBlock
                            && e.kind() != std::io::ErrorKind::TimedOut
                        {
                            trace!("收包出错: {e}");
                            thread::sleep(Duration::from_millis(1));
                        }
                    }
                }
            }
        });

        let net = Arc::clone(self);
        thread::spawn(move || {
            let mut last_beat = Instant::now() - BEAT;
            loop {
                net.beat_if_due(&mut last_beat);
                net.sweep();
                net.flush_receipts();
                net.emit_if_changed();
                thread::sleep(TICK);
            }
        });
    }

    // ---------- 网络收发 ----------

    fn targets(&self) -> Vec<SocketAddr> {
        let mut out = vec![SocketAddr::from((Ipv4Addr::BROADCAST, PORT))];
        if let Some(ip) = self.local_ip {
            let o = ip.octets();
            out.push(SocketAddr::from((Ipv4Addr::new(o[0], o[1], o[2], 255), PORT)));
        }
        out
    }

    fn broadcast(&self, pkt: &Packet) {
        let Ok(buf) = serde_json::to_vec(pkt) else {
            return;
        };
        self.broadcast_buf(&buf);
    }

    fn broadcast_buf(&self, buf: &[u8]) {
        if buf.len() > 1200 {
            return;
        }
        for addr in self.targets() {
            let _ = self.sock.send_to(buf, addr);
        }
    }

    fn unicast(&self, pkt: &Packet, addr: SocketAddr) {
        if let Ok(buf) = serde_json::to_vec(pkt) {
            let _ = self.sock.send_to(&buf, addr);
        }
    }

    /// 房间里其他成员的收包地址。
    /// 同机多实例（SO_REUSEADDR 共享端口）时单播会落到另一个 socket 上，所以同机成员只走广播。
    fn peer_addrs(&self, rid: &str) -> Vec<SocketAddr> {
        let inner = lock(&self.inner);
        let Some(room) = inner.rooms.get(rid) else {
            return Vec::new();
        };
        room.peers
            .iter()
            .filter(|(cid, _)| **cid != self.cid)
            .filter(|(_, p)| match (self.local_ip, p.addr.ip()) {
                (Some(me), IpAddr::V4(ip)) => me != ip,
                _ => true,
            })
            .map(|(_, p)| p.addr)
            .collect()
    }

    /// 通知投递：先对已知成员逐个单播，再广播兜底。
    /// 单播帧不会被 AP 攒到 DTIM 才下发，能绕开企业 WiFi 上「广播/多播被节流」造成的
    /// 100~300ms 延迟；重复到达的包由 mid 去重。
    fn deliver(&self, pkt: &Packet, rid: &str) {
        let Ok(buf) = serde_json::to_vec(pkt) else {
            return;
        };
        if buf.len() > 1200 {
            return;
        }
        for addr in self.peer_addrs(rid) {
            let _ = self.sock.send_to(&buf, addr);
        }
        self.broadcast_buf(&buf);
    }

    fn handle(&self, pkt: Packet, src: SocketAddr) {
        match pkt {
            Packet::Presence {
                v,
                rid,
                rname,
                cid,
                nick,
                joined,
                created,
            } => {
                if v != PROTOCOL || cid == self.cid || rid.is_empty() {
                    return;
                }
                let mut inner = lock(&self.inner);
                let room = inner.rooms.entry(rid.clone()).or_insert_with(|| Room {
                    id: rid.clone(),
                    name: rname.clone(),
                    created,
                    peers: HashMap::new(),
                });
                if !rname.is_empty() {
                    room.name = rname.clone();
                }
                if created > 0 && (room.created == 0 || created < room.created) {
                    room.created = created;
                }
                let is_new_peer = !room.peers.contains_key(&cid);
                room.peers.insert(
                    cid,
                    Peer {
                        nick: nick.clone(),
                        joined,
                        seen: Instant::now(),
                        addr: SocketAddr::new(src.ip(), PORT),
                    },
                );
                if is_new_peer {
                    trace!("节点上线 {} 房间「{}」({})", nick, rname, rid);
                }
            }

            Packet::Notify {
                v,
                mid,
                rid,
                cid,
                nick,
                title,
                body,
                total,
            } => {
                if v != PROTOCOL || cid == self.cid {
                    return;
                }
                let (in_room, my_nick) = {
                    let inner = lock(&self.inner);
                    (
                        inner.me.room.as_deref() == Some(rid.as_str()),
                        inner.me.nick.clone(),
                    )
                };
                if !in_room {
                    return;
                }

                // 去重与落库放在同一把锁里：日志顺序 = 到达顺序，时间戳也在到达瞬间取
                let arrived = now_ms();
                {
                    let mut inner = lock(&self.inner);
                    // 同一份通知可能经全网广播 + 子网广播两条路径到达，按 mid 去重
                    if !inner.seen_notify.insert(mid.clone()) {
                        return;
                    }
                    inner.notify_order.push_back(mid.clone());
                    while inner.notify_order.len() > 200 {
                        if let Some(old) = inner.notify_order.pop_front() {
                            inner.seen_notify.remove(&old);
                        }
                    }
                    inner.log.push_front(LogEntry {
                        id: mid.clone(),
                        kind: "received".into(),
                        nick: nick.clone(),
                        title: title.clone(),
                        body: body.clone(),
                        ts: arrived,
                        acks: Vec::new(),
                        total,
                    });
                    inner.log.truncate(MAX_LOG);
                }

                trace!("收到通知 ← {}: {} / {}", nick, title, body);
                crate::toast::show(&self.app, &title, &body);

                // 回执单播给发送方，避免全房间广播
                self.unicast(
                    &Packet::Ack {
                        v: PROTOCOL,
                        mid,
                        to: cid,
                        nick: my_nick,
                    },
                    src,
                );
            }

            Packet::Ack { v, mid, to, nick } => {
                if v != PROTOCOL || to != self.cid {
                    return;
                }
                let should_receipt = {
                    let mut inner = lock(&self.inner);
                    let mut first = false;
                    if let Some(entry) = inner
                        .log
                        .iter_mut()
                        .find(|e| e.id == mid && e.kind == "sent")
                    {
                        if !entry.acks.iter().any(|n| n == &nick) {
                            entry.acks.push(nick.clone());
                            first = entry.acks.len() == 1;
                        }
                    }
                    trace!("收到回执 ← {nick} (msg {mid})");
                    if first && !inner.receipt_fired.contains(&mid) {
                        inner.receipt_fired.insert(mid.clone());
                        inner.pending_receipts.push((mid.clone(), Instant::now()));
                        true
                    } else {
                        false
                    }
                };
                let _ = should_receipt;
            }

            Packet::Bye { rid, cid, .. } => {
                let mut inner = lock(&self.inner);
                let mut empty = false;
                if let Some(room) = inner.rooms.get_mut(&rid) {
                    room.peers.remove(&cid);
                    empty = room.peers.is_empty();
                }
                if empty {
                    inner.rooms.remove(&rid);
                }
            }
        }
    }

    /// 汇总 900ms 后弹一条执行回执，避免多人同时回执时刷屏
    fn flush_receipts(&self) {
        let ready: Vec<String> = {
            let mut inner = lock(&self.inner);
            let mut ready = Vec::new();
            inner.pending_receipts.retain(|(mid, at)| {
                if at.elapsed() >= RECEIPT_DELAY {
                    ready.push(mid.clone());
                    false
                } else {
                    true
                }
            });
            ready
        };
        if ready.is_empty() {
            return;
        }
        let enabled = lock(&self.settings).send_receipt;
        if !enabled {
            return;
        }
        for mid in ready {
            let (title, count, names) = {
                let inner = lock(&self.inner);
                match inner.log.iter().find(|e| e.id == mid) {
                    Some(e) => {
                        let names = e.acks.join("、");
                        (e.title.clone(), e.acks.len(), names)
                    }
                    None => continue,
                }
            };
            crate::toast::show(
                &self.app,
                "发送回执",
                &format!("「{title}」已被 {count} 人接收：{names}"),
            );
        }
    }

    fn beat_if_due(&self, last_beat: &mut Instant) {
        if last_beat.elapsed() < BEAT && self.force_beat.load(Ordering::Relaxed) == 0 {
            return;
        }
        self.force_beat.store(0, Ordering::Relaxed);
        *last_beat = Instant::now();
        self.beat();
    }

    fn beat(&self) {
        let mut inner = lock(&self.inner);
        let Some(rid) = inner.me.room.clone() else {
            return;
        };
        let nick = inner.me.nick.clone();
        let joined = inner.me.joined;
        let (rname, created) = match inner.rooms.get_mut(&rid) {
            Some(room) => {
                room.peers.insert(
                    self.cid.clone(),
                    Peer {
                        nick: nick.clone(),
                        joined,
                        seen: Instant::now(),
                        // 自己那条记录不会被单播使用（peer_addrs 里排除了本机 cid）
                        addr: SocketAddr::from((Ipv4Addr::LOCALHOST, PORT)),
                    },
                );
                (room.name.clone(), room.created)
            }
            None => (String::new(), 0),
        };
        drop(inner);
        self.broadcast(&Packet::Presence {
            v: PROTOCOL,
            rid,
            rname,
            cid: self.cid.clone(),
            nick,
            joined,
            created,
        });
    }

    fn sweep(&self) {
        let mut inner = lock(&self.inner);
        let now = Instant::now();
        let my_room = inner.me.room.clone();
        let mut dead: Vec<String> = Vec::new();
        let me = self.cid.clone();
        for room in inner.rooms.values_mut() {
            let rid = room.id.clone();
            let is_my_room = my_room.as_deref() == Some(rid.as_str());
            room.peers.retain(|cid, p| {
                if is_my_room && *cid == me {
                    return true;
                }
                now.duration_since(p.seen) < TTL
            });
            if room.peers.is_empty() {
                dead.push(rid);
            }
        }
        for id in dead {
            inner.rooms.remove(&id);
        }
    }

    // ---------- 对外命令 ----------

    pub fn create_room(&self, name: &str) -> Result<String, String> {
        let name = clean(name, 32);
        if name.is_empty() {
            return Err("房间名不能为空".into());
        }
        if lock(&self.settings).nickname.is_empty() {
            return Err("请先填写昵称".into());
        }
        let rid = Uuid::new_v4().to_string();
        {
            let mut inner = lock(&self.inner);
            inner.rooms.insert(
                rid.clone(),
                Room {
                    id: rid.clone(),
                    name: name.clone(),
                    created: now_ms(),
                    peers: HashMap::new(),
                },
            );
        }
        self.enter(rid.clone())?;
        trace!("创建房间「{name}」({rid})");
        self.push_system(&format!("已创建房间「{name}」"));
        Ok(rid)
    }

    pub fn join_room(&self, rid: &str) -> Result<(), String> {
        let name = {
            let inner = lock(&self.inner);
            match inner.rooms.get(rid) {
                Some(r) => r.name.clone(),
                None => return Err("房间已不存在".into()),
            }
        };
        self.enter(rid.to_string())?;
        self.push_system(&format!("已加入房间「{name}」"));
        Ok(())
    }

    fn enter(&self, rid: String) -> Result<(), String> {
        let nick = lock(&self.settings).nickname.clone();
        if nick.is_empty() {
            return Err("请先填写昵称".into());
        }
        {
            let mut inner = lock(&self.inner);
            let prev = inner.me.room.replace(rid.clone());
            inner.me.joined = now_ms();
            inner.me.nick = nick;
            inner.log.clear();
            inner.receipt_fired.clear();
            inner.pending_receipts.clear();
            if let Some(prev) = prev {
                if prev != rid {
                    // 切换房间：清掉我在旧房间里的占位
                    let mut remove_room = false;
                    if let Some(room) = inner.rooms.get_mut(&prev) {
                        room.peers.remove(&self.cid);
                        remove_room = room.peers.is_empty();
                    }
                    if remove_room {
                        inner.rooms.remove(&prev);
                    }
                }
            }
        }
        self.force_beat.store(1, Ordering::Relaxed);
        self.beat();
        Ok(())
    }

    pub fn leave(&self) {
        let rid = {
            let mut inner = lock(&self.inner);
            let rid = inner.me.room.take();
            inner.me.joined = 0;
            inner.log.clear();
            inner.receipt_fired.clear();
            inner.pending_receipts.clear();
            if let Some(rid) = &rid {
                let mut remove_room = false;
                if let Some(room) = inner.rooms.get_mut(rid) {
                    room.peers.remove(&self.cid);
                    remove_room = room.peers.is_empty();
                }
                if remove_room {
                    inner.rooms.remove(rid);
                }
            }
            rid
        };
        if let Some(rid) = rid {
            self.broadcast(&Packet::Bye {
                v: PROTOCOL,
                rid,
                cid: self.cid.clone(),
            });
        }
    }

    pub fn set_nickname(&self, nick: &str) {
        let nick = clean(nick, 24);
        {
            let mut inner = lock(&self.inner);
            inner.me.nick = nick;
        }
        self.force_beat.store(1, Ordering::Relaxed);
    }

    pub fn send(&self, custom: Option<String>) -> Result<(), String> {
        let s = lock(&self.settings).clone();
        let (rid, nick, room_name, total) = {
            let mut inner = lock(&self.inner);
            let rid = inner.me.room.clone().ok_or("请先进入一个房间")?;
            // 冷却闸门与「占用」放在同一把锁里，避免连点并发绕过
            if let Some(last) = inner.last_sent {
                let elapsed = last.elapsed();
                if elapsed < SEND_GAP {
                    let wait = SEND_GAP - elapsed;
                    let secs = (wait.as_millis() as u64 + 999) / 1000;
                    return Err(format!("刚发过一条，约 {secs} 秒后才能再发"));
                }
            }
            inner.last_sent = Some(Instant::now());
            inner.sendable_at = now_ms() + SEND_GAP.as_millis() as u64;

            let nick = if s.nickname.is_empty() {
                inner.me.nick.clone()
            } else {
                s.nickname.clone()
            };
            let room = inner.rooms.get(&rid);
            let room_name = room.map(|r| r.name.clone()).unwrap_or_default();
            let total = room
                .map(|r| r.peers.len().saturating_sub(1) as u32)
                .unwrap_or(0);
            (rid, nick, room_name, total)
        };

        let title = fill(&s.notify_title, &nick, &room_name);
        let body = match custom {
            Some(c) if !c.trim().is_empty() => clean(&c, 200),
            _ => fill(&s.notify_body, &nick, &room_name),
        };
        let mid = Uuid::new_v4().to_string();

        {
            let mut inner = lock(&self.inner);
            inner.log.push_front(LogEntry {
                id: mid.clone(),
                kind: "sent".into(),
                nick: nick.clone(),
                title: title.clone(),
                body: body.clone(),
                ts: now_ms(),
                acks: Vec::new(),
                total,
            });
            inner.log.truncate(MAX_LOG);
        }

        trace!("广播通知 → 房间 {rid}，预计 {total} 人：{title} / {body}");
        let rid_for_deliver = rid.clone();
        let pkt = Packet::Notify {
            v: PROTOCOL,
            mid,
            rid,
            cid: self.cid.clone(),
            nick,
            title,
            body,
            total,
        };
        self.deliver(&pkt, &rid_for_deliver);
        Ok(())
    }

    fn push_system(&self, text: &str) {
        let mut inner = lock(&self.inner);
        inner.log.push_front(LogEntry {
            id: Uuid::new_v4().to_string(),
            kind: "system".into(),
            nick: String::new(),
            title: text.to_string(),
            body: String::new(),
            ts: now_ms(),
            acks: Vec::new(),
            total: 0,
        });
        inner.log.truncate(MAX_LOG);
    }

    // ---------- 快照 ----------

    pub fn snapshot(&self) -> AppSnapshot {
        let settings = lock(&self.settings).clone();
        let mut inner = lock(&self.inner);
        // 版本号与状态读取在同一把锁内完成，因此 rev 的大小关系就等于状态的新旧关系
        inner.rev += 1;
        let rev = inner.rev;
        let me_room = inner.me.room.clone();
        // 冷却结束后归零，界面据此恢复按钮
        let sendable_at = if now_ms() < inner.sendable_at {
            inner.sendable_at
        } else {
            0
        };

        let mut rooms: Vec<RoomView> = inner
            .rooms
            .values()
            .filter(|r| !r.peers.is_empty())
            .map(|r| {
                let mut peers: Vec<&Peer> = r.peers.values().collect();
                peers.sort_by_key(|p| (p.joined, p.nick.clone()));
                RoomView {
                    id: r.id.clone(),
                    name: r.name.clone(),
                    host_nick: peers.first().map(|p| p.nick.clone()).unwrap_or_default(),
                    member_count: peers.len() as u32,
                    members: peers.iter().take(6).map(|p| p.nick.clone()).collect(),
                    is_current: me_room.as_deref() == Some(r.id.as_str()),
                    created: r.created,
                }
            })
            .collect();
        rooms.sort_by(|a, b| b.member_count.cmp(&a.member_count).then(a.name.cmp(&b.name)));

        let (members, room_name) = match me_room.as_deref().and_then(|rid| inner.rooms.get(rid)) {
            Some(room) => {
                let mut ps: Vec<(&String, &Peer)> = room.peers.iter().collect();
                ps.sort_by_key(|(_, p)| (p.joined, p.nick.clone()));
                let host_cid = ps.first().map(|(c, _)| (*c).clone());
                let members = ps
                    .iter()
                    .map(|(c, p)| MemberView {
                        cid: (*c).clone(),
                        nick: p.nick.clone(),
                        is_me: c.as_str() == self.cid,
                        is_host: host_cid.as_deref() == Some(c.as_str()),
                        joined: p.joined,
                    })
                    .collect();
                (members, Some(room.name.clone()))
            }
            None => (Vec::new(), None),
        };

        AppSnapshot {
            settings,
            cid: self.cid.clone(),
            local_ip: self
                .local_ip
                .map(|ip| ip.to_string())
                .unwrap_or_else(|| "未知".into()),
            room_id: me_room,
            room_name,
            rooms,
            members,
            log: inner.log.iter().cloned().collect(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            port: PORT,
            sendable_at,
            rev,
        }
    }

    fn emit_if_changed(&self) {
        let snap = self.snapshot();
        // rev 每次取快照都会变，不参与「内容有没有变化」的判定
        let mut probe = snap.clone();
        probe.rev = 0;
        let Ok(key) = serde_json::to_string(&probe) else {
            return;
        };
        {
            let mut last = lock(&self.last_emit);
            if *last == key {
                return;
            }
            *last = key;
        }
        let _ = self.app.emit("snapshot", &snap);
    }

    pub fn force_refresh(&self) {
        self.force_beat.store(1, Ordering::Relaxed);
        self.emit_if_changed();
    }
}

/// 允许同机多进程/调试工具共用端口（SO_REUSEADDR）
fn bind_socket() -> Result<UdpSocket, String> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))
        .map_err(|e| format!("创建 UDP socket 失败：{e}"))?;
    socket
        .set_reuse_address(true)
        .map_err(|e| format!("设置地址复用失败：{e}"))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("开启 UDP 广播失败：{e}"))?;
    socket
        .bind(&SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT)).into())
        .map_err(|e| format!("监听 UDP {PORT} 端口失败：{e}"))?;
    // 不设读超时：收包线程一直阻塞在 recv_from 上，包到达立刻处理（设了超时就退化成轮询）
    Ok(socket.into())
}

fn detect_local_ip() -> Option<Ipv4Addr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    // UDP connect 不真正发包，但能让系统选出默认出口网卡
    sock.connect("8.8.8.8:80").ok()?;
    match sock.local_addr().ok()? {
        SocketAddr::V4(a) => Some(*a.ip()),
        _ => None,
    }
}

fn fill(template: &str, nick: &str, room: &str) -> String {
    let secs = now_ms() / 1000 + 8 * 3600; // 东八区本地时间
    let time = format!("{:02}:{:02}", (secs / 3600) % 24, (secs / 60) % 60);
    template
        .replace("{nick}", nick)
        .replace("{room}", room)
        .replace("{time}", &time)
}
