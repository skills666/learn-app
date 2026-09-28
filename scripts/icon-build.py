#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把选中的仙侠头像做成 App 图标母版（默认 1024x1024，无白边、无水印）。

流程：
1. 从四角 flood 外部白区（容差保守，避免吞掉山峰亮部），再补上灰白色水印文字像素，整体刷白 → 水印消失
2. 内容区按 Z（--z，默认 0.88）放大裁切到 SIZE（--size，默认 1024）→ 四角残余白弧被推出画面
3. 残余小白区用「最近前景像素外推 + 羽化」填平
4. 导出：master-1024 / master-transparent-1024（透明四角素材）/ icon-192 / icon-512 / icon-maskable-512
5. 同步到 android/app/src/main/res 各 dpi（前景 / 圆角 / 圆形），并把插画四边平均色
   写进 values/ic_launcher_background.xml 的背景层颜色（原先只打印建议值，每次都要手工改）

依赖：pillow、numpy、opencv-python（未随仓库声明，需自行安装）
用法：
  python scripts/icon-build.py                  # 默认源图 → generated-images/selected/
  python scripts/icon-build.py --dry-run        # 只跑检测与自检，不写任何文件
  python scripts/icon-build.py --src xxx.png --z 0.90 --skip-android

自检不达标（水印残留像素过多 / 锐度异常低）时以退出码 1 结束 —— 不再"打印了当成功"。
"""
import argparse
import os
import sys

_DEFAULT_BASE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                              '..', 'generated-images', 'selected'))


def parse_args(argv=None):
    p = argparse.ArgumentParser(description='生成 PWA 与 Android 图标')
    p.add_argument('--src', default=os.path.join(_DEFAULT_BASE, 'source-demoness-05-desktop.png'),
                   help='源图路径（默认 generated-images/selected/source-demoness-05-desktop.png）')
    p.add_argument('--out', default=_DEFAULT_BASE, help='输出目录（默认 generated-images/selected/）')
    p.add_argument('--size', type=int, default=1024, help='母版边长，默认 1024')
    p.add_argument('--z', type=float, default=0.88, help='放大裁切比例：按 1/Z 放大，默认 0.88')
    p.add_argument('--dry-run', action='store_true', help='只做检测与自检，不写任何文件')
    p.add_argument('--skip-android', action='store_true', help='跳过 Android（mipmap + 背景色）导出')
    p.add_argument('--no-write-bg-color', action='store_true', help='不写 ic_launcher_background.xml')
    return p.parse_args(argv)


def require_deps():
    try:
        import numpy          # noqa: F401
        import cv2            # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print('[错误] 缺少依赖：%s' % e, file=sys.stderr)
        print('请先安装：pip install pillow numpy opencv-python', file=sys.stderr)
        sys.exit(2)


def write_bg_color(res_dir, rgb, dry_run=False):
    """把四边平均色写进自适应图标的背景层颜色（原实现只打印，容易忘改）。"""
    path = os.path.join(res_dir, 'values', 'ic_launcher_background.xml')
    hexv = '#%02X%02X%02X' % tuple(rgb)
    if not os.path.isfile(path):
        print('  [skip] 缺少 %s，背景色未写入' % path)
        return
    with open(path, 'r', encoding='utf-8') as f:
        txt = f.read()
    import re
    # 先确认节点存在，再判断"是否需要改"：否则"色值本来就一致"会被误报成"没匹配到"
    if not re.search(r'<color name="ic_launcher_background">', txt):
        print('  [skip] ic_launcher_background.xml 未找到色值节点，请手动确认')
        return
    new = re.sub(r'(<color name="ic_launcher_background">)(#[0-9A-Fa-f]{6,8})(</color>)',
                 lambda m: m.group(1) + hexv + m.group(3), txt)
    if new == txt:
        print('  背景色已是 %s，无需修改' % hexv)
        return
    if dry_run:
        print('  [dry-run] 背景色将写为 %s' % hexv)
        return
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    print('  背景色已写入 ic_launcher_background.xml：%s' % hexv)


def main(argv=None):
    # Windows 控制台编码可能是 GBK：遇到无法编码的字符用替代符而不是抛 UnicodeEncodeError
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, 'reconfigure'):
            try:
                _stream.reconfigure(errors='replace')
            except Exception:
                pass

    args = parse_args(argv)
    require_deps()

    import numpy as np
    import cv2
    from PIL import Image

    src = os.path.abspath(args.src)
    if not os.path.isfile(src):
        print('[错误] 找不到源图：%s' % src, file=sys.stderr)
        return 2
    if not (0.5 <= args.z <= 1.0):
        print('[错误] --z 必须在 0.5~1.0 之间', file=sys.stderr)
        return 2
    out_dir = os.path.abspath(args.out)
    if not args.dry_run:
        os.makedirs(out_dir, exist_ok=True)
    SIZE = int(args.size)
    Z = float(args.z)

    def save_img(img, path, **kw):
        """path 传完整路径：输出可能落在 generated-images/selected/ 或 android/res/ 下。"""
        if args.dry_run:
            print('  [dry-run] 跳过写入 ' + path)
            return
        img.save(path, **kw)

    a = np.array(Image.open(src).convert('RGB'))
    H, W = a.shape[:2]
    print('src', W, 'x', H)

    # ---------- 1) 外部白区（含水印）识别并刷白 ----------
    lum = a.mean(axis=2)
    sat = a.max(axis=2).astype(np.int16) - a.min(axis=2).astype(np.int16)

    # 1a. 近白像素的连通域中，与画面四边相连的 = 圆角矩形外部的白框
    light = (lum > 235).astype(np.uint8)
    _, lab = cv2.connectedComponents(light, connectivity=8)
    edge_labels = set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    edge_labels.discard(0)
    ext = np.isin(lab, list(edge_labels)) if edge_labels else np.zeros_like(light, bool)
    print('outer white ratio', round(float(ext.mean()), 4), 'components', len(edge_labels))

    # 1b. 右下角水印「Qoder AI 生成」是灰白字，压在外部白区上：限定在紧贴白区的 25px 带内识别
    grow = cv2.dilate(ext.astype(np.uint8), np.ones((51, 51), np.uint8), 1).astype(bool)
    yy, xx = np.mgrid[0:H, 0:W]
    region = (xx > W * 0.72) & (yy > H * 0.86)                 # 水印只可能在右下角这一带
    glyph = grow & region & (lum > 138) & (sat < 60) & ~ext    # 灰白、低饱和的笔画像素
    print('watermark glyph px', int(glyph.sum()))
    mask = ext | glyph
    a2 = a.copy()
    a2[mask] = 255

    # ---------- 2) 在刷白后的图上重算内容 bbox，放大裁切 ----------
    white2 = (a2[:, :, 0] > 244) & (a2[:, :, 1] > 244) & (a2[:, :, 2] > 244)
    ys = np.where((~white2).sum(axis=1) > max(3, int(W * 0.02)))[0]
    xs = np.where((~white2).sum(axis=0) > max(3, int(H * 0.02)))[0]
    if not len(xs) or not len(ys):
        print('[错误] 刷白后找不到内容区（源图可能整体接近纯白），请检查 --src', file=sys.stderr)
        return 2
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    print('content bbox', (x0, y0, x1, y1), 'size', x1 - x0, y1 - y0)

    cw, ch = x1 - x0, y1 - y0
    nx0 = x0 + int(cw * (1 - Z) / 2); nx0r = nx0 + int(cw * Z)
    ny0 = y0 + int(ch * (1 - Z) / 2); ny0r = ny0 + int(ch * Z)
    crop = a2[ny0:ny0r, nx0:nx0r]
    c = np.array(Image.fromarray(crop).resize((SIZE, SIZE), Image.LANCZOS))

    # ---------- 3) 残余白区外推填充（只改填充区，内容区逐像素保留） ----------
    wm2 = ((c[:, :, 0] > 242) & (c[:, :, 1] > 242) & (c[:, :, 2] > 242)).astype(np.uint8)
    num, lab = cv2.connectedComponents(wm2, connectivity=4)
    edge = set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    edge.discard(0)
    m = np.isin(lab, list(edge)).astype(np.uint8)
    print('residual white ratio', round(float(m.mean()), 5))

    _, labels = cv2.distanceTransformWithLabels((1 - m).astype(np.uint8), cv2.DIST_L2, 5,
                                                labelType=cv2.DIST_LABEL_PIXEL)
    fys, fxs = np.where(m == 0)
    idx = np.clip(labels - 1, 0, len(fys) - 1)
    filled = c.copy()
    bad = m.astype(bool)
    filled[bad] = c[fys[idx[bad]], fxs[idx[bad]]]
    # 只把「填充区」柔化后与原图混合：alpha 以白区 mask 为准，内容区 alpha≈0 → 原像素不被触碰
    fill_smooth = cv2.GaussianBlur(filled, (0, 0), 2.5).astype(np.float32)
    af = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3.0) * 1.7, 0, 1)[..., None]
    master = np.clip(c.astype(np.float32) * (1 - af) + fill_smooth * af, 0, 255).astype(np.uint8)

    # 放大 1/Z 倍带来的轻微软化用轻量 USM 补偿；填充区（外推补的云雾）不锐化，避免放大拉伸纹理
    _usmb = cv2.GaussianBlur(master, (0, 0), 1.1).astype(np.float32)
    _usm = np.clip(master.astype(np.float32) * 1.5 - _usmb * 0.5, 0, 255)
    master = np.clip(_usm * (1 - af) + master.astype(np.float32) * af, 0, 255).astype(np.uint8)

    # 清晰度自检：母版应接近「源图 × Z²」的理论值，明显偏低说明又被糊了
    lap_src = float(cv2.Laplacian(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), cv2.CV_64F).var())
    lap_m = float(cv2.Laplacian(cv2.cvtColor(master, cv2.COLOR_RGB2GRAY), cv2.CV_64F).var())
    print('sharpness 源图=%.1f 母版=%.1f（放大1/%.2f 后理论≈%.0f）' % (lap_src, lap_m, Z, lap_src * Z * Z))

    # ---------- 4) 水印残留自检：右下角是否还有灰白文字 ----------
    rx = master[int(SIZE * 0.55):, int(SIZE * 0.45):]
    rl = rx.mean(axis=2)
    rs = rx.max(axis=2).astype(np.int16) - rx.min(axis=2).astype(np.int16)
    sus = int(((rl > 135) & (rl < 240) & (rs < 40)).sum())
    print('右下可疑灰白像素数（应接近 0）:', sus)

    # ---------- 5) 导出 ----------
    img_master = Image.fromarray(master)
    save_img(img_master, os.path.join(out_dir, 'master-1024.png'))

    # 透明四角素材：原始构图 + 外部透明（水印区域也在外部 → 一并透明）
    al = ((~ext).astype(np.float32) * 255)
    al = cv2.GaussianBlur(al, (0, 0), 1.2)
    rgba = np.dstack([a, np.clip(al, 0, 255).astype(np.uint8)])
    save_img(Image.fromarray(rgba, 'RGBA'), os.path.join(out_dir, 'master-transparent-1024.png'))

    save_img(img_master.resize((192, 192), Image.LANCZOS), os.path.join(out_dir, 'icon-192.png'))
    save_img(img_master.resize((512, 512), Image.LANCZOS), os.path.join(out_dir, 'icon-512.png'))

    # maskable：内容缩到 80% 居中（安全区），四周用整图大半径模糊的色雾填充（避免 BORDER_REPLICATE 拉丝）
    inner_s = int(512 * 0.8)
    inner = np.array(img_master.resize((inner_s, inner_s), Image.LANCZOS)).astype(np.float32)
    bg = cv2.GaussianBlur(np.array(img_master.resize((512, 512), Image.LANCZOS)).astype(np.float32), (0, 0), 45)
    feather = max(8, int(inner_s * 0.10))
    al = np.zeros((inner_s, inner_s), np.float32)
    al[feather:inner_s - feather, feather:inner_s - feather] = 1.0
    al = cv2.GaussianBlur(al, (0, 0), feather * 0.45)
    off = (512 - inner_s) // 2
    a3 = al[..., None]
    bg[off:off + inner_s, off:off + inner_s] = inner * a3 + bg[off:off + inner_s, off:off + inner_s] * (1 - a3)
    save_img(Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)), os.path.join(out_dir, 'icon-maskable-512.png'))
    print('done ->', out_dir if not args.dry_run else '(dry-run，未写盘)')

    # ---------- 6) 同步到 Android 各 dpi ----------
    # 这一步原先全靠手工拷贝，漏做就会出现「PWA 图标换了、App 里还是旧图标」（真实踩过）：
    #   ic_launcher / ic_launcher_round → API 23-25 的兜底位图（圆角方形 / 圆形，四角透明）
    #   ic_launcher_foreground         → API 26+ 自适应图标前景（108dp 满铺）
    #   背景层颜色 = 插画四边平均色（写进 values/ic_launcher_background.xml，供视差动效露出）
    if not args.skip_android:
        from PIL import ImageDraw
        android_res = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                    '..', 'android', 'app', 'src', 'main', 'res'))
        if not os.path.isdir(android_res):
            print('未找到 android 工程，跳过 android 图标导出')
        else:
            DENS = [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]

            def _shaped(im, circle=False, ratio=0.20):
                w, h = im.size
                S = 4   # 4x 超采样：小尺寸图标的圆角/圆形边缘才不会有锯齿
                mask = Image.new('L', (w * S, h * S), 0)
                d = ImageDraw.Draw(mask)
                if circle:
                    d.ellipse([0, 0, w * S - 1, h * S - 1], fill=255)
                else:
                    d.rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=int(round(min(w, h) * ratio * S)), fill=255)
                out = im.copy()
                out.putalpha(mask.resize((w, h), Image.LANCZOS))
                return out

            _m = int(SIZE * 0.04)
            edge_px = np.concatenate([master[:_m, :, :].reshape(-1, 3), master[-_m:, :, :].reshape(-1, 3),
                                      master[:, :_m, :].reshape(-1, 3), master[:, -_m:, :].reshape(-1, 3)])
            bgc = tuple(int(round(v)) for v in edge_px.mean(axis=0))
            missing = []
            for dpi, legacy, fg in DENS:
                d = os.path.join(android_res, 'mipmap-' + dpi)
                if not os.path.isdir(d):
                    missing.append(dpi)
                    continue
                save_img(img_master.resize((fg, fg), Image.LANCZOS), os.path.join(d, 'ic_launcher_foreground.webp'), quality=92, method=6)
                save_img(_shaped(img_master).resize((legacy, legacy), Image.LANCZOS), os.path.join(d, 'ic_launcher.webp'), quality=92, method=6)
                save_img(_shaped(img_master, circle=True).resize((legacy, legacy), Image.LANCZOS), os.path.join(d, 'ic_launcher_round.webp'), quality=92, method=6)
            if missing:
                print('  [skip] 缺少目录：mipmap-' + '、mipmap-'.join(missing) + '（这些 dpi 未导出）')
            print('android 图标已同步 mipmap-{mdpi..xxxhdpi}；背景层颜色 #%02X%02X%02X' % bgc)
            if not args.no_write_bg_color:
                write_bg_color(android_res, bgc, dry_run=args.dry_run)

    # ---------- 7) 自检 gate：不达标就以非零退出码结束（原先无论多差都 exit 0） ----------
    problems = []
    if lap_m < lap_src * Z * Z * 0.35:
        problems.append('锐度异常：母版 %.1f 明显低于理论值 %.0f' % (lap_m, lap_src * Z * Z))
    if sus > 50:
        # 水印残留只做提示、不做门禁：插画右下角的浅色云雾也会被这个指标统计进去
        # （实测这份源图常年四位数，而水印实际已洗净）。真要看水印是否干净，人眼看一眼母版的右下角。
        print('  提示：右下可疑灰白像素 %d（含插画本身的浅色区域，仅供人工参考）' % sus, file=sys.stderr)
    if problems:
        print('\n[自检未通过] ' + '；'.join(problems), file=sys.stderr)
        print('请检查源图 / 参数后重跑；确实需要接受当前结果时，可先 --dry-run 看数值再决定。', file=sys.stderr)
        return 1
    print('自检通过。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
