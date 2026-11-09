# -*- mode: python ; coding: utf-8 -*-
# LocalLens Vision Core test app (S9, gate G6): python -m PyInstaller vision_bench.spec
# One folder, no models inside: testers put the int8 `models` folder next to the app (see vision_core/bench.py).
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

a = Analysis(
    ['vision_bench.py'],
    pathex=[],
    binaries=collect_dynamic_libs('onnxruntime') + collect_dynamic_libs('pillow_heif'),
    datas=collect_data_files('onnxruntime'),
    hiddenimports=collect_submodules('vision_core') + ['pillow_heif', 'tokenizers', 'multiprocessing.pool'],
    # not used by the test app: keeps it small and free of the face/model-building stacks
    excludes=['torch', 'torchvision', 'dlib', 'face_recognition', 'face_recognition_models', 'coremltools', 'scipy',
              'sklearn', 'transformers', 'open_clip', 'matplotlib', 'tkinter', 'pandas', 'IPython', 'cv2', 'rawpy', 'wand'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='LocalLensBench', console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='LocalLensBench')
