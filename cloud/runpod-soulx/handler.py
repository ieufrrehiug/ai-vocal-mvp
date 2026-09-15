import base64
import gc
import os
import random
import tempfile
from pathlib import Path

import librosa
import numpy as np
import runpod
import soundfile as sf
import torch

from cli.inference_svc import build_model, process as svc_process
from preprocess.pipeline import PreprocessPipeline
from soulxsinger.utils.file_utils import load_config

ROOT = Path(os.environ.get("SOULX_ROOT", "/opt/SoulX-Singer"))
MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/runpod-volume/models"))
SAMPLE_RATE = 44100


def ensure_models():
    from huggingface_hub import snapshot_download

    singer = MODEL_DIR / "SoulX-Singer"
    preprocess = MODEL_DIR / "SoulX-Singer-Preprocess"
    if not (singer / "model-svc.pt").exists():
        snapshot_download("Soul-AILab/SoulX-Singer", local_dir=singer)
    if not preprocess.exists() or not any(preprocess.iterdir()):
        snapshot_download("Soul-AILab/SoulX-Singer-Preprocess", local_dir=preprocess)

    linked = ROOT / "pretrained_models"
    linked.mkdir(exist_ok=True)
    for name, source in (("SoulX-Singer", singer), ("SoulX-Singer-Preprocess", preprocess)):
        target = linked / name
        if not target.exists():
            target.symlink_to(source, target_is_directory=True)


os.chdir(ROOT)
ensure_models()
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
PIPELINE = PreprocessPipeline(
    device=DEVICE,
    language="Mandarin",
    save_dir="/tmp/soulx",
    vocal_sep=True,
    max_merge_duration=60000,
    midi_transcribe=False,
)
CONFIG = load_config("soulxsinger/config/soulxsinger.yaml")
MODEL = build_model(
    model_path="pretrained_models/SoulX-Singer/model-svc.pt",
    config=CONFIG,
    device=DEVICE,
    use_fp16=True,
)


def decode_wav(value, destination, max_seconds):
    if not isinstance(value, str) or not value:
        raise ValueError("缺少音频数据")
    raw = Path(destination).with_suffix(".upload")
    raw.write_bytes(base64.b64decode(value, validate=True))
    audio, _ = librosa.load(raw, sr=SAMPLE_RATE, mono=True)
    audio = audio[: int(max_seconds) * SAMPLE_RATE]
    if audio.size < SAMPLE_RATE:
        raise ValueError("音频至少需要 1 秒")
    sf.write(destination, audio, SAMPLE_RATE)


def preprocess(audio_path, output_dir, separate):
    PIPELINE.save_dir = str(output_dir)
    PIPELINE.run(
        audio_path=str(audio_path),
        vocal_sep=separate,
        max_merge_duration=60000,
        language="Mandarin",
    )
    vocal = output_dir / "vocal.wav"
    f0 = output_dir / "vocal_f0.npy"
    if not vocal.exists() or not f0.exists():
        raise RuntimeError("SoulX 预处理没有生成人声或 F0")
    return vocal, f0


def encode(path):
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def handler(event):
    data = event.get("input") or {}
    max_seconds = min(max(int(data.get("max_seconds", 30)), 1), 30)
    n_steps = min(max(int(data.get("n_steps", 32)), 1), 64)
    cfg = min(max(float(data.get("cfg", 3)), 1), 3)
    target_vocal_only = bool(data.get("target_vocal_only", False))

    with tempfile.TemporaryDirectory(prefix="soulx-") as tmp:
        root = Path(tmp)
        prompt_raw = root / "prompt.wav"
        song_raw = root / "song.wav"
        decode_wav(data.get("prompt_wav_b64"), prompt_raw, 30)
        decode_wav(data.get("song_wav_b64"), song_raw, max_seconds)

        prompt_vocal, prompt_f0 = preprocess(prompt_raw, root / "prompt", False)
        target_vocal, target_f0 = preprocess(song_raw, root / "target", not target_vocal_only)

        class Args:
            pass

        args = Args()
        args.device = DEVICE
        args.prompt_wav_path = str(prompt_vocal)
        args.target_wav_path = str(target_vocal)
        args.prompt_f0_path = str(prompt_f0)
        args.target_f0_path = str(target_f0)
        args.save_dir = str(root / "generated")
        args.auto_shift = True
        args.pitch_shift = 0
        args.n_steps = n_steps
        args.cfg = cfg
        args.use_fp16 = True
        random.seed(42)
        np.random.seed(42)
        torch.manual_seed(42)
        svc_process(args, CONFIG, MODEL)

        vocal_path = root / "generated" / "generated.wav"
        if not vocal_path.exists():
            raise RuntimeError("SoulX 没有生成人声")

        result = {"vocal_wav_b64": encode(vocal_path)}
        if not target_vocal_only:
            acc_path = root / "target" / "acc.wav"
            if not acc_path.exists():
                raise RuntimeError("SoulX 没有分离出伴奏")
            vocal, sr = librosa.load(vocal_path, sr=CONFIG.audio.sample_rate, mono=True)
            acc, _ = librosa.load(acc_path, sr=sr, mono=True)
            if args.pitch_shift:
                shift = ((args.pitch_shift + 6) % 12) - 6
                acc = librosa.effects.pitch_shift(acc, sr=sr, n_steps=shift)
            length = min(len(vocal), len(acc))
            mixed = vocal[:length] + acc[:length]
            peak = float(np.max(np.abs(mixed))) if mixed.size else 1.0
            if peak > 1:
                mixed /= peak
            mix_path = root / "generated" / "mix.wav"
            sf.write(mix_path, mixed, sr)
            result["mix_wav_b64"] = encode(mix_path)
        gc.collect()
        torch.cuda.empty_cache()
        return result


runpod.serverless.start({"handler": handler})
