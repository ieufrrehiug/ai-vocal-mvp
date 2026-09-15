const state = {
  config: null,
  songs: [],
  selectedSongId: null,
  customSong: null,
  songFile: null,
  file: null,
  polling: null,
  mediaRecorder: null,
  micStream: null,
  micChunks: [],
  micTimer: null,
  micStartedAt: 0,
};

const elements = {
  engineChip: document.querySelector("#engineChip"),
  engineLabel: document.querySelector("#engineLabel"),
  songGrid: document.querySelector("#songGrid"),
  songDropzone: document.querySelector("#songDropzone"),
  songInput: document.querySelector("#songInput"),
  songUploadTitle: document.querySelector("#songUploadTitle"),
  songUploadHint: document.querySelector("#songUploadHint"),
  songFilePreview: document.querySelector("#songFilePreview"),
  songFileName: document.querySelector("#songFileName"),
  songFileSize: document.querySelector("#songFileSize"),
  removeSongFile: document.querySelector("#removeSongFile"),
  lyricsInput: document.querySelector("#lyricsInput"),
  dropzone: document.querySelector("#dropzone"),
  voiceInput: document.querySelector("#voiceInput"),
  uploadTitle: document.querySelector("#uploadTitle"),
  uploadHint: document.querySelector("#uploadHint"),
  filePreview: document.querySelector("#filePreview"),
  fileName: document.querySelector("#fileName"),
  fileSize: document.querySelector("#fileSize"),
  removeFile: document.querySelector("#removeFile"),
  micButton: document.querySelector("#micButton"),
  micButtonText: document.querySelector("#micButtonText"),
  micStatus: document.querySelector("#micStatus"),
  consentInput: document.querySelector("#consentInput"),
  generateButton: document.querySelector("#generateButton"),
  retentionText: document.querySelector("#retentionText"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressMessage: document.querySelector("#progressMessage"),
  progressBar: document.querySelector("#progressBar"),
  progressValue: document.querySelector("#progressValue"),
  resultPanel: document.querySelector("#resultPanel"),
  demoWarning: document.querySelector("#demoWarning"),
  mixPlayer: document.querySelector("#mixPlayer"),
  vocalPlayer: document.querySelector("#vocalPlayer"),
  mixDownload: document.querySelector("#mixDownload"),
  vocalDownload: document.querySelector("#vocalDownload"),
  restartButton: document.querySelector("#restartButton"),
  toast: document.querySelector("#toast"),
};

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 3400);
}

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderSongs() {
  const songs = state.customSong ? [...state.songs, state.customSong] : state.songs;
  const cards = songs.map((song) => `
    <button class="song-card ${song.id === state.selectedSongId ? "selected" : ""}" data-song-id="${escapeHtml(song.id)}" aria-pressed="${song.id === state.selectedSongId}" style="--card-accent:${song.accent || "#ff5d47"}">
      <span class="song-check">✓</span>
      <small>${song.local ? "LOCAL MATERIAL" : song.demo ? "DEMO LICENSE" : "AUTHORIZED CATALOG"}</small>
      <h3>${escapeHtml(song.title)}</h3>
      <p>${escapeHtml(song.artist)}</p>
      <footer><span>${escapeHtml(song.durationLabel)}</span><span>${escapeHtml(song.range)}</span><span>${escapeHtml(song.language)}</span></footer>
    </button>
  `).join("");
  elements.songGrid.innerHTML = cards;
  elements.songGrid.querySelectorAll("[data-song-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSongId = button.dataset.songId;
      renderSongs();
      updateSubmitState();
      const song = songs.find((item) => item.id === state.selectedSongId);
      toast(`已选择《${song?.title || "歌曲"}》`);
    });
  });
}

function setSongFile(file) {
  if (!file) return clearSongFile();
  const maxBytes = (state.config?.upload.maxMegabytes || 50) * 1024 * 1024;
  if (!file.name.toLowerCase().endsWith(".wav")) return toast("当前环境上传歌曲仅支持 WAV");
  if (file.size > maxBytes) return toast(`歌曲文件不能超过 ${state.config?.upload.maxMegabytes || 50}MB`);
  const title = file.name.replace(/\.[^.]+$/, "");
  state.songFile = file;
  state.customSong = {
    id: "custom-local",
    title,
    artist: "本地授权素材",
    durationLabel: "本地",
    range: "已上传",
    language: "WAV",
    accent: "#7957ff",
    local: true,
    guideVocal: file,
    accompaniment: file,
  };
  state.selectedSongId = state.customSong.id;
  elements.songFileName.textContent = file.name;
  elements.songFileSize.textContent = formatBytes(file.size);
  elements.songFilePreview.hidden = false;
  elements.songUploadTitle.hidden = true;
  elements.songUploadHint.hidden = true;
  renderSongs();
  updateSubmitState();
  toast(`已选择歌曲《${title}》`);
}

