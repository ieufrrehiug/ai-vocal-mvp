"""Minimal local bridge for Seed-VC singing voice conversion."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--cfg", type=float, default=0.7)
    parser.add_argument("--separate", action="store_true")
    parser.add_argument("--accompaniment-output")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    session = output.parent / "seedvc-session"
    source_vocal = source

    if args.separate:
      stems = session / "stems"
      subprocess.run([
          sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs",
          "-o", str(stems), str(source),
      ], cwd=root, check=True)
      matches = list(stems.glob("**/vocals.wav"))
      accompaniment = list(stems.glob("**/no_vocals.wav"))
      if not matches or not accompaniment:
          raise RuntimeError("Demucs did not produce vocal/accompaniment stems")
      source_vocal = matches[0]
      if not args.accompaniment_output:
          raise ValueError("--accompaniment-output is required with --separate")
      shutil.copyfile(accompaniment[0], Path(args.accompaniment_output).resolve())

    generated = session / "generated"
    generated.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        sys.executable, str(root / "inference.py"),
        "--source", str(source_vocal),
        "--target", str(Path(args.reference).resolve()),
        "--output", str(generated),
        "--diffusion-steps", str(args.steps),
        "--length-adjust", "1.0",
        "--inference-cfg-rate", str(args.cfg),
        "--f0-condition", "True",
        "--auto-f0-adjust", "False",
        "--semi-tone-shift", "0",
        "--fp16", "True",
    ], cwd=root, check=True)
    results = list(generated.glob("vc_*.wav"))
    if not results:
        raise RuntimeError("Seed-VC did not produce a vocal file")
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(max(results, key=lambda path: path.stat().st_mtime), output)


if __name__ == "__main__":
    main()
