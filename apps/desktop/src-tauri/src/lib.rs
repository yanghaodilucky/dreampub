use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct LocalService(Mutex<Option<CommandChild>>);

fn start_local_service(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (_, child) = app
        .shell()
        .sidecar("dreampub-server")?
        .args(["--host", "127.0.0.1", "--port", "8000"])
        .spawn()?;
    app.manage(LocalService(Mutex::new(Some(child))));
    Ok(())
}

fn stop_local_service(app: &AppHandle) {
    if let Some(service) = app.try_state::<LocalService>() {
        if let Ok(mut child) = service.0.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| start_local_service(app.handle()).map_err(Into::into))
        .build(tauri::generate_context!())
        .expect("error while building DreamPub desktop application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                stop_local_service(app);
            }
        });
}
