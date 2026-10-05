import os
import folder_paths
import weakref
from typing import Optional
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io, ui, Input, InputImpl, Types

WEB_DIRECTORY = "./web"

# ---------------------------------------------------------------------------
# Preview cache (reuse pattern from nodes_video.py)
# ---------------------------------------------------------------------------
_preview_results: "weakref.WeakKeyDictionary[Input.Video, tuple[str, ui.SavedResult]]" = weakref.WeakKeyDictionary()


def _preview_input_video(file: str, video: Input.Video | None = None) -> ui.PreviewVideo:
    name, _ = folder_paths.annotated_filepath(file)
    subfolder, _, filename = name.replace("\\", "/").rpartition("/")
    result = ui.SavedResult(filename, subfolder, io.FolderType.input)
    if video is not None:
        _preview_results[video] = (folder_paths.get_annotated_filepath(file), result)
    return ui.PreviewVideo([result])


def _save_video_preview(video: Input.Video) -> ui.PreviewVideo:
    cached = _preview_results.get(video)
    if cached is not None and os.path.isfile(cached[0]):
        return ui.PreviewVideo([cached[1]])

    full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        "ComfyUI_temp_bsai_video", folder_paths.get_temp_directory(), 0, 0
    )
    preview_format = Types.VideoContainer.MP4
    file = f"{filename}_{counter:05}_.{Types.VideoContainer.get_extension(preview_format)}"
    full_path = os.path.join(full_output_folder, file)
    try:
        video.save_to(
            full_path,
            format=preview_format,
            codec="h264",
            preset="ultrafast",
        )
    except Exception:
        # 重编码失败时退一步：不预览，直接返回空
        return ui.PreviewVideo([])
    result = ui.SavedResult(file, subfolder, io.FolderType.temp)
    _preview_results[video] = (full_path, result)
    return ui.PreviewVideo([result])


