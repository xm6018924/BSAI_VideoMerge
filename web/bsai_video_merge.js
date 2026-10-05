/**
 * BSAI Video Merge - Frontend Extension
 * 
 * 为 BSAI 加载视频节点增强帧选择交互：
 * - 在视频预览下方添加帧跳转控制条
 * - 支持输入帧号快速跳转
 * - 支持上一帧 / 下一帧按钮
 * - 显示当前帧 / 总帧数
 * - 自动同步 frame_index 滑块值
 */

import { app } from "../../../scripts/app.js";

const STYLE_ID = "bsai-video-merge-css";
if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
.bsai-framesel {
    padding: 6px 8px;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
    font-family: sans-serif;
    font-size: 12px;
    color: #ccc;
    user-select: none;
}
.bsai-framesel-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
}
.bsai-framesel-row:last-child {
    margin-bottom: 0;
}
.bsai-framesel-label {
    color: #8cf;
    font-weight: bold;
    min-width: 70px;
}
.bsai-framesel-input {
    flex: 1;
    background: #222;
    border: 1px solid #444;
    color: #eee;
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 12px;
    width: 60px;
    text-align: center;
}
.bsai-framesel-input:focus {
    outline: none;
    border-color: #4a90d9;
}
.bsai-framesel-btn {
    background: #2a4a6a;
    color: #fff;
    border: 1px solid #3a5a7a;
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
}
.bsai-framesel-btn:hover {
    background: #3a5a8a;
}
.bsai-framesel-btn:active {
    background: #1a3a5a;
}
.bsai-framesel-btn:disabled {
    background: #333;
    border-color: #444;
    color: #666;
    cursor: not-allowed;
}
.bsai-framesel-info {
    color: #999;
    font-size: 11px;
    flex: 1;
    text-align: right;
}
.bsai-framesel-mode {
    color: #4c8;
    font-size: 11px;
    margin-left: 4px;
}
.bsai-framesel-mode.off {
    color: #999;
}
`;
    document.head.appendChild(st);
}

/**
 * 获取节点上指定名称的 widget
 */
function getWidgetByName(node, widgetName) {
    if (!node || !node.widgets) return null;
    return node.widgets.find(w => w.name === widgetName);
}

/**
 * 为 BSAI_LoadVideo 节点创建帧选择控件
 */
function createFrameSelector(node) {
    const frameIdxWidget = getWidgetByName(node, "frame_index");
    const modeWidget = getWidgetByName(node, "output_mode");
    if (!frameIdxWidget) return null;

    const container = document.createElement("div");
    container.className = "bsai-framesel";

    // 模式指示
    const modeRow = document.createElement("div");
    modeRow.className = "bsai-framesel-row";
    const modeLabel = document.createElement("span");
    modeLabel.className = "bsai-framesel-label";
    modeLabel.textContent = "帧选择";
    const modeBadge = document.createElement("span");
    modeBadge.className = "bsai-framesel-mode";
    modeBadge.textContent = "已启用";
    const modeInfo = document.createElement("span");
    modeInfo.className = "bsai-framesel-info";
    modeInfo.textContent = "在上方拖动预览帧定位";
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeBadge);
    modeRow.appendChild(modeInfo);

    // 帧号输入 + 跳转按钮
    const inputRow = document.createElement("div");
    inputRow.className = "bsai-framesel-row";

    const prevBtn = document.createElement("button");
    prevBtn.className = "bsai-framesel-btn";
    prevBtn.textContent = "◀ 上一帧";
    prevBtn.title = "上一帧 (快捷键: ←)";

    const frameInput = document.createElement("input");
    frameInput.type = "number";
    frameInput.className = "bsai-framesel-input";
    frameInput.min = "0";
    frameInput.value = frameIdxWidget.value || 0;
    frameInput.title = "当前帧索引（从0开始）";

    const nextBtn = document.createElement("button");
    nextBtn.className = "bsai-framesel-btn";
    nextBtn.textContent = "下一帧 ▶";
    nextBtn.title = "下一帧 (快捷键: →)";

    const gotoBtn = document.createElement("button");
    gotoBtn.className = "bsai-framesel-btn";
    gotoBtn.textContent = "跳转";
    gotoBtn.title = "跳转到指定帧";

    inputRow.appendChild(prevBtn);
    inputRow.appendChild(frameInput);
    inputRow.appendChild(nextBtn);
    inputRow.appendChild(gotoBtn);

    container.appendChild(modeRow);
    container.appendChild(inputRow);

    // 更新模式显示
    function updateModeBadge() {
        const mode = modeWidget ? modeWidget.value : "输出完整视频";
        if (mode === "输出选中单帧") {
            modeBadge.textContent = "单帧模式";
            modeBadge.classList.remove("off");
        } else {
            modeBadge.textContent = "完整视频";
            modeBadge.classList.add("off");
        }
    }
    updateModeBadge();

    // 同步 frame_index widget -> input
    const origCallback = frameIdxWidget.callback;
    frameIdxWidget.callback = function(v) {
        frameInput.value = Math.round(v);
        if (typeof origCallback === "function") {
            return origCallback.apply(this, arguments);
        }
    };

    // 同步 mode widget
    if (modeWidget) {
        const origModeCb = modeWidget.callback;
        modeWidget.callback = function(v) {
            updateModeBadge();
            if (typeof origModeCb === "function") {
                return origModeCb.apply(this, arguments);
            }
        };
    }

    // 上一帧
    prevBtn.addEventListener("click", () => {
        const cur = parseInt(frameInput.value) || 0;
        const next = Math.max(0, cur - 1);
        frameInput.value = next;
        frameIdxWidget.value = next;
        if (frameIdxWidget.callback) frameIdxWidget.callback(next);
        node.setDirtyCanvas(true, true);
    });

    // 下一帧
    nextBtn.addEventListener("click", () => {
        const cur = parseInt(frameInput.value) || 0;
        const next = cur + 1;
        frameInput.value = next;
        frameIdxWidget.value = next;
        if (frameIdxWidget.callback) frameIdxWidget.callback(next);
        node.setDirtyCanvas(true, true);
    });

    // 跳转
    function gotoFrame() {
        let val = parseInt(frameInput.value);
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        frameIdxWidget.value = val;
        frameInput.value = val;
        if (frameIdxWidget.callback) frameIdxWidget.callback(val);
        node.setDirtyCanvas(true, true);
    }
    gotoBtn.addEventListener("click", gotoFrame);
    frameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            gotoFrame();
        }
    });

    // 在 widget 面板中插入控件
    // 找到 frame_index widget 的 DOM 元素并在其后插入
    setTimeout(() => {
        // 尝试找到节点的 widget DOM
        const nodeEl = document.querySelector(`.litegraph-node[data-id="${node.id}"]`);
        if (nodeEl) {
            const widgetsEl = nodeEl.querySelector(".widgets");
            if (widgetsEl) {
                widgetsEl.appendChild(container);
            }
        }
    }, 100);

    return container;
}

app.registerExtension({
    name: "BSAI.VideoMerge",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "BSAI_LoadVideo") {
            // 节点创建时初始化帧选择控件
            const onAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function() {
                const r = onAdded ? onAdded.apply(this, arguments) : undefined;
                // 延迟创建，等待 DOM 渲染
                setTimeout(() => createFrameSelector(this), 200);
                return r;
            };

            // 节点尺寸调整
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                setTimeout(() => createFrameSelector(this), 200);
                return r;
            };
        }
    },
});
