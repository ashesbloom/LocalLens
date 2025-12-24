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

// Recursively copy a directory (handles symlinks for macOS)
const copyDirRecursive = (src, dest) => {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Check if it's a symlink first (before checking directory/file)
    if (entry.isSymbolicLink()) {
      // Recreate the symlink
      const linkTarget = fs.readlinkSync(srcPath);
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.symlinkSync(linkTarget, destPath);
    } else if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const platform = os.platform();
const ext = platform === 'win32' ? '.exe' : '';
const triple = getTargetTriple();
const binaryName = `backend_server-${triple}${ext}`;
const binaryPath = path.join('src-tauri', binaryName);

// On macOS, PyInstaller uses one-folder mode for faster startup
// We copy the folder and create a wrapper script as the sidecar
if (platform === 'darwin') {
  const builtFolderPath = path.join('..', 'backend', 'dist', 'backend_server');
  const targetFolderPath = path.join('src-tauri', 'backend_server_bundle');
  const actualBinaryInFolder = path.join(builtFolderPath, 'backend_server');
  
  if (fs.existsSync(builtFolderPath) && fs.existsSync(actualBinaryInFolder)) {
    console.log(`[Dev Setup] Found one-folder backend at: ${builtFolderPath}`);
    
    // Copy entire folder to src-tauri
    console.log(`[Dev Setup] Copying folder to: ${targetFolderPath}`);
    if (fs.existsSync(targetFolderPath)) {
      fs.rmSync(targetFolderPath, { recursive: true, force: true });
    }
    copyDirRecursive(builtFolderPath, targetFolderPath);
    
    // Make the actual binary executable
    const targetBinary = path.join(targetFolderPath, 'backend_server');
    fs.chmodSync(targetBinary, 0o755);
    
    // Create a shell wrapper script that Tauri will execute as the sidecar
    // This wrapper handles both development and production paths:
    // - Dev: bundle is in same directory as wrapper (src-tauri/)
    // - Prod: bundle is in ../Resources/ relative to MacOS/ directory
    const wrapperScript = `#!/bin/bash
# Wrapper script for macOS one-folder PyInstaller bundle
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if we're in a bundled .app (production)
# In .app bundle: MacOS/backend_server-xxx and Resources/backend_server_bundle/
if [[ "$SCRIPT_DIR" == *".app/Contents/MacOS"* ]]; then
    # Production: Look in Resources directory
    BUNDLE_DIR="$SCRIPT_DIR/../Resources/backend_server_bundle"
else
    # Development: Bundle is in same directory
    BUNDLE_DIR="$SCRIPT_DIR/backend_server_bundle"
fi

# Verify the backend exists
if [[ ! -f "$BUNDLE_DIR/backend_server" ]]; then
    echo "ERROR: Backend not found at $BUNDLE_DIR/backend_server" >&2
    exit 1
fi

exec "$BUNDLE_DIR/backend_server" "$@"
`;
    
    console.log(`[Dev Setup] Creating wrapper script at: ${binaryPath}`);
    fs.writeFileSync(binaryPath, wrapperScript);
    fs.chmodSync(binaryPath, 0o755);
    console.log(`[Dev Setup] macOS one-folder bundle ready!`);
  } else if (!fs.existsSync(binaryPath)) {
    console.log(`[Dev Setup] Built backend folder not found at ${builtFolderPath}`);
    console.log(`[Dev Setup] Creating dummy backend binary at: ${binaryPath}`);
    fs.writeFileSync(binaryPath, '#!/bin/bash\necho "Dummy backend - build required"\n');
    fs.chmodSync(binaryPath, 0o755);
  } else {
    console.log(`[Dev Setup] Backend binary/wrapper exists at: ${binaryPath}`);
  }
} else {
  // Windows/Linux: Use single-file mode (simple copy)
  const builtBackendPath = path.join('..', 'backend', 'dist', `backend_server${ext}`);
  
  if (fs.existsSync(builtBackendPath)) {
    console.log(`[Dev Setup] Found built backend at: ${builtBackendPath}`);
    console.log(`[Dev Setup] Copying to: ${binaryPath}`);
    fs.copyFileSync(builtBackendPath, binaryPath);
    
    // On Linux, ensure the binary is executable
    if (platform !== 'win32') {
      fs.chmodSync(binaryPath, 0o755);
      console.log(`[Dev Setup] Set executable permissions on: ${binaryPath}`);
    }
  } else if (!fs.existsSync(binaryPath)) {
    console.log(`[Dev Setup] Built backend not found at ${builtBackendPath}`);
    console.log(`[Dev Setup] Creating dummy backend binary at: ${binaryPath}`);
    fs.writeFileSync(binaryPath, '');
  } else {
    console.log(`[Dev Setup] Backend binary exists at: ${binaryPath}`);
  }
  
  // Create empty placeholder folder for resources glob pattern (required by Tauri)
  const bundlePlaceholder = path.join('src-tauri', 'backend_server_bundle');
  if (!fs.existsSync(bundlePlaceholder)) {
    fs.mkdirSync(bundlePlaceholder, { recursive: true });
    // Create a placeholder file so glob matches something
    fs.writeFileSync(path.join(bundlePlaceholder, '.gitkeep'), '# Placeholder for macOS one-folder bundle\n');
    console.log(`[Dev Setup] Created placeholder folder: ${bundlePlaceholder}`);
  }
}
