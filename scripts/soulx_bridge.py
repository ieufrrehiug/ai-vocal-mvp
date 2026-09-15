"""Thin production bridge around SoulX-Singer-SVC.

This file intentionally lives outside the SoulX checkout. It uses SoulX's public
Python modules and writes a single generated vocal file for the Node job worker.
"""

from __future__ import annotations

import argparse
import gc
import random
import shutil
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--n-steps", type=int, default=32)
    parser.add_argument("--cfg", type=float, default=1.0)
    parser.add_argument("--pitch-shift", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fp16", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    sys.path.insert(0, str(root))

    import numpy as np
    import torch
    from cli.inference_svc import build_model, process
    from preprocess.pipeline import PreprocessPipeline
    from soulxsinger.utils.file_utils import load_config

    if not torch.cuda.is_available() and args.device.startswith("cuda"):
        raise RuntimeError("SoulX 配置为 CUDA，但 PyTorch 未检测到可用 GPU")

    session = Path(args.output).resolve().parent / "soulx-session"
    prompt_dir = session / "prompt"
    target_dir = session / "target"
    generated_dir = session / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)

    pipeline = PreprocessPipeline(
        device=args.device,
        language="Mandarin",
        save_dir=str(prompt_dir),
        vocal_sep=False,
        max_merge_duration=60_000,
        midi_transcribe=False,
    )

    def preprocess(audio_path: str, save_dir: Path) -> tuple[Path, Path]:
        pipeline.save_dir = str(save_dir)
        pipeline.run(
            audio_path=audio_path,
            vocal_sep=False,
            max_merge_duration=60_000,
            language="Mandarin",
        )
        vocal = save_dir / "vocal.wav"
        f0 = save_dir / "vocal_f0.npy"
        if not vocal.exists() or not f0.exists():
            raise RuntimeError(f"SoulX 预处理缺少输出：{vocal} / {f0}")
        return vocal, f0

    prompt_wav, prompt_f0 = preprocess(args.prompt, prompt_dir)
    target_wav, target_f0 = preprocess(args.target, target_dir)

    model_config = load_config(str(root / "soulxsinger" / "config" / "soulxsinger.yaml"))
    model = build_model(
        model_path=str(root / "pretrained_models" / "SoulX-Singer" / "model-svc.pt"),
        config=model_config,
        device=args.device,
        use_fp16=args.fp16,
    )

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    random.seed(args.seed)

    inference_args = argparse.Namespace(
        device=args.device,
        prompt_wav_path=str(prompt_wav),
        target_wav_path=str(target_wav),
        prompt_f0_path=str(prompt_f0),
        target_f0_path=str(target_f0),
        save_dir=str(generated_dir),
        auto_shift=True,
        pitch_shift=args.pitch_shift,
        n_steps=args.n_steps,
        cfg=args.cfg,
        use_fp16=args.fp16,
    )
    process(inference_args, model_config, model)

    generated = generated_dir / "generated.wav"
    if not generated.exists():
        raise RuntimeError(f"SoulX 推理完成但未找到输出：{generated}")
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(generated, output)

    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
