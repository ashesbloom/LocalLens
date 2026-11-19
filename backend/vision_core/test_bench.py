"""Plain-script tests: python -m vision_core.test_bench"""
import tempfile
from pathlib import Path

from vision_core import bench


def _models(at):
    for n in bench.MODELS:
        (at / n).mkdir(parents=True)
        (at / n / "model.json").write_text("{}")
    return at


def test_models_are_found_wherever_a_tester_unzips_them():
    """Testers unzip the app and the models zip side by side, or move one into the other, one level off."""
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        app = d / "LocalLensBench-Windows-X64" / "LocalLensBench"
        app.mkdir(parents=True)
        assert bench.find_models(app) is None
        unzipped = _models(d / "LocalLens-VisionCore-models-int8-2026-11-09" / "models")   # beside the app's folder
        assert bench.find_models(app) == unzipped
    for inside in ("models", "LocalLens-VisionCore-models-int8-2026-11-09/models"):        # moved into the app folder
        with tempfile.TemporaryDirectory() as d:
            app = Path(d) / "LocalLensBench"
            app.mkdir()
            want = _models(app / inside)
            assert bench.find_models(app) == want, inside
    with tempfile.TemporaryDirectory() as d:   # half a models folder is not a models folder
        app = Path(d) / "LocalLensBench"
        app.mkdir()
        (app / "models" / list(bench.MODELS)[0]).mkdir(parents=True)
        (app / "models" / list(bench.MODELS)[0] / "model.json").write_text("{}")
        assert bench.find_models(app) is None


def test_a_dragged_folder_path_is_read_on_mac_and_windows():
    assert bench.dropped_path("/Users/me/My\\ Photos ") == "/Users/me/My Photos"      # Mac Terminal escapes spaces
    assert bench.dropped_path("'/Users/me/My Photos'") == "/Users/me/My Photos"
    assert bench.dropped_path('"C:\\Users\\me\\My Photos"') == "C:\\Users\\me\\My Photos"   # Windows adds quotes
    assert bench.dropped_path("C:\\Users\\me\\Pictures") == "C:\\Users\\me\\Pictures"


def test_selfcheck_loads_the_native_parts_and_runs_a_model():
    """D111: CI starts each built app with --selfcheck (the Intel Mac build had never been run)."""
    from vision_core import MODELS_DIR
    m = MODELS_DIR / "yunet" / "face_detection_yunet_2023mar-dynamic.onnx"
    if not m.exists():
        print("  (no small model here: selfcheck not run)")
        return
    assert bench.main(["--selfcheck", str(m)]) == 0


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"{len(tests)}/{len(tests)} passed")
