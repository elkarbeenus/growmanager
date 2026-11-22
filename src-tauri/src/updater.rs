//! Selbst-Update aus den GitHub-Releases des Projekts.
//!
//! Ablauf: Datei laden → SHA-256 gegen SHA256SUMS.txt aus demselben Release prüfen →
//! ersetzen → neu starten. Daten (localStorage, Einstellungen) bleiben unberührt,
//! weil sie nicht in der Programmdatei liegen.
//!
//! - Linux (AppImage): die laufende AppImage-Datei (Umgebungsvariable APPIMAGE) wird
//!   atomar ersetzt (neue Datei im selben Ordner, dann umbenennen).
//! - Windows: das Setup läuft still (/S) und startet die App danach wieder.
//! - Alles andere (z. B. .deb-Installation, Entwicklungs-Build): nur Hinweis + Download-Seite.
//!
//! Abschalten (z. B. offline): Umgebungsvariable GROWMANAGER_NO_UPDATE=1.

use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(serde::Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .user_agent(concat!("growmanager-updater/", env!("CARGO_PKG_VERSION")))
        .build()
}

/// "appimage", "windows", "other" oder "off" (abgeschaltet).
#[tauri::command]
pub fn update_platform() -> String {
    if std::env::var_os("GROWMANAGER_NO_UPDATE").is_some() {
        return "off".into();
    }
    platform().into()
}

#[cfg(target_os = "linux")]
fn platform() -> &'static str {
    if std::env::var_os("APPIMAGE").is_some() {
        "appimage"
    } else {
        "other"
    }
}

#[cfg(target_os = "windows")]
fn platform() -> &'static str {
    "windows"
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn platform() -> &'static str {
    "other"
}

/// Prüfsumme der Datei `file_name` aus einer SHA256SUMS-Datei holen.
fn expected_sha(sums_url: &str, file_name: &str) -> Result<String, String> {
    let text = agent()
        .get(sums_url)
        .call()
        .map_err(|e| format!("Prüfsummen konnten nicht geladen werden: {e}"))?
        .into_string()
        .map_err(|e| e.to_string())?;
    parse_sums(&text, file_name).ok_or_else(|| format!("Keine Prüfsumme für {file_name} im Release gefunden"))
}

/// Zeilen im Format "<sha256>  <dateiname>" (wie sha256sum).
pub fn parse_sums(text: &str, file_name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        let base = name.rsplit('/').next().unwrap_or(name);
        (base == file_name && hash.len() == 64).then(|| hash.to_ascii_lowercase())
    })
}

fn download(window: &tauri::Window, url: &str, dest: &Path, expected: &str) -> Result<(), String> {
    let resp = agent().get(url).call().map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("Datei kann nicht angelegt werden ({}): {e}", dest.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 128 * 1024];
    let (mut done, mut last) = (0u64, 0u64);
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Download abgebrochen: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        hasher.update(&buf[..n]);
        done += n as u64;
        if done - last >= 256 * 1024 {
            last = done;
            let _ = window.emit("update-progress", Progress { done, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let _ = window.emit("update-progress", Progress { done, total: total.max(done) });

    let got = format!("{:x}", hasher.finalize());
    if !got.eq_ignore_ascii_case(expected) {
        let _ = std::fs::remove_file(dest);
        return Err("Prüfsumme stimmt nicht – der Download war beschädigt. Bitte erneut versuchen.".into());
    }
    Ok(())
}

/// Lädt und installiert das Update. Danach `update_restart` aufrufen.
#[tauri::command]
pub async fn update_install(window: tauri::Window, url: String, file_name: String, sums_url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let expected = expected_sha(&sums_url, &file_name)?;
        install(&window, &url, &expected)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(target_os = "linux")]
fn install(window: &tauri::Window, url: &str, expected: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let target = PathBuf::from(std::env::var_os("APPIMAGE").ok_or("Die App läuft nicht als AppImage")?);
    let tmp = target.with_file_name(format!(
        ".{}.update",
        target.file_name().and_then(|n| n.to_str()).unwrap_or("growmanager.AppImage")
    ));
    download(window, url, &tmp, expected)?;
    std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    // Umbenennen im selben Ordner ist atomar – die laufende Version bleibt bis zum Neustart intakt.
    std::fs::rename(&tmp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("AppImage konnte nicht ersetzt werden ({}): {e}", target.display())
    })
}

#[cfg(target_os = "windows")]
fn install(window: &tauri::Window, url: &str, expected: &str) -> Result<(), String> {
    let dir = std::env::temp_dir().join("growmanager-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    download(window, url, &dir.join("growmanager-setup.exe"), expected)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn install(_window: &tauri::Window, _url: &str, _expected: &str) -> Result<(), String> {
    Err("Automatisches Update ist auf diesem System nicht möglich".into())
}

/// Neue Version starten und die laufende beenden.
#[tauri::command]
pub fn update_restart(app: tauri::AppHandle) -> Result<(), String> {
    restart(&app)?;
    app.exit(0);
    Ok(())
}

#[cfg(target_os = "linux")]
fn restart(_app: &tauri::AppHandle) -> Result<(), String> {
    let target = std::env::var_os("APPIMAGE").ok_or("Die App läuft nicht als AppImage")?;
    std::process::Command::new(target)
        // Startwerte dieser Sitzung nicht vererben – die neue Version entscheidet selbst
        .env_remove("WEBKIT_DISABLE_COMPOSITING_MODE")
        .env_remove("APPIMAGE")
        .env_remove("APPDIR")
        .env_remove("ARGV0")
        .env_remove("OWD")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Neustart fehlgeschlagen: {e}"))
}

#[cfg(target_os = "windows")]
fn restart(_app: &tauri::AppHandle) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let setup = std::env::temp_dir().join("growmanager-update").join("growmanager-setup.exe");
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // kurz warten, bis diese Instanz beendet ist → Setup still ausführen → App wieder starten
    let script = format!(
        "/C timeout /t 2 /nobreak >nul & start \"\" /wait \"{}\" /S & start \"\" \"{}\"",
        setup.display(),
        exe.display()
    );
    std::process::Command::new("cmd")
        .raw_arg(script)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Setup konnte nicht gestartet werden: {e}"))
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn restart(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("Automatisches Update ist auf diesem System nicht möglich".into())
}

#[cfg(test)]
mod tests {
    use super::parse_sums;

    #[test]
    fn finds_hash_for_file() {
        let h = "a".repeat(64);
        let text = format!("{h}  growmanager_0.5.2_amd64.AppImage\n{}  growmanager_0.5.2_x64-setup.exe\n", "b".repeat(64));
        assert_eq!(parse_sums(&text, "growmanager_0.5.2_amd64.AppImage"), Some(h));
        assert_eq!(parse_sums(&text, "growmanager_0.5.2_x64-setup.exe"), Some("b".repeat(64)));
        assert_eq!(parse_sums(&text, "fehlt.deb"), None);
    }

    #[test]
    fn accepts_paths_and_binary_marker() {
        let h = "C".repeat(64);
        let text = format!("{h} *dist/linux/growmanager.AppImage");
        assert_eq!(parse_sums(&text, "growmanager.AppImage"), Some("c".repeat(64)));
    }
}
