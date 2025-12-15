# -*- mode: python ; coding: utf-8 -*-

import sys
import site
from pathlib import Path
import face_recognition_models
import reverse_geocoder

block_cipher = None


model_dir = Path(face_recognition_models.__file__).parent / 'models'
rg_path = Path(reverse_geocoder.__file__).parent / 'rg_cities1000.csv'

datas = [
    (str(model_dir), 'face_recognition_models/models'),
    (str(rg_path), 'reverse_geocoder'),
]

# Use a platform-neutral base name; PyInstaller adds .exe on Windows automatically.
exe_name = 'backend_server'


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=exe_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    manifest='long_path_manifest.xml',
)
