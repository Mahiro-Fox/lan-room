use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// 显示并聚焦主窗口（托盘点击、再次启动、更新提示都会用到）
pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let send = MenuItem::with_id(app, "send", "发送通知", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "检查更新", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 LanRoom", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&show, &send, &sep1, &settings, &update, &sep2, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("LanRoom · 局域网通知")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "send" => crate::commands::quick_send(app),
            "settings" => {
                show_main(app);
                let _ = app.emit("navigate", "settings");
            }
            "update" => {
                show_main(app);
                let _ = app.emit("navigate", "update");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    } else {
        // 兜底：直接从内嵌 PNG 构建托盘图标
        let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
            .expect("内置托盘图标损坏");
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}
