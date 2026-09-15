# 声刻 · AI 修歌 Agent（本地 MVP）

一个本地运行的 AI 翻唱与歌声音色转换 Web 应用。它把用户自己的声音样本、已获授权的歌曲素材与本机 GPU 模型串成一条可点击的处理流程。

> 本仓库只提供编排和 Web 代码，不包含模型权重、商业歌曲、伴奏、声音样本或生成结果。

## 能做什么

- 拖入或点击选择歌曲与声音样本；
- 通过浏览器麦克风录音；
- 使用 VoxCPM2 生成更清晰的音色参考，并用 Seed-VC 进行歌声音色转换；
- 可选接入 SoulX-Singer-SVC 或 RunPod GPU；
- 自动混音，试听并下载纯人声和带伴奏 WAV；
- 默认在 24 小时后清理本地任务文件。

当前实现是实验性 MVP，不应理解为“原唱级”质量保证。参考朗读文字用于改善 VoxCPM 的音色提示，不会直接约束 Seed-VC 的目标歌词，因此不能保证修复所有咬字问题。

## 本地启动

要求 Node.js 20+、支持 CUDA 的 PyTorch 环境，以及分别从官方来源安装的 VoxCPM2 与 Seed-VC。第三方项目及模型需遵守各自许可证和使用条款。

```powershell
npm install
npm run assets
npm start
```

打开 `http://127.0.0.1:3000`。`npm start` 默认启动本地 `VoxCPM2 + Seed-VC` GPU 后端，音频不上传云端；仅测试页面流程可运行 `npm run start:demo`。

复制 `.env.example` 为 `.env` 后填写本机路径。若配置 `FFMPEG_PATH` 和 `FFPROBE_PATH`，页面还可接收 MP3、M4A、AAC、FLAC、OGG 和 WebM；否则只处理 WAV。

## 可选后端

### SoulX-Singer-SVC

先按 [SoulX-Singer 官方说明](https://github.com/Soul-AILab/SoulX-Singer)在独立 GPU 环境安装代码、模型及依赖，再设置 `MODEL_BACKEND=soulx`、`SOULX_ROOT`、`SOULX_PYTHON` 等变量。Node 工作器通过 `scripts/soulx_bridge.py` 调用上游公开接口，不修改或打包其源码与权重。

### RunPod

`cloud/runpod-soulx/` 提供可选的 Serverless 桥接示例。镜像构建所需的上游代码、权重和 Python 包必须由部署者从合法来源自行提供；API 密钥只应保存在服务端环境变量中。

## 添加歌曲

将你有权使用的素材放入 `data/songs/<song-id>/`，并在 `data/catalog.json` 中添加记录。建议准备严格对齐的 `guide-vocal.wav` 与 `accompaniment.wav`。音频文件已被全局忽略，不会被 Git 提交。

不要上传或发布未经授权的商业录音、伴奏、分离音轨、他人声音或可识别个人信息。

## 测试

```powershell
npm test
```

测试会在临时目录生成合成音频，覆盖曲库、授权确认、任务队列、音频处理与下载流程。

## 使用边界

- 只克隆你自己的声音，或已取得声音权利人明确授权的声音；
- 只处理你拥有版权、许可或其他合法使用依据的音乐；
- 不用于冒充、欺骗、骚扰或制造误导性内容；
- 对外发布生成内容时，应清楚标注为 AI 辅助制作；
- 正式上线仍需补充账户、限流、内容审核、投诉下架、隐私政策和数据删除机制。

这些说明是项目风险提示，不构成法律意见。不同地区、素材和用途的法律要求可能不同。

## 许可证

本仓库自有代码以 [GNU GPL v3.0 only](LICENSE) 发布。第三方代码和模型不随本仓库分发，并继续适用其各自的许可证与条款；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目名称和界面不代表任何上游项目对本项目的认可或背书。
