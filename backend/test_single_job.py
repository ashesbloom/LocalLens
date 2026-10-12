"""
One job at a time, enforced by the backend for every job type.

Sort and Find & Group had no guard: a second start ran beside the first, cleared the
first one's abort flag (each task starts with cancellation_events[...].clear()), and
both jobs shared the clone counter and the log handler.
"""
import asyncio
import tempfile

from fastapi import BackgroundTasks

import main


def demo():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        starts = {
            "sort": lambda bg: main.start_sorting_endpoint(main.SortRequest(
                source_folder=src, destination_folder=dst, operation_mode="copy",
                sorting_options=main.SortOptions(primary_sort="Date")), bg),
            "find": lambda bg: main.start_find_group_endpoint(main.FindGroupRequest(
                source_folder=src, destination_folder=dst,
                find_config=main.FindGroupConfig(folderName="Found")), bg),
        }
        saved = dict(main.current_job_state)
        try:
            main.current_job_state.update({"is_active": True, "job_type": "sorting", "progress": 40})
            for name, start in starts.items():
                bg = BackgroundTasks()
                r = asyncio.run(start(bg))
                assert r.get("error") == "job_already_running", f"{name}: second job accepted: {r}"
                assert not bg.tasks, f"{name}: a refused start must not queue the job"
        finally:
            main.current_job_state.clear()
            main.current_job_state.update(saved)
    print("ok - test_single_job.py")


if __name__ == "__main__":
    demo()
