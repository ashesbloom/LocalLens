@echo off
REM Local Lens - Windows Reproducible Build Script
REM This script helps you build Local Lens from source with the same configuration used in CI

setlocal enabledelayedexpansion

REM Configuration
set PYTHON_VERSION=3.11
set NODE_VERSION=18
set PROJECT_DIR=%cd%
set BUILD_DIR=%PROJECT_DIR%\build
set BACKEND_DIR=%PROJECT_DIR%\backend
set FRONTEND_DIR=%PROJECT_DIR%\frontend

echo [INFO] Local Lens Reproducible Build Script
echo [INFO] =======================================

REM Check if we're in the right directory
if not exist "README.md" (
    echo [ERROR] Please run this script from the Local Lens project root directory
    exit /b 1
)
if not exist "backend" (
    echo [ERROR] Backend directory not found
    exit /b 1
)
if not exist "frontend" (
    echo [ERROR] Frontend directory not found
    exit /b 1
)

REM Check prerequisites
echo [INFO] Checking prerequisites...

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in PATH
    exit /b 1
)

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Rust/Cargo is not installed or not in PATH
    exit /b 1
)

REM Check versions
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo [INFO] %PYTHON_VER%

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [INFO] Node.js version: %NODE_VER%

for /f "tokens=2" %%i in ('cargo --version') do set RUST_VER=%%i
echo [INFO] Rust version: %RUST_VER%

REM Create build directory
echo [INFO] Creating build directory...
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

REM Build Python backend
echo [INFO] Building Python backend...
cd /d "%BACKEND_DIR%"

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo [INFO] Activating Python virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo [INFO] Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

REM Build backend executable
echo [INFO] Building backend executable with PyInstaller...
pyinstaller backend_server.spec

if not exist "dist\backend_server-x86_64-pc-windows-msvc.exe" (
    echo [ERROR] Backend build failed - executable not found
    exit /b 1
)

echo [SUCCESS] Backend built successfully

REM Build frontend
echo [INFO] Building frontend...
cd /d "%FRONTEND_DIR%"

REM Install Node dependencies
echo [INFO] Installing Node.js dependencies...
npm ci

REM Copy backend executable to Tauri binaries
echo [INFO] Copying backend executable to Tauri...
if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
copy "..\backend\dist\backend_server-x86_64-pc-windows-msvc.exe" "src-tauri\binaries\backend_server-x86_64-pc-windows-msvc.exe"

REM Build Tauri application
echo [INFO] Building Tauri application...
npm run tauri build

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Frontend built successfully
) else (
    echo [ERROR] Frontend build failed
    exit /b 1
)

REM Generate checksums
echo [INFO] Generating checksums...
cd "src-tauri\target\release\bundle"

REM Find all installer files
for /r %%f in (*.msi *.exe) do (
    if "%%~nxf" neq "" (
        echo Found installer: %%~nxf
        certutil -hashfile "%%f" SHA256 | findstr /v "hash" | findstr /v "CertUtil" >> checksums-windows.txt
        echo   %%~nxf >> checksums-windows.txt
        echo. >> checksums-windows.txt
    )
)

if exist "checksums-windows.txt" (
    echo [SUCCESS] Checksums generated in checksums-windows.txt
    type checksums-windows.txt
) else (
    echo [WARNING] No installer files found
)

REM Summary
echo [INFO] Build Summary
echo [INFO] =============
echo [INFO] Platform: Windows
echo [INFO] %PYTHON_VER%
echo [INFO] Node.js: %NODE_VER%
echo [INFO] Rust: %RUST_VER%
echo [INFO] Build directory: %BUILD_DIR%
echo [INFO] Installers location: %FRONTEND_DIR%\src-tauri\target\release\bundle

if exist "checksums-windows.txt" (
    echo [SUCCESS] Build completed successfully!
    echo [INFO] Checksums:
    type checksums-windows.txt
) else (
    echo [WARNING] Build completed but no installers found
)

echo.
echo [INFO] To verify this build matches the official release:
echo [INFO] 1. Compare the checksums with those in the GitHub release
echo [INFO] 2. Verify the commit hash matches the release tag
echo [INFO] 3. Check that dependencies match requirements.txt and package.json
echo.
echo [SUCCESS] Reproducible build complete!

pause
