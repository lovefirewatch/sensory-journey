# -*- coding: utf-8 -*-
"""
gen_placeholders.py —— 生成带标注的占位图

用途：在你替换自己的美术之前，让框架能完整跑起来并看清布局。
每张图上都会标注「建议尺寸 + 用途 + 文件名」，你一眼就知道该换哪张、做多大。

运行（需安装 Pillow）：python3 tools/gen_placeholders.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/alibaba-puhuiti/AlibabaPuHuiTi-2-75-SemiBold.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-micro-hei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def rounded_rect(size, radius, fill, outline=None, width=0):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius,
                        fill=fill, outline=outline, width=width)
    return img


def make_element(path, size, title, color, note=""):
    """场景元素占位图：半透明填充 + 虚线框 + 名称 + 尺寸标注

    与按钮的区别：元素图是"场景里的东西"，用更轻的描边风格，
    避免看起来像 UI 控件。
    """
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 主体色块
    d.rectangle([0, 0, size[0] - 1, size[1] - 1], fill=color + (200,))
    # 描边
    d.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=(255, 255, 255, 200), width=3)
    # 内部虚线（提示这是占位）
    step = max(10, min(size) // 14)
    for x in range(0, size[0], step):
        d.line([(x, 0), (x + size[1] * 0.25, size[1])], fill=(255, 255, 255, 26), width=2)
    # 文字
    f_main = load_font(int(min(size) * 0.20))
    f_sub = load_font(int(min(size) * 0.11))
    cy = size[1] * (0.42 if note else 0.46)
    d.text((size[0] / 2, cy), title, font=f_main, fill=(255, 255, 255, 245), anchor="mm")
    d.text((size[0] / 2, size[1] * 0.68), (note or "") + "  %d×%d" % size,
           font=f_sub, fill=(255, 255, 255, 190), anchor="mm")
    img.save(path)
    print("  ✓", os.path.relpath(path, BASE))


def make_button(path, size, text, color, sub):
    """按钮占位图：圆角矩形 + 中文按钮文字 + 尺寸标注"""
    img = rounded_rect(size, radius=int(min(size) * 0.28),
                       fill=color + (230,), outline=(255, 255, 255, 120), width=3)
    d = ImageDraw.Draw(img)
    f_main = load_font(int(size[1] * 0.36))
    f_sub = load_font(int(size[1] * 0.16))
    d.text((size[0] / 2, size[1] * 0.44), text, font=f_main, fill=(15, 20, 35, 255), anchor="mm")
    d.text((size[0] / 2, size[1] * 0.80), sub, font=f_sub, fill=(25, 30, 45, 200), anchor="mm")
    img.save(path)
    print("  ✓", os.path.relpath(path, BASE))


def make_bg(path, size, title, color):
    """背景占位图：渐变 + 标题 + 尺寸标注"""
    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    top = tuple(min(255, c + 40) for c in color)
    for y in range(size[1]):
        t = y / size[1]
        d.line([(0, y), (size[0], y)],
               fill=tuple(int(top[i] * (1 - t) + color[i] * t) for i in range(3)))
    # 斜条纹，表明这是占位图
    for i in range(-size[1], size[0], 60):
        d.line([(i, 0), (i + size[1], size[1])], fill=(255, 255, 255, 18), width=8)
    f1 = load_font(int(size[1] * 0.10))
    f2 = load_font(int(size[1] * 0.032))
    d.text((size[0] / 2, size[1] * 0.42), title, font=f1, fill=(235, 240, 255), anchor="mm")
    d.text((size[0] / 2, size[1] * 0.54),
           "占位背景图 · 建议 %d×%d" % size, font=f2, fill=(190, 200, 225), anchor="mm")
    d.text((size[0] / 2, size[1] * 0.60), os.path.basename(path), font=f2,
           fill=(190, 200, 225), anchor="mm")
    img.save(path, quality=88)
    print("  ✓", os.path.relpath(path, BASE))


def make_icon(path, size, text, color, sub):
    """方形图标占位图（声音开关、返回）"""
    img = rounded_rect(size, radius=int(min(size) * 0.30),
                       fill=color + (235,), outline=(255, 255, 255, 120), width=4)
    d = ImageDraw.Draw(img)
    f = load_font(int(size[1] * 0.34))
    f2 = load_font(int(size[1] * 0.13))
    d.text((size[0] / 2, size[1] * 0.42), text, font=f, fill=(15, 20, 35, 255), anchor="mm")
    d.text((size[0] / 2, size[1] * 0.78), sub, font=f2, fill=(25, 30, 45, 200), anchor="mm")
    img.save(path)
    print("  ✓", os.path.relpath(path, BASE))


def make_sprite(path, size, text, color, sub):
    """场景精灵占位图：圆形光晕 + 标注"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(min(size) * 0.46)
    cx, cy = size[0] / 2, size[1] / 2
    for i in range(28, 0, -1):
        a = int(255 * (1 - i / 28) ** 2 * 0.5)
        d.ellipse([cx - r * i / 28, cy - r * i / 28, cx + r * i / 28, cy + r * i / 28],
                  fill=color + (a,))
    d.ellipse([cx - r * 0.34, cy - r * 0.34, cx + r * 0.34, cy + r * 0.34],
              outline=(255, 255, 255, 160), width=4)
    f = load_font(int(size[1] * 0.13))
    f2 = load_font(int(size[1] * 0.075))
    d.text((cx, cy - size[1] * 0.03), text, font=f, fill=(255, 255, 255, 235), anchor="mm")
    d.text((cx, cy + size[1] * 0.10), sub, font=f2, fill=(255, 255, 255, 200), anchor="mm")
    img.save(path)
    print("  ✓", os.path.relpath(path, BASE))


