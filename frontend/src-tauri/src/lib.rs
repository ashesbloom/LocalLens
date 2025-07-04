use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use std::time::Duration;

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
                let shell = app_handle.shell();

                match shell.sidecar("backend_server") {
                    Ok(command) => {
                        println!("Starting Python backend server...");

                        let (mut rx, mut _child) = command
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
                    }
                    Err(e) => {
                        println!("Failed to start backend server: {}", e);
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

// NEW: Command to get the backend port
#[tauri::command]
fn get_backend_port(backend_info: State<BackendInfo>) -> Option<u16> {
    *backend_info.port.lock().unwrap()
}

#[derive(Default)]
struct BackendInfo {
    port: Arc<Mutex<Option<u16>>>,
}
