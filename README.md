# Local Lens

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)]()
[![Build Status](https://img.shields.io/badge/Build-Passing-green.svg)]()
![GitHub release ](https://img.shields.io/github/v/release/ashesbloom/LocalLens)
![GitHub downloads ](https://img.shields.io/github/downloads/ashesbloom/LocalLens/total)

![GitHub stars ](https://img.shields.io/github/stars/ashesbloom/LocalLens?style=social)
![GitHub forks ](https://img.shields.io/github/forks/ashesbloom/LocalLens?style=social)
![GitHub repo size ](https://img.shields.io/github/repo-size/ashesbloom/LocalLens)

**Local Lens** is a powerful, AI-driven photo organization application that intelligently sorts and categorizes your photo collection using advanced facial recognition, location data, and metadata analysis. Built with modern technologies, it provides a seamless desktop experience.

## 🌟 Features

### 🎯 Vision & Purpose

**Local Lens** revolutionizes how you manage massive photo collections through intelligent, privacy-first automation. Designed for photographers, families, and anyone drowning in thousands of digital memories, this application transforms the overwhelming task of photo organization into an effortless, secure experience.

#### The Challenge We Solve
Managing tens of thousands of photos manually is a labor-intensive nightmare. Traditional cloud solutions compromise your privacy and require expensive subscriptions. Local Lens addresses this by bringing enterprise-grade AI capabilities directly to your desktop.

#### Core Philosophy: Privacy-First Intelligence
- **🔒 100% Local Processing**: All AI models, face recognition, and data analysis happen entirely on your machine
- **🛡️ Zero Data Transmission**: Your photos never leave your device - ultimate security guaranteed
- **⚡ Lightning-Fast Search**: Find any photo in minutes using dynamic, real-time filters
- **🔍 Multi-Dimensional Discovery**: Search by faces, dates, locations, or any combination simultaneously

#### Intelligent Organization Features
- **📅 Smart Date Sorting**: Automatic chronological organization with metadata extraction
- **🗺️ Location Intelligence**: GPS-based clustering and reverse geocoding for place-based organization
- **👤 Face Recognition**: Train the AI to recognize family members, friends, and recurring subjects
- **🔄 Dynamic Filtering**: Real-time search results that update as you type and adjust filters
- **📊 Comprehensive Analytics**: Detailed insights into your photo collection patterns

#### Enterprise-Grade Safety & Reliability
- **💾 Data Integrity Guarantee**: Multiple validation layers ensure 100% data safety during processing
- **🔄 Non-Destructive Operations**: Original files remain untouched with smart duplicate management
- **📋 Detailed Logging**: Complete audit trail of all organizational activities
- **⚠️ Robust Error Handling**: Graceful recovery from any processing interruptions
- **🎯 Precision Accuracy**: Advanced algorithms minimize false positives in face detection and matching

Whether you're a professional photographer with massive archives, a family preserving decades of memories, or anyone tired of scrolling endlessly through unorganized photos, Local Lens transforms chaos into clarity while keeping your privacy absolutely protected.

### Advanced Features
- **👥 Face Enrollment**: Train the AI to recognize specific people in your photos
- **🌍 Cross-Platform Support**: Native applications for Windows, macOS, and Linux
- **💾 Persistent Configuration**: Save and load sorting preferences and presets
- **🔍 Real-Time Preview**: Live analytics and progress tracking during operations
- **🎨 Modern UI**: Clean, intuitive interface built with React and Tauri

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
1. Visit the [Releases page](https://github.com/your-username/local-lens/releases)
2. Download the installer for your platform:
   - Windows: `Local_Lens_x.x.x_x64-setup.exe` or `Local_Lens_x.x.x_x64_en-US.msi`
   - macOS: `Local_Lens_x.x.x_x64.dmg`
   - Linux: `Local_Lens_x.x.x_amd64.deb` or `Local_Lens_x.x.x_x86_64.AppImage`
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

** ⛓️‍💥 Engineered with purpose by [Mayank Pandey](https://www.linkedin.com/in/onlinerecord-mayank/)**