def make_card(path, size, title, color):
    """场景卡片占位图：竖版渐变 + 标题 + 尺寸标注"""
    w, h = size
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    top = tuple(min(255, c + 55) for c in color)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + color[i] * t) for i in range(3)))
    # 淡淡的同心圆，模拟"氛围"
    for i in range(6, 0, -1):
        r = i * w * 0.11
        d.ellipse([w / 2 - r, h * 0.42 - r, w / 2 + r, h * 0.42 + r],
                  outline=tuple(min(255, c + 26) for c in color), width=3)
    d.text((w / 2, h * 0.62), title, font=load_font(int(h * 0.062)), fill=(240, 244, 255), anchor="mm")
    d.text((w / 2, h * 0.70), "卡片占位图 %d×%d" % (w, h),
           font=load_font(int(h * 0.030)), fill=(196, 206, 230), anchor="mm")
    d.text((w / 2, h * 0.755), os.path.basename(path),
           font=load_font(int(h * 0.026)), fill=(170, 182, 210), anchor="mm")
    img.save(path, quality=88)
    print("  ✓", os.path.relpath(path, BASE))


def main():
    UI = os.path.join(BASE, "assets", "ui")
    SC = os.path.join(BASE, "assets", "scenes")
    os.makedirs(UI, exist_ok=True)
    os.makedirs(SC, exist_ok=True)

    print("生成 UI 占位图：")
    make_bg(os.path.join(UI, "bg_title.jpg"), (1920, 1080), "标题页背景", (22, 32, 60))
    make_bg(os.path.join(UI, "bg_title_m.jpg"), (750, 1334), "标题页背景(竖屏)", (22, 32, 60))

    make_button(os.path.join(UI, "btn_start.png"), (480, 160), "开始游戏", (127, 209, 193), "480×160")
    make_button(os.path.join(UI, "btn_start_hover.png"), (480, 160), "开始游戏", (154, 227, 212), "hover")
    make_button(os.path.join(UI, "btn_start_press.png"), (480, 160), "开始游戏", (95, 181, 166), "pressed")

    make_button(os.path.join(UI, "btn_about.png"), (480, 160), "关于", (143, 163, 216), "480×160")
    make_button(os.path.join(UI, "btn_about_hover.png"), (480, 160), "关于", (169, 186, 232), "hover")
    make_button(os.path.join(UI, "btn_about_press.png"), (480, 160), "关于", (117, 135, 192), "pressed")

    make_icon(os.path.join(UI, "btn_sound_on.png"), (128, 128), "♪", (127, 209, 193), "声音开")
    make_icon(os.path.join(UI, "btn_sound_off.png"), (128, 128), "✕", (107, 117, 144), "声音关")
    make_icon(os.path.join(UI, "btn_back.png"), (160, 160), "←", (143, 163, 216), "返回")

    # 关于面板：半透明底
    panel = Image.new("RGBA", (1024, 768), (14, 20, 40, 210))
    d = ImageDraw.Draw(panel)
    f = load_font(44)
    d.text((512, 384), "关于面板底图（可选）1024×768", font=f, fill=(200, 210, 235), anchor="mm")
    panel.save(os.path.join(UI, "panel_about.png"))
    print("  ✓ assets/ui/panel_about.png")

    # 标题 LOGO
    logo = Image.new("RGBA", (800, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(logo)
    f = load_font(96)
    d.text((400, 130), "感 官 之 旅", font=f, fill=(232, 236, 248), anchor="mm")
    f2 = load_font(34)
    d.text((400, 220), "LOGO 占位图 800×300（可选）", font=f2, fill=(154, 166, 196), anchor="mm")
    logo.save(os.path.join(UI, "logo_title.png"))
    print("  ✓ assets/ui/logo_title.png")

    print("生成场景精灵占位图：")
    make_sprite(os.path.join(SC, "sprite_light.png"), (256, 256), "荧光灯", (255, 233, 168), "视觉刺激")
    make_sprite(os.path.join(SC, "sprite_crowd.png"), (256, 256), "人群", (143, 163, 216), "听觉刺激")
    make_sprite(os.path.join(SC, "sprite_tag.png"), (256, 256), "衣领标签", (217, 122, 122), "触觉刺激")
    make_sprite(os.path.join(SC, "sprite_floor.png"), (512, 512), "地面纹理", (42, 51, 80), "可选")
    make_sprite(os.path.join(SC, "mask_vignette.png"), (1024, 1024), "暗角遮罩", (0, 0, 0), "可选")

    # ---- 本轮新增：介绍对话框 / 场景选择页 ----
    print("生成对话框与选择页占位图：")
    make_bg(os.path.join(UI, "bg_select.jpg"), (1920, 1080), "场景选择页背景", (20, 28, 51))

    dlg = Image.new("RGBA", (1024, 768), (18, 26, 51, 232))
    d = ImageDraw.Draw(dlg)
    d.text((512, 384), "对话框面板底图 1024×768", font=load_font(44), fill=(200, 210, 235), anchor="mm")
    dlg.save(os.path.join(UI, "panel_dialog.png"))
    print("  ✓ assets/ui/panel_dialog.png")

    make_button(os.path.join(UI, "btn_enter.png"), (480, 160), "进入场景", (127, 209, 193), "480×160")
    make_button(os.path.join(UI, "btn_enter_hover.png"), (480, 160), "进入场景", (154, 227, 212), "hover")
    make_button(os.path.join(UI, "btn_enter_press.png"), (480, 160), "进入场景", (95, 181, 166), "pressed")
    make_icon(os.path.join(UI, "btn_arrow_left.png"), (128, 128), "‹", (143, 163, 216), "上一个")
    make_icon(os.path.join(UI, "btn_arrow_right.png"), (128, 128), "›", (143, 163, 216), "下一个")

    # ---- 5 张场景卡片图（竖版 3:4） ----
    print("生成场景卡片占位图（900×1200 竖版）：")
    cards = [
        ("card_classroom.jpg", "迟到的课堂", (58, 53, 32)),
        ("card_park.jpg", "公园", (31, 58, 42)),
        ("card_supermarket.jpg", "超市购物", (28, 44, 60)),
        ("card_subway.jpg", "有小孩哭闹的地铁", (42, 36, 64)),
        ("card_night.jpg", "夜晚的房间", (22, 28, 51)),
    ]
    for fn, title, color in cards:
        make_card(os.path.join(SC, fn), (900, 1200), title, color)

    # ---- 第一关「迟到的课堂」新增 ----
    print("生成第一关占位图：")
    make_bg(os.path.join(UI, "bg_classroom.jpg"), (1920, 1080), "关卡加载背景", (26, 34, 48))

    make_button(os.path.join(UI, "btn_ready.png"), (480, 160), "我准备好了", (127, 209, 193), "480×160")
    make_button(os.path.join(UI, "btn_ready_hover.png"), (480, 160), "我准备好了", (154, 227, 212), "hover")
    make_button(os.path.join(UI, "btn_ready_press.png"), (480, 160), "我准备好了", (95, 181, 166), "pressed")

    make_button(os.path.join(UI, "btn_know_more.png"), (480, 160), "再了解一下", (143, 163, 216), "480×160")
    make_button(os.path.join(UI, "btn_know_more_hover.png"), (480, 160), "再了解一下", (169, 186, 232), "hover")
    make_button(os.path.join(UI, "btn_know_more_press.png"), (480, 160), "再了解一下", (117, 135, 192), "pressed")

    # 休息按钮是 320×120（8:3）的宽扁形，和主按钮区分开
    make_button(os.path.join(UI, "btn_rest.png"), (320, 120), "休息一下", (224, 160, 106), "320×120")
    make_button(os.path.join(UI, "btn_rest_hover.png"), (320, 120), "休息一下", (240, 185, 138), "hover")
    make_button(os.path.join(UI, "btn_rest_press.png"), (320, 120), "休息一下", (200, 134, 79), "pressed")

    # ---- 第一关「迟到的课堂」：教室元素（★ 场景由占位图搭建） ----
    print("生成教室场景元素占位图（assets/scenes/l1）：")
    L1 = os.path.join(SC, "l1")
    os.makedirs(L1, exist_ok=True)

    make_bg(os.path.join(L1, "bg_classroom_room.jpg"), (3840, 1280),
            "教室全景背景（3:1 横向平移）", (37, 48, 63))
    make_element(os.path.join(L1, "el_door.png"), (512, 1024), "门", (107, 85, 64), "可点击推开")
    make_element(os.path.join(L1, "el_blackboard.png"), (1024, 512), "黑板", (38, 64, 47), "可点击 5 次")
    make_element(os.path.join(L1, "el_desk.png"), (512, 256), "课桌", (138, 111, 74), "装饰")
    make_element(os.path.join(L1, "el_chair.png"), (256, 384), "歪椅子", (150, 120, 79), "可点击扶正")
    make_element(os.path.join(L1, "el_teacher.png"), (384, 768), "老师", (58, 66, 84), "点名时走近")
    make_element(os.path.join(L1, "el_hand.png"), (256, 256), "举手", (240, 226, 206), "可点击")
    make_element(os.path.join(L1, "el_orb.png"), (256, 256), "声源", (22, 40, 58), "可点击聚焦")
    make_element(os.path.join(L1, "el_noise.png"), (128, 128), "干扰点", (255, 233, 168), "0.8s 闪烁")
    make_element(os.path.join(L1, "el_char.png"), (128, 128), "字块", (30, 52, 40), "拼字用")
    make_element(os.path.join(L1, "el_step.png"), (256, 96), "步骤", (27, 36, 64), "翻书步骤")
    print("  → 字块/步骤块/圆钮上的文字是运行时画的（内容动态），不烘进图片")

    info = Image.new("RGBA", (1024, 768), (16, 24, 44, 224))
    d = ImageDraw.Draw(info)
    d.text((512, 384), "关卡信息卡面板 1024×768", font=load_font(44), fill=(200, 210, 235), anchor="mm")
    info.save(os.path.join(UI, "panel_level_info.png"))
    print("  ✓ assets/ui/panel_level_info.png")

    print("\n全部占位图生成完毕 → assets/ui 与 assets/scenes")
    print("替换时保持同名同路径即可，无需改代码。")


if __name__ == "__main__":
    main()
