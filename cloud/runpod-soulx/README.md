# SoulX RunPod Worker

最小部署：一个 RunPod Serverless 端点，同时完成歌曲人声分离、SoulX 零样本音色转换和伴奏混音。

1. 从本目录构建并推送镜像：`docker build -t <你的镜像>:soulx .`。
2. RunPod 新建 Serverless Endpoint，GPU 选择 48GB（A40/A6000），初始 `Max Workers = 1`、`Execution Timeout = 900`。
3. 挂载至少 20GB Network Volume 到 `/runpod-volume`。首次冷启动会从 Hugging Face 下载官方模型，后续复用缓存。
4. Web 服务设置 `MODEL_BACKEND=runpod`、`RUNPOD_ENDPOINT_ID`、`RUNPOD_API_KEY` 后重启。

请求和响应使用 base64 WAV；MVP 固定处理前 30 秒，避免额外引入对象存储。生产扩成长音频时应改用私有对象存储 URL。
