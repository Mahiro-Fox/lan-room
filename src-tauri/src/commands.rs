use crate::net::{AppSnapshot, Net};
use crate::settings::{self, Settings};
use crate::{shortcut, toast, updater};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub struct Runtime {
    pub net: Arc<Net>,
    pub settings: Arc<Mutex<Settings>>,
    pub shortcut: Mutex<String>,
    /// 启动阶段产生、需要在界面就绪后提示的消息
    pub notices: Mutex<Vec<String>>,
}

impl Runtime {
    pub fn notice(&self, text: impl Into<String>) {
        self.notices
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(text.into());
    }

    pub fn shortcut(&self) -> String {
        self.shortcut
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

#[tauri::command]
pub fn take_notices(state: State<'_, Runtime>) -> Vec<String> {
    std::mem::take(&mut *state.notices.lock().unwrap_or_else(|e| e.into_inner()))
}

/// 快捷键 / 托盘触发的快速发送，失败时给前端一个可见提示
pub fn quick_send(app: &AppHandle) {
    let Some(state) = app.try_state::<Runtime>() else {
        return;
    };
    match state.net.send(None) {
        Ok(()) => {
            let _ = app.emit("snapshot", state.net.snapshot());
        }
        Err(err) => {
            let _ = app.emit("notice", err);
        }
    }
}

#[tauri::command]
pub fn bootstrap(state: State<'_, Runtime>) -> AppSnapshot {
    state.net.snapshot()
}

#[tauri::command]
pub fn refresh(state: State<'_, Runtime>) -> AppSnapshot {
    state.net.force_refresh();
    state.net.snapshot()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, Runtime>,
    next: Settings,
) -> Result<AppSnapshot, String> {
    let mut next = next;
    next.normalize();
    if next.nickname.is_empty() {
        return Err("昵称不能为空".into());
    }

    let prev = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    // 快捷键变更：先注册新的，成功后再注销旧的，避免中间态失效
    if next.shortcut != state.shortcut() || next.shortcut != prev.shortcut {
        let new_sc = shortcut::parse(&next.shortcut)?;
        let gs = app.global_shortcut();
        let old_sc = shortcut::parse(&prev.shortcut).ok();
        if let Some(old) = old_sc.clone() {
            let _ = gs.unregister(old);
        }
        if let Err(e) = gs.register(new_sc) {
            if let Some(old) = old_sc {
                let _ = gs.register(old);
            }
            return Err(format!("快捷键注册失败（可能已被其他程序占用）：{e}"));
        }
        *state.shortcut.lock().unwrap_or_else(|e| e.into_inner()) = next.shortcut.clone();
    }

    settings::save(&app, &next)?;
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = next.clone();

    if next.nickname != prev.nickname {
        state.net.set_nickname(&next.nickname);
    }
    state.net.force_refresh();
    let snap = state.net.snapshot();
    let _ = app.emit("snapshot", &snap);
    Ok(snap)
}

#[tauri::command]
pub fn create_room(app: AppHandle, state: State<'_, Runtime>, name: String) -> Result<AppSnapshot, String> {
    state.net.create_room(&name)?;
    let snap = state.net.snapshot();
    let _ = app.emit("snapshot", &snap);
    Ok(snap)
}

#[tauri::command]
pub fn join_room(app: AppHandle, state: State<'_, Runtime>, room_id: String) -> Result<AppSnapshot, String> {
    state.net.join_room(&room_id)?;
    let snap = state.net.snapshot();
    let _ = app.emit("snapshot", &snap);
    Ok(snap)
}

#[tauri::command]
pub fn leave_room(app: AppHandle, state: State<'_, Runtime>) -> Result<AppSnapshot, String> {
    state.net.leave();
    let snap = state.net.snapshot();
    let _ = app.emit("snapshot", &snap);
    Ok(snap)
}

#[tauri::command]
pub fn send_notification(
    app: AppHandle,
    state: State<'_, Runtime>,
    body: Option<String>,
) -> Result<AppSnapshot, String> {
    state.net.send(body)?;
    let snap = state.net.snapshot();
    let _ = app.emit("snapshot", &snap);
    Ok(snap)
}

#[tauri::command]
pub fn test_notification(app: AppHandle) -> Result<(), String> {
    toast::show(&app, "LanRoom 测试通知", "如果你看到这条通知，系统通知一切正常。");
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn open_config_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<updater::UpdateInfo>, String> {
    updater::check(app).await
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    updater::install(app).await
}
