"""Generate a clean cloned speaker reference with the installed VoxCPM2 package."""

from __future__ import annotations

import argparse
from pathlib import Path

import soundfile as sf
from voxcpm import VoxCPM


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--text",
        default="\u4eca\u5929\u6211\u4f1a\u7528\u81ea\u5df1\u6700\u81ea\u7136\u7684\u58f0\u97f3\u5531\u8fd9\u9996\u6b4c\uff0c\u4fdd\u7559\u6bcf\u4e00\u6b21\u547c\u5438\u3001\u5171\u9e23\u548c\u771f\u5b9e\u7684\u97f3\u8272\u3002",
    )
    args = parser.parse_args()

    # ponytail: one model load per queued job; use a persistent worker when latency matters.
    model = VoxCPM.from_pretrained(
        str(Path(args.model).resolve()),
        load_denoiser=False,
        optimize=False,
        device=args.device,
    )
    wav = model.generate(
        text=args.text,
        reference_wav_path=str(Path(args.reference).resolve()),
        cfg_value=2.0,
        inference_timesteps=10,
        seed=42,
    )
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, wav, model.tts_model.sample_rate)


if __name__ == "__main__":
    main()