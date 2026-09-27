# -*- coding: utf-8 -*-
"""把选中的仙侠头像做成 App 图标母版（1024x1024，无白边、无水印）。

流程（v2）：
1. 从四角 flood 外部白区（容差保守，避免吞掉山峰亮部），再补上灰白色水印文字像素，整体刷白 → 水印消失
2. 内容区按 Z=0.86 放大裁切到 1024 → 四角残余白弧被推出画面
3. 残余小白区用「最近前景像素外推 + 羽化」填平
4. 导出：master-1024 / master-transparent-1024（透明四角素材）/ icon-192 / icon-512 / icon-maskable-512
输出目录：generated-images/selected/（验证通过后再覆盖根目录图标）
"""
from PIL import Image
import numpy as np
import cv2
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'generated-images', 'selected')
SRC = os.path.join(BASE, 'source-demoness-05-desktop.png')   # 用户桌面上的原始文件
SIZE = 1024
Z = 0.88   # 放大裁切比例：1/Z 放大，四角圆角弧被推出画面（放大倍数越小越清晰）

a = np.array(Image.open(SRC).convert('RGB'))
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
Image.fromarray(master).save(os.path.join(BASE, 'master-1024.png'))

# 透明四角素材：原始构图 + 外部透明（水印区域也在外部 → 一并透明）
al = ((~ext).astype(np.float32) * 255)
al = cv2.GaussianBlur(al, (0, 0), 1.2)
rgba = np.dstack([a, np.clip(al, 0, 255).astype(np.uint8)])
Image.fromarray(rgba, 'RGBA').save(os.path.join(BASE, 'master-transparent-1024.png'))

img_master = Image.fromarray(master)
img_master.resize((192, 192), Image.LANCZOS).save(os.path.join(BASE, 'icon-192.png'))
img_master.resize((512, 512), Image.LANCZOS).save(os.path.join(BASE, 'icon-512.png'))

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
Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).save(os.path.join(BASE, 'icon-maskable-512.png'))
print('done ->', BASE)

# ---------- 6) 同步到 Android 各 dpi ----------
# 这一步原先全靠手工拷贝，漏做就会出现「PWA 图标换了、App 里还是旧图标」（真实踩过）：
#   ic_launcher / ic_launcher_round → API 23-25 的兜底位图（圆角方形 / 圆形，四角透明）
#   ic_launcher_foreground         → API 26+ 自适应图标前景（108dp 满铺）
#   背景层颜色 = 插画四边平均色（写进 values/ic_launcher_background.xml，供视差动效露出）
ANDROID_RES = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')
if os.path.isdir(ANDROID_RES):
    from PIL import ImageDraw
    DENS = [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]
    def _shaped(im, circle=False, ratio=0.20):
        w, h = im.size; S = 4   # 4x 超采样：小尺寸图标的圆角/圆形边缘才不会有锯齿
        mask = Image.new('L', (w * S, h * S), 0)
        d = ImageDraw.Draw(mask)
        if circle:
            d.ellipse([0, 0, w * S - 1, h * S - 1], fill=255)
        else:
            d.rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=int(round(min(w, h) * ratio * S)), fill=255)
        out = im.copy(); out.putalpha(mask.resize((w, h), Image.LANCZOS)); return out
    _m = int(SIZE * 0.04)
    edge = np.concatenate([master[:_m, :, :].reshape(-1, 3), master[-_m:, :, :].reshape(-1, 3),
                           master[:, :_m, :].reshape(-1, 3), master[:, -_m:, :].reshape(-1, 3)])
    bgc = tuple(int(round(v)) for v in edge.mean(axis=0))
    for dpi, legacy, fg in DENS:
        d = os.path.join(ANDROID_RES, 'mipmap-' + dpi)
        if not os.path.isdir(d):
            print('  [skip] 缺少目录 mipmap-' + dpi); continue
        img_master.resize((fg, fg), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.webp'), quality=92, method=6)
        _shaped(img_master).resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.webp'), quality=92, method=6)
        _shaped(img_master, circle=True).resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.webp'), quality=92, method=6)
    print('android 图标已同步 mipmap-{mdpi..xxxhdpi}；背景层颜色建议 #%02X%02X%02X' % bgc)
else:
    print('未找到 android 工程，跳过 android 图标导出')
