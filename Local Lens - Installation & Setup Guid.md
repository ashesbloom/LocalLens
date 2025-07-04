# Local Lens - Installation & Setup Guide

## 📋 Prerequisites

### For Development

#### Required Software
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
- **Python** (3.11 or higher) - [Download](https://python.org/)
- **Git** - [Download](https://git-scm.com/)

#### Platform-Specific Requirements

##### Windows
- **Visual Studio Build Tools** or **Visual Studio Community**
  - Install "C++ CMake tools for Visual Studio" workload
  - Or install standalone: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- **CMake** - [Download](https://cmake.org/download/)

##### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CMake via Homebrew
brew install cmake

# For Apple Silicon Macs, you may need additional setup for dlib
export CMAKE_OSX_ARCHITECTURES=arm64
```

##### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install build-essential cmake libopenblas-dev liblapack-dev libx11-dev libgtk-3-dev libwebkit2gtk-4.0-dev
```

##### Linux (CentOS/RHEL/Fedora)
```bash
sudo dnf install gcc gcc-c++ cmake openblas-devel lapack-devel gtk3-devel webkit2gtk3-devel
```

### For End Users
- **No prerequisites** - The distributed application includes all dependencies

## 🚀 Quick Start

### Option 1: Download Pre-built Release (Recommended)
1. Visit the [Releases page](https://github.com/your-username/local-lens/releases)
2. Download the installer for your platform:
   - Windows: `Local_Lens_x.x.x_x64-setup.exe` or `Local_Lens_x.x.x_x64_en-US.msi`
   - macOS: `Local_Lens_x.x.x_x64.dmg`
   - Linux: `Local_Lens_x.x.x_amd64.deb` or `Local_Lens_x.x.x_x86_64.AppImage`
3. Run the installer and follow the setup wizard
4. Launch Local Lens from your applications menu

### Option 2: Build from Source
Follow the [Development Setup](#-development-setup) section below.

## 💻 Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/local-lens.git
cd local-lens
```

### 2. Set Up the Python Backend

#### Create Virtual Environment
```bash
cd backend
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

#### Install Python Dependencies
```bash
# Install core dependencies
pip install -r requirements.txt

# Note: face_recognition installation may take 10-15 minutes
# as it compiles dlib from source
```

#### Troubleshooting Python Dependencies

**If `face_recognition` installation fails:**

*Windows:*
```bash
# Ensure Visual Studio Build Tools are installed
# Try installing dlib separately first:
pip install cmake
pip install dlib
pip install face_recognition
```

*macOS (especially Apple Silicon):*
```bash
# Set architecture for Apple Silicon
export CMAKE_OSX_ARCHITECTURES=arm64
pip install cmake
pip install dlib
pip install face_recognition
```

*Linux:*
```bash
# Ensure development packages are installed
sudo apt install build-essential cmake libopenblas-dev liblapack-dev
pip install dlib
pip install face_recognition
```

### 3. Set Up the Frontend

```bash
cd ../frontend
npm install
```

### 4. Development Workflow

#### Terminal 1: Python Backend (Development Server)
```bash
cd backend
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
python main.py
```
The backend will start on `http://127.0.0.1:8000`

#### Terminal 2: Frontend Development
```bash
cd frontend
npm run tauri dev
```
This will:
- Start the Vite development server
- Launch the Tauri desktop application
- Enable hot-reload for frontend changes

## 🔧 Building for Production

### Prerequisites Check
Before building, ensure all development dependencies are properly installed:

```bash
# Verify Node.js
node --version  # Should be v18+

# Verify Rust
rustc --version

# Verify Python environment
cd backend
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
python -c "import face_recognition; print('✅ Face recognition ready')"
```

### Step 1: Build Python Backend Executable

```bash
cd backend
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Create standalone executable with PyInstaller
python -m PyInstaller --name="backend_server" --onefile \
  --manifest="long_path_manifest.xml" \
  --add-data="venv/Lib/site-packages/face_recognition_models/models;face_recognition_models/models" \
  --add-data="venv/Lib/site-packages/reverse_geocoder/rg_cities1000.csv;reverse_geocoder" \
  main.py
```

**Platform-specific notes:**
- **Windows**: Use semicolon (`;`) as path separator in `--add-data`
- **macOS/Linux**: Use colon (`:`) as path separator in `--add-data`

The executable will be created in `backend/dist/backend_server.exe` (Windows) or `backend/dist/backend_server` (macOS/Linux).

### Step 2: Copy Backend to Tauri

```bash
# Windows
copy "backend\dist\backend_server.exe" "frontend\src-tauri\"

# macOS/Linux
cp backend/dist/backend_server frontend/src-tauri/
```

### Step 3: Build Desktop Application

```bash
cd frontend

# Build production version
npm run tauri build
```

This will create:
- **Windows**: `.msi` and `.exe` installers in `src-tauri/target/release/bundle/`
- **macOS**: `.dmg` installer and `.app` bundle
- **Linux**: `.deb`, `.AppImage`, or `.rpm` packages

### Build Output Locations

```
frontend/src-tauri/target/release/bundle/
├── msi/           # Windows MSI installer
├── nsis/          # Windows NSIS installer  
├── dmg/           # macOS disk image
├── macos/         # macOS app bundle
├── deb/           # Debian package
├── appimage/      # Linux AppImage
└── rpm/           # RPM package
```

## ⚠️ Important Notes & Troubleshooting

### Memory Considerations
- The AI face recognition uses significant memory. For large photo collections (>1000 photos), ensure at least 8GB RAM
- The application automatically falls back to less memory-intensive algorithms when needed

### Performance Optimization
- Face recognition is CPU-intensive. Processing time scales with image resolution and number of faces
- For faster processing, consider resizing very large images before organization

### Data Storage
- Application data is stored in platform-specific locations:
  - **Windows**: `%APPDATA%/LocalLens/`
  - **macOS**: `~/Library/Application Support/LocalLens/`
  - **Linux**: `~/.config/LocalLens/`

### Common Build Issues

#### PyInstaller Issues
```bash
# Clear PyInstaller cache if build fails
python -m PyInstaller --clean backend_server.spec

# For "module not found" errors, add missing modules:
python -m PyInstaller --hidden-import=missing_module_name ...
```

#### Tauri Build Issues
```bash
# Clear Tauri build cache
npm run tauri clean

# Rebuild node modules if needed
rm -rf node_modules package-lock.json
npm install
```

#### Face Recognition Issues
- Ensure Visual Studio Build Tools are properly installed on Windows
- On macOS, you may need to set `CMAKE_OSX_ARCHITECTURES=arm64` for Apple Silicon
- On Linux, install `libopenblas-dev` and `liblapack-dev`
