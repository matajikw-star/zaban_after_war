"""Hold Windows awake while a long job runs somewhere else.

extraction/scripts/s1_route.py holds this for itself. This standalone exists for
the cases that cannot: a run already in flight, or any other multi-hour pass.

The display is left alone on purpose - it still turns off on its own timeout, so
a static image never sits on the panel. Only the machine's slide into Modern
Standby is blocked, which on an S0-low-power-idle laptop is what stops a
background job when the screen goes dark.

    python tools/keepawake.py --hours 3

Ctrl-C releases it, and so does the process exiting for any other reason.
"""
from __future__ import annotations
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extraction" / "scripts"))
from common import keep_awake  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=3.0, help="release after this long")
    a = ap.parse_args()

    if sys.platform != "win32":
        print("Nothing to do - this is a Windows power request.")
        return 0

    seconds = a.hours * 3600
    with keep_awake(f"{a.hours:g}h") as held:
        if not held:
            return 1
        end = time.time() + seconds
        try:
            while time.time() < end:
                time.sleep(60)
                left = (end - time.time()) / 60
                print(f"  keep-awake: {left:.0f} min left", flush=True)
        except KeyboardInterrupt:
            print("\nkeep-awake: released early")
    print("keep-awake: released", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
