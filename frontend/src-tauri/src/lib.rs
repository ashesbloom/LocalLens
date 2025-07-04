use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_info = BackendInfo::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(backend_info)
        .setup(|app| {
            let backend_info = app.state::<BackendInfo>();
            let port_clone = Arc::clone(&backend_info.port);
            let app_handle = app.handle().clone();

            // Start the Python backend as a sidecar
            tauri::async_runtime::spawn(async move {
                // FIX: Use "app_handle" which was defined above, instead of "handle".
                let (mut rx, _child) = app_handle.shell()
                    .command("backend_server") 
                    .args([""]) // Keep this if it's working for you
                    .spawn()
                    .expect("Failed to spawn backend server");

                // Listen for output from the Python process
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line = String::from_utf8_lossy(&line);
                            println!("Backend stdout: {}", line);

                            // Look for the port announcement
                            if line.starts_with("PYTHON_BACKEND_PORT:") {
                                if let Some(port_str) = line.strip_prefix("PYTHON_BACKEND_PORT:")
                                {
                                    if let Ok(port) = port_str.trim().parse::<u16>() {
                                        println!("Backend server running on port: {}", port);
                                        *port_clone.lock().unwrap() = Some(port);

                                        // Emit event to frontend with the port
                                        let _ = app_handle.emit("backend-ready", port);
                                    }
                                }
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let line = String::from_utf8_lossy(&line);
                            println!("Backend stderr: {}", line);
                        }
                        CommandEvent::Error(error) => {
                            println!("Backend error: {}", error);
                        }
                        CommandEvent::Terminated(payload) => {
                            println!("Backend terminated with code: {:?}", payload.code);
                            break;
                        }
                        _ => {
                            // Handle any other CommandEvent variants
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_backend_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// FINAL FIX: This async version waits for the port, eliminating race conditions.
#[tauri::command]
async fn get_backend_port(backend_info: State<'_, BackendInfo>) -> Result<Option<u16>, String> {
    // Wait for up to 5 seconds for the port to become available.
    for _ in 0..50 {
        // Create a new scope to ensure the MutexGuard is dropped before .await
        {
            let port_lock = backend_info.port.lock().unwrap();
            if let Some(port) = *port_lock {
                return Ok(Some(port)); // Success: return immediately.
            }
        }
        // The lock is released here, so it's safe to await.
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Ok(None) // Timeout: return Ok(None) if the port wasn't found.
}

#[derive(Default)]
struct BackendInfo {
    port: Arc<Mutex<Option<u16>>>,
}
