use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// 解析 "Ctrl+Alt+D" 这类字符串为系统快捷键
pub fn parse(input: &str) -> Result<Shortcut, String> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;

    for part in input.split('+').map(str::trim).filter(|s| !s.is_empty()) {
        let lower = part.to_ascii_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "win" | "super" | "meta" | "cmd" | "command" => mods |= Modifiers::SUPER,
            _ => {
                if code.is_some() {
                    return Err(format!("快捷键格式不正确：{input}"));
                }
                code = Some(key_code(&lower).ok_or_else(|| format!("不支持的按键：{part}"))?);
            }
        }
    }

    let code = code.ok_or_else(|| "快捷键缺少主键".to_string())?;
    if mods.is_empty() {
        return Err("快捷键至少需要一个修饰键（Ctrl / Alt / Shift / Win）".into());
    }
    Ok(Shortcut::new(Some(mods), code))
}

fn key_code(s: &str) -> Option<Code> {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() == 1 {
        let c = chars[0];
        if c.is_ascii_alphabetic() {
            return letter(c.to_ascii_uppercase());
        }
        if c.is_ascii_digit() {
            return digit(c);
        }
    }
    Some(match s {
        "space" => Code::Space,
        "enter" | "return" => Code::Enter,
        "escape" | "esc" => Code::Escape,
        "tab" => Code::Tab,
        "backspace" => Code::Backspace,
        "delete" | "del" => Code::Delete,
        "insert" | "ins" => Code::Insert,
        "home" => Code::Home,
        "end" => Code::End,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "up" | "arrowup" => Code::ArrowUp,
        "down" | "arrowdown" => Code::ArrowDown,
        "left" | "arrowleft" => Code::ArrowLeft,
        "right" | "arrowright" => Code::ArrowRight,
        "backquote" | "`" => Code::Backquote,
        "minus" | "-" => Code::Minus,
        "equal" | "=" => Code::Equal,
        "semicolon" | ";" => Code::Semicolon,
        "quote" | "'" => Code::Quote,
        "comma" | "," => Code::Comma,
        "period" | "." => Code::Period,
        "slash" | "/" => Code::Slash,
        "backslash" | "\\" => Code::Backslash,
        "bracketleft" | "[" => Code::BracketLeft,
        "bracketright" | "]" => Code::BracketRight,
        _ => return f_key(s),
    })
}

fn f_key(s: &str) -> Option<Code> {
    Some(match s {
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "f13" => Code::F13,
        "f14" => Code::F14,
        "f15" => Code::F15,
        "f16" => Code::F16,
        "f17" => Code::F17,
        "f18" => Code::F18,
        "f19" => Code::F19,
        "f20" => Code::F20,
        _ => return None,
    })
}

fn digit(c: char) -> Option<Code> {
    Some(match c {
        '0' => Code::Digit0,
        '1' => Code::Digit1,
        '2' => Code::Digit2,
        '3' => Code::Digit3,
        '4' => Code::Digit4,
        '5' => Code::Digit5,
        '6' => Code::Digit6,
        '7' => Code::Digit7,
        '8' => Code::Digit8,
        '9' => Code::Digit9,
        _ => return None,
    })
}

fn letter(c: char) -> Option<Code> {
    Some(match c {
        'A' => Code::KeyA,
        'B' => Code::KeyB,
        'C' => Code::KeyC,
        'D' => Code::KeyD,
        'E' => Code::KeyE,
        'F' => Code::KeyF,
        'G' => Code::KeyG,
        'H' => Code::KeyH,
        'I' => Code::KeyI,
        'J' => Code::KeyJ,
        'K' => Code::KeyK,
        'L' => Code::KeyL,
        'M' => Code::KeyM,
        'N' => Code::KeyN,
        'O' => Code::KeyO,
        'P' => Code::KeyP,
        'Q' => Code::KeyQ,
        'R' => Code::KeyR,
        'S' => Code::KeyS,
        'T' => Code::KeyT,
        'U' => Code::KeyU,
        'V' => Code::KeyV,
        'W' => Code::KeyW,
        'X' => Code::KeyX,
        'Y' => Code::KeyY,
        'Z' => Code::KeyZ,
        _ => return None,
    })
}
