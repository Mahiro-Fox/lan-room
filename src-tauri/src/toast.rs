use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

/// 弹一条 Windows 系统通知；失败时把错误回传给前端，避免"静默失败"
pub fn show(app: &AppHandle, title: &str, body: &str) {
    let result = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
    if let Err(e) = result {
        eprintln!("[toast] 系统通知发送失败: {e}");
        let _ = app.emit("toast-error", e.to_string());
    }
}
