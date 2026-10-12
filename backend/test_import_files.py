"""
Self-check for /api/import-files: the "Import unsorted" action after a folder
comparison. Copies (or moves) exactly the listed photos into
<destination>/<source folder name>/, never overwrites, never touches others.

Plain asserts. Run:  python test_import_files.py
"""
import asyncio
import os
import tempfile

from fastapi import HTTPException

import main


def run(**kw):
    return asyncio.run(main.import_files_endpoint(main.ImportFilesRequest(**kw)))


def demo():
    main.current_job_state["is_active"] = False
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "test"), os.path.join(d, "Found Photos")
        os.makedirs(src); os.makedirs(dst)
        for n in ("a.jpg", "b.jpg", "skip.jpg"):
            open(os.path.join(src, n), "w").write(n)
        # The endpoint only imports what the last comparison found new.
        main.current_job_state.update({
            "job_type": "duplicates", "source_folder": src, "library_folder": dst,
            "new_files": [os.path.join(src, n) for n in ("a.jpg", "b.jpg")],
        })
        r = run(source_folder=src, destination_folder=dst, operation_mode="copy",
                files=[os.path.join(src, "skip.jpg")])
        assert r["imported"] == 0 and len(r["failed"]) == 1, "a file the comparison didn't list is refused"
        try:
            run(source_folder=src, destination_folder=d, operation_mode="copy", files=[os.path.join(src, "a.jpg")])
            raise AssertionError("import into a folder other than the compared one accepted")
        except HTTPException as e:
            assert e.status_code in (400, 403), e
        os.makedirs(os.path.join(dst, "test"))
        open(os.path.join(dst, "test", "a.jpg"), "w").write("already here")

        r = run(source_folder=src, destination_folder=dst, operation_mode="copy",
                files=[os.path.join(src, "a.jpg"), os.path.join(src, "b.jpg")])
        assert r["imported"] == 2 and r["failed"] == [], r
        assert r["folder"] == os.path.join(dst, "test")
        assert sorted(os.listdir(os.path.join(dst, "test"))) == ["a (1).jpg", "a.jpg", "b.jpg"]
        assert open(os.path.join(dst, "test", "a.jpg")).read() == "already here", "never overwrite"
        assert sorted(os.listdir(src)) == ["a.jpg", "b.jpg", "skip.jpg"], "copy leaves the source alone"

        r = run(source_folder=src, destination_folder=dst, operation_mode="move",
                files=[os.path.join(src, "b.jpg")])
        assert r["imported"] == 1
        assert sorted(os.listdir(src)) == ["a.jpg", "skip.jpg"], "move takes only the listed file"

        # A file outside the source, or a missing one, is reported, not imported.
        outside = os.path.join(d, "elsewhere.jpg"); open(outside, "w").write("x")
        r = run(source_folder=src, destination_folder=dst, operation_mode="copy",
                files=[outside, os.path.join(src, "gone.jpg")])
        assert r["imported"] == 0 and len(r["failed"]) == 2, r
        assert os.path.exists(outside)

        for bad in (os.path.join(d, "nope"), d):  # missing; or the source's own parent
            try:
                run(source_folder=src, destination_folder=bad, operation_mode="copy", files=[os.path.join(src, "a.jpg")])
                raise AssertionError(f"bad destination accepted: {bad}")
            except HTTPException as e:
                assert e.status_code in (400, 403)
    print("test_import_files: all assertions passed")


if __name__ == "__main__":
    demo()
