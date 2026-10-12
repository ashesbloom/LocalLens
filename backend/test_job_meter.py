"""JobMeter: the live numbers behind the progress panel."""
from organizer_logic import JobMeter


class FakeClock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t


def test_rate_waits_for_a_second_of_data():
    clock = FakeClock()
    m = JobMeter("files", 100, clock=clock)
    m.snapshot()
    m.tick(5, 5 * 1024 * 1024)
    clock.t += 0.5
    s = m.snapshot()
    assert s["done"] == 5 and s["rate"] is None and s["mb_per_s"] is None


def test_rate_and_mb_over_the_window():
    clock = FakeClock()
    m = JobMeter("files", 100, clock=clock)
    m.snapshot()
    for _ in range(4):
        clock.t += 1
        m.tick(2, 2 * 1024 * 1024)
        s = m.snapshot()
    assert s["rate"] == 2.0
    assert s["mb_per_s"] == 2.0
    assert s == {**s, "phase": "files", "done": 8, "total": 100, "matches": None}


def test_old_samples_drop_out_so_a_slowdown_shows():
    clock = FakeClock()
    m = JobMeter("files", 1000, clock=clock)
    m.snapshot()
    for _ in range(10):  # fast: 10 photos/s
        clock.t += 1
        m.tick(10)
        m.snapshot()
    for _ in range(10):  # slow: 1 photo/s, long enough to fill the whole window
        clock.t += 1
        m.tick(1)
        s = m.snapshot()
    assert s["rate"] == 1.0


def test_work_before_the_first_snapshot_is_not_speed():
    clock = FakeClock()
    m = JobMeter("faces", 100, clock=clock)
    m.tick(60)  # face-cache hits, instant
    m.snapshot()
    clock.t += 2
    m.tick(2)
    s = m.snapshot()
    assert s["done"] == 62 and s["rate"] == 1.0


def test_eta_after_three_seconds():
    clock = FakeClock()
    m = JobMeter("hashing", 100, clock=clock)
    m.snapshot()
    clock.t += 2
    m.tick(20)
    assert m.snapshot()["eta_s"] is None
    clock.t += 2
    m.tick(20)
    s = m.snapshot()
    assert s["rate"] == 10.0 and s["eta_s"] == 6.0  # 60 left at 10/s


def test_matches_ride_along():
    m = JobMeter("search", 10, clock=FakeClock())
    m.matches = 3
    assert m.snapshot()["matches"] == 3


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok - test_job_meter.py")
