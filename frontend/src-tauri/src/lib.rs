use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

#[derive(Default)]
struct BackendInfo {
    port: Arc<Mutex<Option<u16>>>,
    child: Arc<Mutex<Option<CommandChild>>>,
    // ADD THIS: Flag to prevent infinite close loop
    is_closing: Arc<Mutex<bool>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_info = BackendInfo::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(backend_info)
        .setup(|app| {
            let app_handle = app.handle().clone();

            // --- Conditional Backend Startup ---

            // In production, we spawn the sidecar executable
            #[cfg(not(debug_assertions))]
            {
                let backend_info = app.state::<BackendInfo>();
                let port_clone = Arc::clone(&backend_info.port);
                let child_clone = Arc::clone(&backend_info.child);

                tauri::async_runtime::spawn(async move {
                    let (mut rx, child) = app_handle.shell()
                        .command("backend_server")
                        .spawn()
                        .expect("Failed to spawn backend server");

                    *child_clone.lock().unwrap() = Some(child);

                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(bytes) = event {
                            // Convert the byte vector to a string.
                            let line = String::from_utf8_lossy(&bytes);

                            if line.starts_with("PYTHON_BACKEND_PORT:") {
                                if let Some(port_str) = line.strip_prefix("PYTHON_BACKEND_PORT:") {
                                    // Now that port_str is a &str, we can trim and parse it.
                                    if let Ok(port) = port_str.trim().parse::<u16>() {
                                        println!("Backend sidecar running on port: {}", port);
                                        *port_clone.lock().unwrap() = Some(port);
                                        let _ = app_handle.emit("backend-ready", port);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // In development, we connect to the manually started backend
            #[cfg(debug_assertions)]
            {
                let backend_info = app.state::<BackendInfo>();
                let dev_port = 8000; // Default port for the dev server
                *backend_info.port.lock().unwrap() = Some(dev_port);
                
                // We need to give the frontend a moment to be ready to receive the event.
                tauri::async_runtime::spawn(async move {
                    // A small delay ensures the JS listener is ready.
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    println!("DEV MODE: Emitting backend-ready event for port {}", dev_port);
                    let _ = app_handle.emit("backend-ready", dev_port);
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_backend_port
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let state = window.state::<BackendInfo>();
                
                // CRITICAL FIX: Check if we're already closing to prevent infinite loop
                {
                    let mut is_closing = state.is_closing.lock().unwrap();
                    if *is_closing {
                        // We're already closing, allow the window to close normally
                        return;
                    }
                    // Set the flag to indicate we're now in the closing process
                    *is_closing = true;
                }

                // Prevent the default close behavior only on the first attempt
                api.prevent_close();

                println!("Window close requested. Terminating backend server...");
                
                // Try graceful shutdown first
                if let Some(child) = state.child.lock().unwrap().take() {
                    if let Err(e) = child.kill() {
                        eprintln!("Failed to kill backend server gracefully: {}", e);
                    } else {
                        println!("Backend server terminated gracefully.");
                    }
                }
                
                // CROSS-PLATFORM FORCE KILL: Use platform-specific commands to ensure all processes are terminated
                println!("Force killing any remaining backend_server processes...");
                
                // Platform-specific force kill commands
                #[cfg(target_os = "windows")]
                let kill_result = std::process::Command::new("taskkill")
                    .args(&["/f", "/im", "backend_server.exe"])
                    .output();
                
                #[cfg(target_os = "macos")]
                let kill_result = std::process::Command::new("pkill")
                    .args(&["-f", "backend_server"])
                    .output();
                
                #[cfg(target_os = "linux")]
                let kill_result = std::process::Command::new("pkill")
                    .args(&["-f", "backend_server"])
                    .output();
                
                // Handle the result of the force kill command
                match kill_result {
                    Ok(result) => {
                        let stdout = String::from_utf8_lossy(&result.stdout);
                        let stderr = String::from_utf8_lossy(&result.stderr);
                        if result.status.success() {
                            println!("Force kill successful: {}", stdout);
                        } else {
                            // This is normal if no processes were found
                            #[cfg(target_os = "windows")]
                            println!("Force kill result: {}", stderr);
                            
                            #[cfg(any(target_os = "macos", target_os = "linux"))]
                            {
                                if result.status.code() == Some(1) {
                                    println!("No backend_server processes found to kill.");
                                } else {
                                    println!("Force kill result: {}", stderr);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        #[cfg(target_os = "windows")]
                        eprintln!("Failed to execute taskkill command: {}", e);
                        
                        #[cfg(any(target_os = "macos", target_os = "linux"))]
                        eprintln!("Failed to execute pkill command: {}", e);
                    }
                }
                
                // Now manually close the window
                let _ = window.close();
            }
            _ => {}
        })
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
