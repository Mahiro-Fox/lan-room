use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+D";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// 昵称，进入房间前必须填写
    pub nickname: String,
    /// 全局快捷键，形如 "Ctrl+Alt+D"
    pub shortcut: String,
    /// 通知标题模板，支持 {nick} {room} {time}
    pub notify_title: String,
    /// 通知正文模板，支持 {nick} {room} {time}
    pub notify_body: String,
    /// 是否发送执行回执（默认开启）
    pub send_receipt: bool,
    /// 关闭窗口时最小化到托盘
    pub close_to_tray: bool,
    /// 启动后自动检查更新
    pub auto_check_update: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            nickname: String::new(),
            shortcut: DEFAULT_SHORTCUT.to_string(),
            notify_title: "来自 {nick} 的局域网通知".to_string(),
            notify_body: "{nick} 在「{room}」里喊你一下".to_string(),
            send_receipt: true,
            close_to_tray: true,
            auto_check_update: true,
        }
    }
}

impl Settings {
    /// 归一化：去掉空白、限制长度，避免脏数据进入广播包
    pub fn normalize(&mut self) {
        self.nickname = clean(&self.nickname, 24);
        self.shortcut = clean(&self.shortcut, 40);
        if self.shortcut.is_empty() {
            self.shortcut = DEFAULT_SHORTCUT.to_string();
        }
        self.notify_title = clean(&self.notify_title, 64);
        self.notify_body = clean(&self.notify_body, 200);
        if self.notify_title.is_empty() {
            self.notify_title = Settings::default().notify_title;
        }
        if self.notify_body.is_empty() {
            self.notify_body = Settings::default().notify_body;
        }
    }
}

pub fn clean(input: &str, max: usize) -> String {
    let filtered: String = input
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let trimmed = filtered.split_whitespace().collect::<Vec<_>>().join(" ");
    trimmed.chars().take(max).collect::<String>()
}

fn settings_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir.join("settings.json")
}

pub fn load(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    match fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Settings>(&text) {
            Ok(mut s) => {
                s.normalize();
                s
            }
            Err(e) => {
                eprintln!("[settings] 解析失败，使用默认值: {e}");
                Settings::default()
            }
        },
        Err(_) => Settings::default(),
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app);
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| format!("写入设置失败: {e}"))
}
