FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 SOULX_ROOT=/opt/SoulX-Singer
RUN apt-get -o Acquire::Retries=5 update && apt-get -o Acquire::Retries=5 install -y --fix-missing --no-install-recommends \
    git ffmpeg libsndfile1 python3.10 python3-pip python3.10-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=off PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple PIP_DEFAULT_TIMEOUT=120

COPY soulx.tar.gz /tmp/soulx.tar.gz
COPY torch-2.2.0+cu121-cp310-cp310-linux_x86_64.whl torchaudio-2.2.0+cu121-cp310-cp310-linux_x86_64.whl /tmp/wheels/
RUN --mount=type=cache,target=/root/.cache/pip mkdir -p /opt/SoulX-Singer \
    && tar -xzf /tmp/soulx.tar.gz -C /opt/SoulX-Singer --strip-components=1 \
    && rm /tmp/soulx.tar.gz \
    && cd /opt/SoulX-Singer \
    && sed -i '/sageattention/d; /torchcodec/d; /^torch==/d; /^torchaudio==/d; s/setuptools==81.0.0/setuptools<81/' requirements.txt \
    && python3.10 -m pip install --upgrade pip \
    && python3.10 -m pip install --no-deps /tmp/wheels/torch-2.2.0+cu121-cp310-cp310-linux_x86_64.whl /tmp/wheels/torchaudio-2.2.0+cu121-cp310-cp310-linux_x86_64.whl nvidia-cuda-cupti-cu12==12.1.105 \
    && sed -i '/^Requires-Dist: nvidia-/d; /^Requires-Dist: triton/d' /usr/local/lib/python3.10/dist-packages/torch-2.2.0+cu121.dist-info/METADATA \
    && python3.10 -m pip install -r requirements.txt runpod==1.7.13 \
    && rm -rf /tmp/wheels

RUN --mount=type=cache,target=/root/.cache/pip python3.10 -m pip install --no-deps nvidia-nccl-cu12==2.19.3
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.10/dist-packages/nvidia/nccl/lib:/usr/local/lib/python3.10/dist-packages/nvidia/cuda_cupti/lib:${LD_LIBRARY_PATH}

COPY handler.py /opt/SoulX-Singer/runpod_handler.py
WORKDIR /opt/SoulX-Singer
CMD ["python3.10", "-u", "runpod_handler.py"]
