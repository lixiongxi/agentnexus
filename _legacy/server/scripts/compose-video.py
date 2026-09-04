#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
演示视频合成：截图 + 底部中文字幕条 → MP4
用法：python compose-video.py [输出路径]
依赖：pillow imageio imageio-ffmpeg（venv 内）
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

import numpy as np
import imageio.v2 as imageio

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.normpath(os.path.join(HERE, "..", "demo-frames"))  # server/demo-frames
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "demo-video.mp4")
OUT = os.path.abspath(OUT)

W, H = 1440, 900          # 输出帧尺寸
BAR_H = 108               # 底部字幕条高度
FPS = 30
TARGET_SIZE = (W, H)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # 微软雅黑
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",    # 黑体
]
FONT_PATH = next((f for f in FONT_CANDIDATES if os.path.exists(f)), None)
if not FONT_PATH:
    print("⚠️ 未找到中文字体，字幕将退化为英文占位")
    FONT_PATH = None

def make_frame(img: Image.Image, caption: str) -> Image.Image:
    img = img.convert("RGB").resize(TARGET_SIZE, Image.LANCZOS)
    if not caption:
        return img
    bar = Image.new("RGB", (W, BAR_H), (10, 16, 30))
    draw = ImageDraw.Draw(bar)
    # 半透明遮罩
    mask = Image.new("L", (W, BAR_H), 0)
    ImageDraw.Draw(mask).rectangle((0, 0, W, BAR_H), fill=160)
    bar.putalpha(mask)
    # 合成到底部
    canvas = img.copy()
    bar_rgb = bar.convert("RGB")
    canvas.paste(bar_rgb, (0, H - BAR_H))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT_PATH, 34) if FONT_PATH else ImageFont.load_default()
    text = caption
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (W - tw) // 2
    ty = H - BAR_H // 2 - th // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=(235, 240, 250))
    return canvas

def main():
    with open(os.path.join(FRAMES, "meta.json"), encoding="utf-8") as f:
        shots = json.load(f)
    total_dur = sum(s["dur"] for s in shots)
    print(f"共 {len(shots)} 段，总时长约 {total_dur:.1f}s，输出 → {OUT}")

    writer = imageio.get_writer(OUT, fps=FPS, codec="libx264", quality=8, macro_block_size=1)
    for i, s in enumerate(shots):
        path = os.path.join(FRAMES, s["file"])
        if not os.path.exists(path):
            print(f"  ⚠️ 缺帧 {s['file']}，跳过")
            continue
        img = Image.open(path)
        frame = make_frame(img, s["caption"])
        frames = max(1, round(s["dur"] * FPS))
        for _ in range(frames):
            writer.append_data(np.array(frame))
        print(f"  [{i+1}/{len(shots)}] {s['file']} · {s['dur']}s · {s['caption']}")
    writer.close()
    size_mb = os.path.getsize(OUT) / 1024 / 1024
    print(f"\n✅ 视频生成完成：{OUT} ({size_mb:.1f} MB, {total_dur:.1f}s)")

if __name__ == "__main__":
    main()
