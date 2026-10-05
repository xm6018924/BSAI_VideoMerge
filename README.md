# BSAI_VideoMerge

BSAI 视频合并节点 —— 将多个不同分辨率、不同帧率的视频片段按顺序拼接为一个视频，自动处理尺寸差异和音频对齐。

BSAI Video Merge node — concatenates multiple video clips of different resolutions and frame rates into one video, with automatic letterbox resizing and audio alignment.

---

## 功能特性 / Features

| 功能 | Feature |
|------|---------|
| 动态输入端（2~100 个视频） | Dynamic inputs (2~100 videos) |
| 自动 letterbox 黑边填充，统一所有片段分辨率 | Automatic letterbox padding to unify resolution across clips |
| 保留每个片段的原始音频 | Preserves original audio from each clip |
| 无音频片段自动补静音轨，格式对齐参考片段 | Auto-generates silent audio track for clips without audio, matching reference format |
| 不同采样率音频自动重采样对齐 | Auto-resamples audio to a common sample rate |
| 输出前实时预览 | Built-in preview before saving |

---

## 安装 / Installation

### 方式一：Git Clone（推荐）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/xm6018924/BSAI_VideoMerge.git
```

### 方式二：下载 ZIP

1. 访问 https://github.com/xm6018924/BSAI_VideoMerge
2. 点击 **Code → Download ZIP**
3. 解压到 `ComfyUI/custom_nodes/BSAI_VideoMerge/`

重启 ComfyUI 即可使用。

Restart ComfyUI after installation.

---

## 节点位置 / Node Location

在 ComfyUI 节点搜索中输入以下任一关键词：

Search for any of these keywords in ComfyUI:

- `BSAI 视频合并`
- `BSAI_VideoMerge`
- `BSAI merge video`
- `视频拼接`

节点分类：**BSAI → 视频**

Category: **BSAI → Video**

---

## 搭配节点 / Compatible Nodes

### 必须搭配 / Must Pair With

| 节点 | 作用 |
|------|------|
| **SaveVideo** | 将合并后的视频保存为文件。连接 `BSAI_VideoMerge.video` → `SaveVideo.video` |

### 推荐搭配 / Recommended Pairing

| 节点 | 用途 |
|------|------|
| **BSAI_VideoLoaderPlus** | 加载本地视频文件，支持区间截取、单帧选取。输出 `video` 端口直接连到 BSAI_VideoMerge |
| **CreateVideo** | 将图像序列 + 音频合成为视频片段（适合 H3/LTX 等文生视频模型输出后拼接） |
| **Video Combine** | ComfyUI 原生视频加载器，输出 video 可直接连接 |

### 典型工作流 / Typical Workflow

```
BSAI_VideoLoaderPlus (video 0) ──┐
BSAI_VideoLoaderPlus (video 1) ──┼──→ BSAI_VideoMerge ──→ SaveVideo
CreateVideo (生成片段)      ──┘
```

```
H3 模型输出 video ──┐
LTX 模型输出 video ──┼──→ BSAI_VideoMerge ──→ SaveVideo
上传视频 video ─────┘
```

---

## 输入参数 / Inputs

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| video0 ~ video99 | VIDEO | — | 要合并的视频片段，按连接顺序拼接。连接 video2 后自动出现 video3 |
| codec | COMBO | auto | 输出编码器。auto 自动选择；兼容时保留原编码 |

---

## 输出 / Outputs

| 参数 | 类型 | 说明 |
|------|------|------|
| video | VIDEO | 合并后的完整视频 |
| total_frames | INT | 合并后总帧数 |

---

## 工作原理 / How It Works

1. 以第一个视频的分辨率为目标尺寸
2. 检测所有片段是否尺寸一致；不一致时自动 letterbox（等比缩放 + 黑边填充）到统一尺寸
3. 找到第一个有音频的片段作为音频格式参考（采样率、声道数）
4. 有音频的片段保留原始音频；无音频的片段自动生成等时长静音轨
5. 所有片段重编码为 H.264 MKV 后按顺序拼接，音频自动对齐采样率
6. 输出最终视频

---

## 常见问题 / FAQ

**Q: 合并后不同片段分辨率不同？**
A: 本节点自动 letterbox 统一尺寸，以第一个视频为准。竖屏视频会上下加黑边，横屏视频会左右加黑边。

**Q: 某个片段没有音频，合并后会怎样？**
A: 自动补一段与该片段时长相同的静音，格式对齐其他有音频的片段，不会报错。

**Q: 不同音频采样率（如 32000Hz vs 48000Hz）会冲突吗？**
A: 不会。节点自动重采样到统一采样率后再拼接。
