# Local Lens

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue.svg)](https://github.com/ashesbloom/LocalLens/releases/latest)
[![GitHub release](https://img.shields.io/github/v/release/ashesbloom/LocalLens)](https://github.com/ashesbloom/LocalLens/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/ashesbloom/LocalLens/total?color=success&label=Downloads)](https://github.com/ashesbloom/LocalLens/releases/latest)

![GitHub stars ](https://img.shields.io/github/stars/ashesbloom/LocalLens?style=social&cacheSeconds=60)
![GitHub forks ](https://img.shields.io/github/forks/ashesbloom/LocalLens?style=social&cacheSeconds=60)
![Views](https://komarev.com/ghpvc/?username=ashesbloom&repo=Locallens&color=blue&style=plastic&label=Views+so+far)

<br />
<div align="center">
  <h1>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/frontend/src-tauri/icons/StoreLogo.png?raw=true" alt="Local Lens Logo" width="120" />
    <br />
    Your Memories, Your Machine, Your Privacy.
  </h1>
  <p><strong>Local Lens</strong> is the AI-powered home for your photos. Sort by face, location, and date entirely offline.</p>
  
  <h3>
    <a href="https://github.com/ashesbloom/LocalLens/releases/latest">📥 Download Latest Version</a>
  </h3>
  <p>
    <a href="https://github.com/ashesbloom/LocalLens/releases/latest"><img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"/></a>
    <a href="https://github.com/ashesbloom/LocalLens/releases/latest"><img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS"/></a>
  </p>
  <p><em>Linux support coming soon</em></p>
</div>
<br />

## � Quick Install

### macOS (Homebrew) — Recommended
```bash
brew install ashesbloom/locallens/local-lens
```
> Homebrew handles Gatekeeper automatically — no extra steps needed!

### macOS (Manual DMG)
1. Download the `.dmg` from [Releases](https://github.com/ashesbloom/LocalLens/releases/latest)
2. Drag **Local Lens** to Applications
3. **Fix Gatekeeper** (required for unsigned apps):
   - Download and double-click `Fix_Local_Lens.command` from the release
   - Or: Right-click the app → Open → Click "Open"
   - Or run in Terminal:
     ```bash
     xattr -cr "/Applications/Local Lens.app" && codesign --force --deep --sign - "/Applications/Local Lens.app"
     ```

### Windows
Download and run the `.msi` or `.exe` installer from [Releases](https://github.com/ashesbloom/LocalLens/releases/latest).

<br />

## 🖥️ Software Preview

See how Local Lens organizes thousands of photos in seconds:

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview1.png?raw=true" alt="Local Lens Main Dashboard" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview2.png?raw=true" alt="Face Recognition in Local Lens" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview3.png?raw=true" alt="Photo Organization by Location" width="250"/>
</p>

### Different Modes & Themes
<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview4.png?raw=true" alt="Different Modes of Local Lens" width="520" style="display:block; margin: 0 auto 16px auto;"/>
</p>
<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview5.png?raw=true" alt="Dark Mode Interface" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview6.png?raw=true" alt="Light Mode Interface" width="250"/>
</p>

> _Screenshots are for illustration. UI evolves with every update._

---

## 🆚 Why Local Lens?

| Feature | ☁️ Cloud Services (Google/iCloud) | 🔒 Local Lens |
| :--- | :--- | :--- |
| **Privacy** | Your photos are scanned for ads/data | **100% Private. Zero data leaves your PC.** |
| **Cost** | Monthly Subscription ($$$) | **Free & Open Source** |
| **Storage** | Limited (15GB cap) | **Unlimited (Limited only by your HDD)** |
| **Speed** | Depends on Internet speed | **Instant (Local Processing)** |
| **AI Processing** | Server-side | **On-Device (CNN & HOG Models)** |

## 🎯 Vision & Purpose

**Local Lens** revolutionizes photo management with intelligent, privacy-first automation. Designed for photographers, data hoarders, families, and anyone with terabytes of digital memories, it transforms overwhelming photo organization into an effortless, secure experience.

### The Problem
Manual photo sorting is tedious. Cloud solutions get expensive and risk your privacy. 

### The Solution
Local Lens brings enterprise-grade AI directly to your desktop. No subscriptions, no upload times, no data harvesting.

### Core Features
- **🔒 100% Offline AI**: All facial recognition and analysis runs on your hardware.
- **👤 Face Recognition**: Train the AI to recognize friends and family.
- **🗺️ Location Intelligence**: Visualizes where your photos were taken (GPS clustering).
- **📅 Smart Timeline**: Auto-sorts messy folders into chronological order.
- **⚡ Lightning Search**: Dynamic filtering by date, location, or person.
- **🔄 Non-Destructive**: Your original files are never modified; we only organize.

### 🧠 Under the Hood: The "Enhanced Automatic Strategy"

How do we keep it fast without crashing your PC? Local Lens uses an adaptive, two-pass strategy:

1.  **The Speed Pass (HOG)**: We scan images using a lightweight algorithm (Histogram of Oriented Gradients). If a face is clearly visible, we log it.
2.  **The Precision Pass (CNN)**: If the first pass is unsure, we escalate to a Convolutional Neural Network (CNN) for high-precision detection.
3.  **Intelligent Fallback**: If your hardware runs out of memory, the system automatically adjusts to a lighter model instantly.

*This guarantees the best possible result for every photo, adapting to your specific hardware.*

---

## 🖼️ Supported Formats

Whether you shoot on an iPhone or a DSLR, we've got you covered:

`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp`, `.heic`, `.heif`  
**RAW Support:** `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.raf`, `.avif`, `.psd`

---

## 🏗️ Architecture

Local Lens uses a hybrid architecture combining the best of web and desktop technologies:

```
                          ┌───────────────────────────────────────────────────┐
                          │                 Tauri Desktop App                 │
                          │  ┌─────────────────────────────────────────────┐  │
                          │  │           React Frontend (UI)               │  |
                          │  │  • Modern React with Hooks                  │  |
                          │  │  • Vite for fast development                │  |
                          │  │  • Real-time communication with backend     │  |
                          │  └─────────────────────────────────────────────┘  │
                          │                      | |                          |
                          │  ┌─────────────────────────────────────────────┐  │
                          │  │         Python Backend (Sidecar)            │  |
                          │  │  • FastAPI REST server                      │  |
                          │  │  • AI face recognition engine               │  |
                          │  │  • Image processing pipeline                │  |
                          │  │  • Metadata extraction & analysis           │  |
                          │  └─────────────────────────────────────────────┘  │
                          └───────────────────────────────────────────────────┘
```

## 🛠️ Technology Stack

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg?logo=python&logoColor=white)](https://python.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg?logo=javascript&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg?logo=react&logoColor=white)](https://reactjs.org/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24c8db.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![Vite](https://img.shields.io/badge/Vite-4.0+-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)

### Frontend
- **Framework**: React.js with modern hooks
- **Build Tool**: Vite for fast development and building
- **Desktop Framework**: Tauri (Rust-based) for native desktop integration
- **UI Components**: Custom components with CSS modules
- **State Management**: React hooks with localStorage persistence

### Backend
- **Language**: Python 3.11+
- **API Framework**: FastAPI for high-performance REST API
- **AI/ML Libraries**:
  - `face_recognition` - Facial detection and recognition
  - `dlib` - Computer vision and machine learning toolkit
  - `numpy` - Numerical computing
- **Image Processing**:
  - `Pillow` - Python Imaging Library
  - `Pillow-HEIF` - HEIF/HEIC format support
  - `rawpy` - RAW image format support (Windows)
  - `Wand` - ImageMagick binding for RAW support (macOS/Linux)
- **Geolocation**: `reverse_geocoder` for location data
- **Server**: `uvicorn` ASGI server

### Build & Distribution

- **Python Bundling**: PyInstaller for creating standalone executables
- **Desktop Packaging**: Tauri for cross-platform application packaging
- **Installer Generation**: Platform-specific installers (.msi, .dmg, .deb, .AppImage)

## 📋 Prerequisites

### For Normal Users

- **No prerequisites** - The distributed application includes all dependencies

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

- **Xcode Command Line Tools** - [Install](https://developer.apple.com/xcode/downloads/)
- **CMake** - [Install via Homebrew](https://brew.sh/)
- **dlib** - Pre-compiled library (required for face recognition)
- **ImageMagick** - For RAW image processing (alternative to rawpy)

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install required Homebrew packages
brew install cmake dlib imagemagick
```

> **Note for Apple Silicon (M1/M2/M3) Macs**: The `dlib` library must be installed via Homebrew first due to compatibility issues with newer Python versions. This is handled automatically when you follow the installation steps above.

##### Linux (Ubuntu/Debian)

- **Build essentials and development tools**
```bash
sudo apt update
sudo apt install build-essential cmake libopenblas-dev liblapack-dev
sudo apt install python3-dev python3-venv pkg-config
```

##### Linux (CentOS/RHEL/Fedora)

- **Development tools and dependencies**
```bash
# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install cmake openblas-devel lapack-devel python3-devel

# Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install cmake openblas-devel lapack-devel python3-devel
```


## 📁 Project Structure

```
local-lens/
├── backend/                    # Python FastAPI backend
│   ├── main.py                # Main FastAPI application
│   ├── organizer_logic.py     # Core photo organization logic
│   ├── enrollment_logic.py    # Face recognition training
│   ├── exceptions.py          # Custom exception classes
│   ├── requirements.txt       # Python dependencies
│   ├── long_path_manifest.xml # Windows long path support
│   └── venv/                  # Python virtual environment
├── frontend/                   # React + Tauri frontend
│   ├── src/                   # React source code
│   │   ├── App.jsx           # Main application component
│   │   ├── components/       # React components
│   │   └── assets/           # Static assets
│   ├── src-tauri/            # Tauri configuration
│   │   ├── src/              # Rust source code
│   │   │   └── lib.rs        # Main Rust application
│   │   ├── tauri.conf.json   # Tauri configuration
│   │   ├── Cargo.toml        # Rust dependencies
│   │   └── icons/            # Application icons
│   ├── package.json          # Node.js dependencies
│   └── vite.config.js        # Vite configuration
├── docs/                      # Documentation
├── LICENSE                    # MIT License
└── README.md                  # This file
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly on your target platform(s)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request


## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [face_recognition](https://github.com/ageitgey/face_recognition) - Facial recognition library
- [Tauri](https://tauri.app/) - Desktop application framework
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://reactjs.org/) - Frontend framework
- [Vite](https://vitejs.dev/) - Build tool and development server

## 📞 Support
- 📧 **Email**: [mayankpandeydk123@gmail.com](mailto:mayankpandeydk123@gmail.com)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/ashesbloom/LocalLens/issues)
- 📖 **Documentation**: [Project Wiki](https://github.com/ashesbloom/LocalLens/blob/main/about/SRS.md#software-requirements-specification-srs-ai-powered-local-photo-organizer)

---

**⛓️‍💥 Engineered with purpose by [Mayank Pandey](https://www.linkedin.com/in/onlinerecord-mayank/)**
> If you found my project useful, please consider supporting me so I can build more projects like this,
> cuz I'm broke af: [![Buy Me A Coffee](https://img.shields.io/badge/-Buy%20me%20a%20coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://coff.ee/ashesbloom)
> 
> Alternatively, you can scan this UPI ID: <br><br>
> <img width="150" height="150" alt="image" src="https://github.com/user-attachments/assets/b21d0e47-254f-4402-a99f-46d8c9add1ad" />