function clearSongFile() {
  state.songFile = null;
  if (state.selectedSongId === "custom-local") state.selectedSongId = state.songs[0]?.id || null;
  state.customSong = null;
  elements.songInput.value = "";
  elements.songFilePreview.hidden = true;
  elements.songUploadTitle.hidden = false;
  elements.songUploadHint.hidden = false;
  renderSongs();
  updateSubmitState();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setFile(file) {
  if (!file) return clearFile();
  const maxBytes = (state.config?.upload.maxMegabytes || 50) * 1024 * 1024;
  if (file.size > maxBytes) return toast("音频文件不能超过 50MB");
  state.file = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = `${formatBytes(file.size)} · 等待生成时校验音频长度`;
  elements.filePreview.hidden = false;
  elements.uploadTitle.hidden = true;
  elements.uploadHint.hidden = true;
  updateSubmitState();
}

function clearFile() {
  state.file = null;
  elements.voiceInput.value = "";
  elements.filePreview.hidden = true;
  elements.uploadTitle.hidden = false;
  elements.uploadHint.hidden = false;
  updateSubmitState();
}

function audioBufferToWav(audioBuffer) {
  const samples = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) samples[index] += channelData[index] / audioBuffer.numberOfChannels;
  }
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([output], { type: "audio/wav" });
}

function stopMicRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
}

async function startMicRecording() {
  if (window.location.protocol === "file:" || !window.isSecureContext) {
    return toast("请通过 http://127.0.0.1:3000 打开页面后使用麦克风");
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("当前浏览器不支持麦克风录音");
  elements.micButton.disabled = true;
  elements.micButtonText.textContent = "等待麦克风权限";
  elements.micStatus.textContent = "请在浏览器的麦克风提示中点击“允许”";
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.micChunks = [];
    state.mediaRecorder = new MediaRecorder(state.micStream);
    state.mediaRecorder.addEventListener("dataavailable", (event) => { if (event.data.size) state.micChunks.push(event.data); });
    state.mediaRecorder.addEventListener("stop", async () => {
      clearInterval(state.micTimer);
      state.micStream?.getTracks().forEach((track) => track.stop());
      elements.micButton.classList.remove("recording");
      elements.micButtonText.textContent = "使用麦克风录音";
      elements.micStatus.textContent = "正在处理录音...";
      try {
        const recordedBlob = new Blob(state.micChunks, { type: state.mediaRecorder.mimeType });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(await recordedBlob.arrayBuffer());
        const wavBlob = audioBufferToWav(audioBuffer);
        await audioContext.close();
        const file = new File([wavBlob], `麦克风录音-${Date.now()}.wav`, { type: "audio/wav" });
        setFile(file);
        elements.micStatus.textContent = `录音完成 · ${Math.round(audioBuffer.duration)} 秒`;
      } catch (_error) {
        elements.micStatus.textContent = "录音处理失败，请重试";
        toast("录音处理失败，请重试");
      }
    }, { once: true });
    state.mediaRecorder.start();
    state.micStartedAt = Date.now();
    elements.micButton.disabled = false;
    elements.micButton.classList.add("recording");
    elements.micButtonText.textContent = "停止录音";
    const updateMicTime = () => {
      const seconds = Math.floor((Date.now() - state.micStartedAt) / 1000);
      elements.micStatus.textContent = `录音中 00:${String(seconds).padStart(2, "0")} · 点击停止`;
      if (seconds >= 30) stopMicRecording();
    };
    updateMicTime();
    state.micTimer = setInterval(updateMicTime, 250);
  } catch (_error) {
    elements.micButton.disabled = false;
    elements.micButtonText.textContent = "使用麦克风录音";
    elements.micStatus.textContent = "未获得麦克风权限";
    toast("请允许浏览器使用麦克风");
  }
}

function toggleMicRecording() {
  if (state.mediaRecorder?.state === "recording") stopMicRecording();
  else void startMicRecording();
}

function updateSubmitState() {
  elements.generateButton.disabled = !(state.selectedSongId && state.file && elements.consentInput.checked);
}

