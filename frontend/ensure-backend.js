import fs from 'fs';
import path from 'path';
import os from 'os';

// Map Node.js platform/arch to Rust target triples
const getTargetTriple = () => {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'win32') {
    return arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'i686-pc-windows-msvc';
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else if (platform === 'linux') {
    return arch === 'x64' ? 'x86_64-unknown-linux-gnu' : 'i686-unknown-linux-gnu';
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
};

const ext = os.platform() === 'win32' ? '.exe' : '';
const triple = getTargetTriple();
const binaryName = `backend_server-${triple}${ext}`;
const binaryPath = path.join('src-tauri', binaryName);

// Path to the actual built backend executable (relative to frontend/)
const builtBackendPath = path.join('..', 'backend', 'dist', `backend_server${ext}`);

if (fs.existsSync(builtBackendPath)) {
  console.log(`[Dev Setup] Found built backend at: ${builtBackendPath}`);
  console.log(`[Dev Setup] Copying to: ${binaryPath}`);
  fs.copyFileSync(builtBackendPath, binaryPath);
} else if (!fs.existsSync(binaryPath)) {
  console.log(`[Dev Setup] Built backend not found at ${builtBackendPath}`);
  console.log(`[Dev Setup] Creating dummy backend binary at: ${binaryPath}`);
  fs.writeFileSync(binaryPath, '');
} else {
  console.log(`[Dev Setup] Backend binary exists at: ${binaryPath}`);
}
