#!/bin/bash

# Local Lens - Reproducible Build Script
# This script helps you build Local Lens from source with the same configuration used in CI

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
PYTHON_VERSION="3.11"
NODE_VERSION="18"
PROJECT_DIR=$(pwd)
BUILD_DIR="$PROJECT_DIR/build"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

print_status "Local Lens Reproducible Build Script"
print_status "======================================="

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the Local Lens project root directory"
    exit 1
fi

# Function to check command availability
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed or not in PATH"
        return 1
    fi
    return 0
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! check_command python3; then
    print_error "Python 3 is required. Please install Python $PYTHON_VERSION or higher"
    exit 1
fi

if ! check_command node; then
    print_error "Node.js is required. Please install Node.js $NODE_VERSION or higher"
    exit 1
fi

if ! check_command npm; then
    print_error "npm is required. Please install npm"
    exit 1
fi

if ! check_command cargo; then
    print_error "Rust/Cargo is required. Please install Rust from https://rustup.rs/"
    exit 1
fi

# macOS-specific: Check for Homebrew dependencies
if [[ "$OSTYPE" == "darwin"* ]]; then
    print_status "Detected macOS. Checking Homebrew dependencies..."
    
    if ! check_command brew; then
        print_error "Homebrew is required on macOS. Install from https://brew.sh/"
        exit 1
    fi
    
    # Check for required Homebrew packages
    REQUIRED_BREW_PACKAGES=("cmake" "dlib" "imagemagick")
    MISSING_PACKAGES=()
    
    for pkg in "${REQUIRED_BREW_PACKAGES[@]}"; do
        if ! brew list "$pkg" &>/dev/null; then
            MISSING_PACKAGES+=("$pkg")
        fi
    done
    
    if [ ${#MISSING_PACKAGES[@]} -ne 0 ]; then
        print_warning "Missing Homebrew packages: ${MISSING_PACKAGES[*]}"
        print_status "Installing missing packages..."
        brew install "${MISSING_PACKAGES[@]}"
    else
        print_success "All required Homebrew packages are installed"
    fi
fi

# Check Python version
PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
print_status "Python version: $PYTHON_VER"

# Check Node version
NODE_VER=$(node --version | sed 's/v//')
print_status "Node.js version: $NODE_VER"

# Check Rust version
RUST_VER=$(cargo --version | cut -d' ' -f2)
print_status "Rust version: $RUST_VER"

# Create build directory
print_status "Creating build directory..."
mkdir -p "$BUILD_DIR"

# Build Python backend
print_status "Building Python backend..."
cd "$BACKEND_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_status "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
print_status "Activating Python virtual environment..."
source venv/bin/activate

# Install dependencies
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

# Build backend executable
print_status "Building backend executable with PyInstaller..."
pyinstaller backend_server.spec --clean

# Check build success based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS uses one-folder mode for faster startup
    if [ ! -f "dist/backend_server/backend_server" ]; then
        print_error "Backend build failed - executable not found at dist/backend_server/backend_server"
        exit 1
    fi
    print_success "Backend built successfully (one-folder mode)"
else
    # Windows/Linux use one-file mode
    if [ ! -f "dist/backend_server" ] && [ ! -f "dist/backend_server.exe" ]; then
        print_error "Backend build failed - executable not found"
        exit 1
    fi
    print_success "Backend built successfully (one-file mode)"
fi

# Build frontend
print_status "Building frontend..."
cd "$FRONTEND_DIR"

# Install Node dependencies
print_status "Installing Node.js dependencies..."
npm ci

# Copy backend executable to Tauri binaries
print_status "Setting up backend for Tauri..."

# Use ensure-backend.js to handle platform-specific setup
print_status "Running ensure-backend.js..."
node ensure-backend.js

# Detect platform for logging
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux-gnu"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
        PLATFORM="darwin-arm64"
    else
        PLATFORM="darwin-x64"
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    PLATFORM="windows"
else
    PLATFORM="unknown"
fi

print_status "Platform detected: $PLATFORM"

# Build Tauri application
print_status "Building Tauri application..."
npm run tauri build

if [ $? -eq 0 ]; then
    print_success "Frontend built successfully"
else
    print_error "Frontend build failed"
    exit 1
fi

# Generate checksums
print_status "Generating checksums..."
cd "src-tauri/target/release/bundle"

# Find all installer files
INSTALLERS=$(find . -name "*.msi" -o -name "*.exe" -o -name "*.dmg" -o -name "*.deb" -o -name "*.AppImage" 2>/dev/null | grep -v "debug")

if [ -z "$INSTALLERS" ]; then
    print_warning "No installer files found"
else
    print_status "Found installers:"
    echo "$INSTALLERS"
    
    # Generate checksums
    echo "$INSTALLERS" | xargs shasum -a 256 > checksums.txt
    print_success "Checksums generated in checksums.txt"
    cat checksums.txt
fi

# Summary
print_status "Build Summary"
print_status "============="
print_status "Platform: $PLATFORM"
print_status "Python: $PYTHON_VER"
print_status "Node.js: $NODE_VER"  
print_status "Rust: $RUST_VER"
print_status "Build directory: $BUILD_DIR"
print_status "Installers location: $FRONTEND_DIR/src-tauri/target/release/bundle"

if [ -f "checksums.txt" ]; then
    print_success "Build completed successfully!"
    print_status "Checksums:"
    cat checksums.txt
else
    print_warning "Build completed but no installers found"
fi

print_status ""
print_status "To verify this build matches the official release:"
print_status "1. Compare the checksums with those in the GitHub release"
print_status "2. Verify the commit hash matches the release tag"
print_status "3. Check that dependencies match requirements.txt and package.json"
print_status ""
print_success "Reproducible build complete!"