function showProgress(job) {
  elements.progressPanel.hidden = false;
  elements.resultPanel.hidden = true;
  elements.progressTitle.textContent = job.status === "queued" ? "正在等待 GPU..." : "正在生成你的副歌...";
  elements.progressMessage.textContent = job.message;
  elements.progressBar.style.width = `${job.progress}%`;
  elements.progressValue.textContent = `${job.progress}%`;
  elements.progressPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showResult(job) {
  clearInterval(state.polling);
  state.polling = null;
  elements.progressPanel.hidden = true;
  elements.resultPanel.hidden = false;
  elements.demoWarning.hidden = job.backend !== "demo";
  const cacheKey = `?v=${encodeURIComponent(job.updatedAt)}`;
  elements.mixPlayer.src = `${job.outputs.mix}${cacheKey}`;
  elements.vocalPlayer.src = `${job.outputs.vocal}${cacheKey}`;
  elements.mixDownload.href = `${job.outputs.mix}?download=1`;
  elements.vocalDownload.href = `${job.outputs.vocal}?download=1`;
  elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function pollJob(jobId) {
  try {
    const job = await jsonFetch(`/api/jobs/${jobId}`);
    showProgress(job);
    if (job.status === "completed") return showResult(job);
    if (job.status === "failed") {
      clearInterval(state.polling);
      state.polling = null;
      elements.progressPanel.hidden = true;
      elements.generateButton.disabled = false;
      toast(job.error || "生成失败，请更换声音样本后重试");
    }
  } catch (error) {
    clearInterval(state.polling);
    state.polling = null;
    toast(error.message);
  }
}

async function submitJob() {
  if (elements.generateButton.disabled) return;
  elements.generateButton.disabled = true;
  const form = new FormData();
  form.set("songId", state.selectedSongId);
  form.set("voice", state.file);
  form.set("consent", String(elements.consentInput.checked));
  form.set("lyrics", elements.lyricsInput.value.trim());
  if (state.selectedSongId === "custom-local" && state.customSong) {
    form.set("customTitle", state.customSong.title);
    form.set("guideVocal", state.customSong.guideVocal);
    form.set("accompaniment", state.customSong.accompaniment);
  }
  try {
    const job = await jsonFetch("/api/jobs", { method: "POST", body: form });
    showProgress(job);
    state.polling = setInterval(() => void pollJob(job.id), 1_000);
    await pollJob(job.id);
  } catch (error) {
    elements.generateButton.disabled = false;
    toast(error.message);
  }
}

function resetResult() {
  if (state.polling) clearInterval(state.polling);
  state.polling = null;
  elements.mixPlayer.pause();
  elements.vocalPlayer.pause();
  elements.resultPanel.hidden = true;
  elements.progressPanel.hidden = true;
  clearFile();
  elements.consentInput.checked = false;
  window.scrollTo({ top: document.querySelector(".upload-panel").offsetTop - 30, behavior: "smooth" });
}

function bindEvents() {
  elements.songInput.addEventListener("change", () => setSongFile(elements.songInput.files[0]));
  elements.removeSongFile.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); clearSongFile(); });
  elements.voiceInput.addEventListener("change", () => setFile(elements.voiceInput.files[0]));
  elements.removeFile.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); clearFile(); });
  elements.micButton.addEventListener("click", toggleMicRecording);
  elements.consentInput.addEventListener("change", updateSubmitState);
  elements.generateButton.addEventListener("click", submitJob);
  elements.restartButton.addEventListener("click", resetResult);
  for (const [zone, setter] of [[elements.songDropzone, setSongFile], [elements.dropzone, setFile]]) {
    for (const eventName of ["dragenter", "dragover"]) {
      zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add("dragging"); });
    }
    for (const eventName of ["dragleave", "drop"]) {
      zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove("dragging"); });
    }
    zone.addEventListener("drop", (event) => setter(event.dataTransfer.files[0]));
  }
}

async function init() {
  bindEvents();
  if (window.location.protocol === "file:") {
    elements.engineLabel.textContent = "需要启动本地服务";
    elements.engineChip.classList.add("demo");
    elements.engineChip.title = "请在项目目录运行 npm start，再访问 http://127.0.0.1:3000";
    elements.songGrid.innerHTML = `
      <div class="offline-note">
        <b>样式已加载，但应用服务尚未启动</b>
        <span>请在项目目录运行 <code>npm start</code>，然后打开 <code>http://127.0.0.1:3000</code>。</span>
      </div>`;
    elements.voiceInput.disabled = true;
    elements.songInput.disabled = true;
    toast("不能直接双击 HTML 使用，请通过本地服务地址打开");
    return;
  }
  try {
    const [config, songs] = await Promise.all([jsonFetch("/api/config"), jsonFetch("/api/songs")]);
    state.config = config;
    state.songs = songs;
    state.selectedSongId = songs[0]?.id || null;
    elements.engineLabel.textContent = config.engine.label;
    elements.engineChip.title = config.engine.note;
    elements.engineChip.classList.add(config.engine.id === "demo" ? "demo" : config.engine.ready ? "ready" : "");
    elements.retentionText.textContent = `${config.retentionHours} 小时`;
    const extensions = config.upload.extensions.map((item) => item.slice(1).toUpperCase());
    elements.voiceInput.accept = config.upload.extensions.join(",");
    elements.songInput.accept = config.upload.extensions.join(",");
    elements.uploadHint.textContent = `${extensions.join(" / ")} · 10–30 秒 · 最大 ${config.upload.maxMegabytes}MB`;
    elements.songUploadHint.textContent = `${extensions.join(" / ")} · 最大 ${config.upload.maxMegabytes}MB`;
    renderSongs();
    updateSubmitState();
  } catch (error) {
    elements.songGrid.innerHTML = `<p>加载失败：${escapeHtml(error.message)}</p>`;
    toast(error.message);
  }
}

void init();