# ===========================================================================
# Node: BSAI 视频合并 —— 动态输入端视频合并
# ===========================================================================
class BSAI_VideoMerge(io.ComfyNode):
    """
    视频合并节点：
    - 默认 2 个视频输入端
    - 连接第 2 个后自动新增第 3 个，以此类推（最多 100 个）
    - 按输入端顺序将所有视频拼接为一个新视频
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BSAI_VideoMerge",
            display_name="BSAI 视频合并",
            search_aliases=["BSAI merge video", "BSAI 视频拼接", "concatenate", "视频合并"],
            category="BSAI/视频",
            description="将多个视频按顺序合并为一个视频。默认 2 个输入端，连接后自动新增更多端口。",
            inputs=[
                io.Autogrow.Input(
                    "videos",
                    template=io.Autogrow.TemplatePrefix(
                        io.Video.Input("video", tooltip="要合并的视频片段。按输入顺序拼接。"),
                        prefix="video",
                        min=2,
                        max=100,
                    ),
                    tooltip="要合并的视频片段，按连接顺序依次拼接。连接 video2 后会自动出现 video3，以此类推。",
                ),
                io.Combo.Input(
                    "codec",
                    options=Types.VideoCodec.as_input(),
                    default="auto",
                    advanced=True,
                    tooltip="输出视频编码。Auto 自动选择；已编码视频在兼容时保持原编码不变。",
                ),
            ],
            outputs=[
                io.Video.Output(
                    "video",
                    tooltip="合并后的视频。",
                ),
                io.Int.Output(
                    "total_frames",
                    tooltip="合并后视频的总帧数。",
                ),
            ],
            is_input_list=True,
        )

    @classmethod
    def execute(cls, videos: io.Autogrow.Type, codec=None) -> io.NodeOutput:
        import torch
        video_list = [video for group in videos.values() for video in group]

        if len(video_list) == 0:
            raise ValueError("BSAI 视频合并：至少需要连接一个视频输入。")

        def _get_hw(v):
            """从 video components 中正确提取 (height, width)，兼容 (B,C,H,W) 和 (B,H,W,C)。"""
            c = v.get_components()
            s = c.images.shape
            # s 通常是 (B, C, H, W) 或 (B, H, W, C)
            # 如果最后一维是 1/3/4，说明是通道最后 (B,H,W,C)
            if s[-1] in (1, 3, 4) and s[-2] > 4:
                return s[-3], s[-2], c  # H, W
            return s[-2], s[-1], c

        # 以第一个视频的尺寸为目标
        target_h, target_w, ref_comp = _get_hw(video_list[0])

        # 检查是否所有片段尺寸一致
        need_resize = False
        for v in video_list[1:]:
            h, w, _ = _get_hw(v)
            if h != target_h or w != target_w:
                need_resize = True
                break

        def _normalize(v):
            """把视频帧 letterbox 到 target_h x target_w。"""
            h, w, comp = _get_hw(v)
            imgs = comp.images
            # 统一成 (B, C, H, W)
            if imgs.dim() == 4 and imgs.shape[-1] in (1, 3, 4):
                imgs = imgs.permute(0, 3, 1, 2).contiguous()
            if h != target_h or w != target_w:
                scale = min(target_w / w, target_h / h)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                resized = torch.nn.functional.interpolate(
                    imgs.float(), size=(new_h, new_w),
                    mode="bilinear", align_corners=False,
                )
                pad_left = (target_w - new_w) // 2
                pad_right = target_w - new_w - pad_left
                pad_top = (target_h - new_h) // 2
                pad_bottom = target_h - new_h - pad_top
                imgs = torch.nn.functional.pad(
                    resized, (pad_left, pad_right, pad_top, pad_bottom),
                    mode="constant", value=0.0,
                ).to(imgs.dtype)
            return imgs, comp

        if not need_resize:
            try:
                merged = InputImpl.VideoFromList(
                    video_list,
                    None,
                    Types.VideoCodec(codec[0] if isinstance(codec, list) else (codec or "auto")),
                )
                total_frames = merged.get_frame_count()
                return io.NodeOutput(merged, total_frames, ui=_save_video_preview(merged))
            except ValueError:
                need_resize = True

        # letterbox 重编码路径
        all_comp = [v.get_components() for v in video_list]

        # 找参考音频格式（第一个有音频的片段）
        ref_audio = None
        for c in all_comp:
            if c.audio is not None:
                ref_audio = c.audio
                break

        def _silent_audio(duration_sec, ref):
            """生成静音 AudioInput，格式与 ref 一致。"""
            import torch
            sr = ref["sample_rate"]
            channels = ref["waveform"].shape[1]
            n_samples = max(1, int(duration_sec * sr))
            waveform = torch.zeros(1, channels, n_samples, dtype=ref["waveform"].dtype)
            return {"waveform": waveform, "sample_rate": sr}

        stripped = []
        for v, comp in zip(video_list, all_comp):
            imgs, _ = _normalize(v)
            imgs = imgs.permute(0, 2, 3, 1).contiguous()
            # 确定音频：有就用原音频，没有就补静音
            if comp.audio is not None:
                audio = comp.audio
            elif ref_audio is not None:
                n_frames = imgs.shape[0]
                duration = n_frames / float(comp.frame_rate)
                audio = _silent_audio(duration, ref_audio)
            else:
                audio = None
            stripped.append(InputImpl.VideoFromComponents(
                Types.VideoComponents(
                    images=imgs,
                    frame_rate=comp.frame_rate,
                    audio=audio,
                ),
                bit_depth=8,
                color_space="sRGB",
            ))
        merged = InputImpl.VideoFromList(
            stripped,
            None,
            Types.VideoCodec.H264,
        )
        total_frames = merged.get_frame_count()
        return io.NodeOutput(merged, total_frames, ui=_save_video_preview(merged))


# ===========================================================================
# Extension 注册
# ===========================================================================
class BSAIVideoMergeExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            BSAI_VideoMerge,
        ]


async def comfy_entrypoint() -> BSAIVideoMergeExtension:
    """ComfyUI 调用此函数加载扩展及其节点。"""
    return BSAIVideoMergeExtension()
