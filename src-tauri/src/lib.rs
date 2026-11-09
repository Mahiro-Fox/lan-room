mod commands;
mod net;
mod settings;
mod shortcut;
mod toast;
mod tray;
mod updater;

use commands::Runtime;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 首选快捷键不可用时的备选组合
fn shortcut_candidates(preferred: &str) -> Vec<String> {
    let mut list = vec![preferred.to_string()];
    for extra in ["Ctrl+Alt+D", "Ctrl+Alt+F9", "Ctrl+Shift+F9", "Ctrl+Alt+M"] {
        if !list.iter().any(|x| x.eq_ignore_ascii_case(extra)) {
            list.push(extra.to_string());
        }
    }
    list
}

pub fn run() {
    tauri::Builder::default()
        // 单例：必须最先注册，第二次启动只会聚焦已有窗口
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main(app);
            let _ = app.emit("second-instance", ());
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        commands::quick_send(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::refresh,
            commands::take_notices,
            commands::save_settings,
            commands::create_room,
            commands::join_room,
            commands::leave_room,
            commands::send_notification,
            commands::test_notification,
            commands::hide_window,
            commands::quit_app,
            commands::open_config_dir,
            commands::check_update,
            commands::install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let loaded = settings::load(&handle);

            let settings = Arc::new(Mutex::new(loaded.clone()));
            let net = net::Net::new(handle.clone(), Arc::clone(&settings))
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

            let rt = Runtime {
                net: Arc::clone(&net),
                settings: Arc::clone(&settings),
                shortcut: Mutex::new(loaded.shortcut.clone()),
                notices: Mutex::new(Vec::new()),
            };

            // 注册全局快捷键：首选组合被占用时自动退到备选，并持久化
            let gs = app.global_shortcut();
            let mut chosen: Option<String> = None;
            let mut last_err = String::new();
            for candidate in shortcut_candidates(&loaded.shortcut) {
                match shortcut::parse(&candidate) {
                    Ok(sc) => match gs.register(sc) {
                        Ok(()) => {
                            chosen = Some(candidate);
                            break;
                        }
                        Err(e) => last_err = e.to_string(),
                    },
                    Err(e) => last_err = e,
                }
            }
            match chosen {
                Some(active) if active != loaded.shortcut => {
                    rt.notice(format!(
                        "快捷键 {} 已被其他程序占用，已自动改用 {}",
                        loaded.shortcut, active
                    ));
                    let mut next = loaded.clone();
                    next.shortcut = active.clone();
                    *rt.shortcut.lock().unwrap_or_else(|e| e.into_inner()) = active;
                    if let Err(e) = settings::save(&handle, &next) {
                        eprintln!("[settings] 保存失败: {e}");
                    }
                    *settings.lock().unwrap_or_else(|e| e.into_inner()) = next;
                }
                Some(_) => {}
                None => {
                    eprintln!("[shortcut] 全部候选组合注册失败: {last_err}");
                    rt.notice(format!(
                        "全局快捷键注册失败：{last_err}，请到设置里换一个组合"
                    ));
                }
            }

            app.manage(rt);
            net.spawn();

            tray::build(&handle)?;

            // 隐藏的诊断参数：--test-toast 用于确认系统通知链路是否正常
            if std::env::args().any(|a| a == "--test-toast") {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1200));
                    toast::show(&h, "LanRoom 自检", "看到这条通知说明系统通知链路正常。");
                });
            }

            if loaded.auto_check_update {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(Some(info)) = updater::check(h.clone()).await {
                        let _ = h.emit("update-available", info);
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let keep = window
                    .app_handle()
                    .try_state::<Runtime>()
                    .map(|rt| {
                        rt.settings
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .close_to_tray
                    })
                    .unwrap_or(true);
                if keep {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("LanRoom 启动失败");
}
