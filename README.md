# Local Lens
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)]()
[![Build Status](https://img.shields.io/badge/Build-Passing-green.svg)]()
[![GitHub release](https://img.shields.io/github/v/release/ashesbloom/LocalLens)](https://github.com/ashesbloom/LocalLens/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/ashesbloom/LocalLens/total)](https://github.com/ashesbloom/LocalLens/releases)

![GitHub stars ](https://img.shields.io/github/stars/ashesbloom/LocalLens?style=social&cacheSeconds=60)
![GitHub forks ](https://img.shields.io/github/forks/ashesbloom/LocalLens?style=social&cacheSeconds=60)
![GitHub repo size ](https://img.shields.io/github/repo-size/ashesbloom/LocalLens)
[![Buy Me A Coffee](https://img.shields.io/badge/-Buy%20me%20a%20coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://coff.ee/ashesbloom)

**Local Lens** is a powerful, AI-driven photo organization application that intelligently sorts and categorizes your photo collection using advanced facial recognition, location data, and metadata analysis. Built with modern technologies, it provides a seamless desktop experience.

## 🖥️ Software Preview

Take a look at Local Lens in action:

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview1.png?raw=true" alt="Local Lens Main Dashboard" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview2.png?raw=true" alt="Face Recognition in Local Lens" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview3.png?raw=true" alt="Photo Organization by Location" width="250"/>
</p>

Different Modes of Local Lens:
<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview4.png?raw=true" alt="Different Modes of Local Lens" width="520" style="display:block; margin: 0 auto 16px auto;"/>
</p>
<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview5.png?raw=true" alt="Different Modes of Local Lens" width="250"/>
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/preview6.png?raw=true" alt="Different Modes of Local Lens" width="250"/>
</p>

> _Screenshots are for illustration. UI may evolve with updates._

## 🎯 Vision & Purpose

**Local Lens** revolutionizes photo management with intelligent, privacy-first automation. Designed for photographers, families, and anyone with thousands of digital memories, it transforms overwhelming photo organization into an effortless, secure experience.

### The Challenge We Solve
Manual photo sorting is tedious, and cloud solutions risk your privacy. Local Lens brings enterprise-grade AI directly to your desktop—no subscriptions, no data leaving your device.

### Core Philosophy: Privacy-First Intelligence
- **🔒 100% Local Processing**: All AI and analysis run on your machine
- **🛡️ Zero Data Transmission**: Photos never leave your device
- **⚡ Lightning-Fast Search**: Dynamic, real-time filters
- **🔍 Multi-Dimensional Discovery**: Search by faces, dates, locations, or combinations

### Intelligent Organization Features
- **📅 Smart Date Sorting**: Chronological organization via metadata
- **🗺️ Location Intelligence**: GPS clustering and reverse geocoding
- **👤 Face Recognition**: Train AI to recognize people
- **🔄 Dynamic Filtering**: Real-time, responsive search
- **📊 Analytics**: Insights into your photo collection

### Enterprise-Grade Safety & Reliability
- **💾 Data Integrity**: Multiple validation layers for safety
- **🔄 Non-Destructive**: Originals untouched, smart duplicate management
- **📋 Logging**: Complete audit trail
- **⚠️ Robust Error Handling**: Graceful recovery from interruptions
- **🎯 Precision Accuracy**: Advanced algorithms minimize false positives

### Advanced Features
- **👥 Face Enrollment**: Teach AI to recognize specific people
- **🌍 Cross-Platform**: Native on Windows, macOS, Linux
- **💾 Persistent Config**: Save/load sorting presets
- **🔍 Real-Time Preview**: Live analytics and progress
- **🎨 Modern UI**: Clean interface with React & Tauri

#### 🧠 Enhanced Automatic Strategy (How Local Lens Stays Fast & Accurate)

Local Lens uses an adaptive, two-pass face recognition strategy for maximum accuracy and stability:

- **Conservative Start**: Begins with minimal parallel processing for stability on all hardware.
- **Best-Model First**: Tries the high-accuracy 'cnn' model for each image.
- **Intelligent Fallback**: If 'cnn' fails (e.g., due to memory limits), it logs a warning and instantly retries with the lighter 'hog' model—ensuring no image is skipped.
- **Accurate Model Approach**: 
    - **First Pass**: Runs the fast 'hog' model for initial detection.
    - **Confidence Check**: If a high-confidence match is found, it's accepted.
    - **Second Pass**: If not, escalates to the more accurate 'cnn' model for tough cases.

This guarantees the best possible result for every photo, adapting to your hardware and image complexity—never crashing or missing faces.


### 🖼️ Supported Formats

Local Lens supports a wide range of image formats for both professional and casual users:

`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.webp`, `.heic`, `.heif`, `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.raf`, `.avif`, `.psd`, `.hdr`

Whether you shoot on a phone or a pro camera, your images are covered.

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
[![Tauri](https://img.shields.io/badge/Tauri-1.0+-24c8db.svg?logo=tauri&logoColor=white)](https://tauri.app/)
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
  - `rawpy` - RAW image format support
- **Geolocation**: `reverse_geocoder` for location data
- **Server**: `uvicorn` ASGI server

### Build & Distribution
- **Python Bundling**: PyInstaller for creating standalone executables
- **Desktop Packaging**: Tauri for cross-platform application packaging
- **Installer Generation**: Platform-specific installers (.msi, .dmg, .deb, .AppImage)

## 📋 Prerequisites


### For Normal Users
- **No prerequisites** - The distributed application includes all dependencies

## 🚀 Quick Start

### Option 1: Download Pre-built Release (Recommended)
1. Visit the [Releases page](https://github.com/ashesbloom/LocalLens/releases)
2. Download the installer for your platform:
   - Windows: `Local_Lens_x.x.x_x64_en-US.msi`
   - macOS: _Releasing soon_
   - Linux: _Releasing soon_
3. Run the installer and follow the setup wizard
4. Launch Local Lens from your applications menu


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
```bash
brew install cmake
```

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
> If you found my project useful, please consider supporting me so I can build more projects like this, cuz I'm broke af:
[![Buy Me A Coffee](https://img.shields.io/badge/-Buy%20me%20a%20coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://coff.ee/ashesbloom)
> Alternatively, you can scan this UPI ID: [ Scan QR](https://drive.google.com/file/d/1jxE5fkx7AZc4rgabLLM8TGaPb09pJEAl/view?usp=sharing)
