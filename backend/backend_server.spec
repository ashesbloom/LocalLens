# -*- mode: python ; coding: utf-8 -*-


block_cipher = None


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        # This entry is correct, leave it.
        ('venv\\Lib\\site-packages\\face_recognition_models\\models', 'face_recognition_models/models'),
        
        # REMOVE the old reverse_geocoder lines and REPLACE with this one:
        ('venv\\Lib\\site-packages\\reverse_geocoder\\rg_cities1000.csv', 'reverse_geocoder')
    ],
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
    name='backend_server-x86_64-pc-windows-msvc.exe',
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
