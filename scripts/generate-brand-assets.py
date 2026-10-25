"""
Génère les ressources de marque Android à partir du logo officiel.

Usage : python3 scripts/generate-brand-assets.py assets/openplay-logo-original.png assets/brand
Nécessite Pillow et NumPy. Les zones de découpe (RBOX, LBOX) correspondent au visuel fourni.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert('RGB')
A = np.asarray(im).astype(float)

def mean_border(box, w=6):
    x0, y0, x1, y1 = box
    r = A[y0:y1, x0:x1]
    b = np.concatenate([r[:w].reshape(-1, 3), r[-w:].reshape(-1, 3), r[:, :w].reshape(-1, 3), r[:, -w:].reshape(-1, 3)])
    return tuple(int(round(v)) for v in b.mean(axis=0))

def feathered(box, feather):
    """Découpe avec bords fondus (alpha) pour se raccorder sans couture au fond uni."""
    crop = im.crop(box).convert('RGBA')
    w, h = crop.size
    m = Image.new('L', (w, h), 0)
    # fondu elliptique : suit la forme ronde du pictogramme, sans contour carré
    ImageDraw.Draw(m).ellipse((feather, feather, w - 1 - feather, h - 1 - feather), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(feather / 2))
    crop.putalpha(m)
    return crop

def local_bg(box):
    """Couleur réelle du fond autour du pictogramme : médiane des pixels clairs et peu saturés de la zone."""
    r = A[box[1]:box[3], box[0]:box[2]].reshape(-1, 3)
    lum = r.mean(axis=1)
    near = r[lum >= np.percentile(lum, 70)]
    return tuple(int(round(v)) for v in np.median(near, axis=0))

def symbol_mask(box, bg, thr=12):
    """Silhouette nette : écart au fond, débruitée, petites taches supprimées."""
    r = A[box[1]:box[3], box[0]:box[2]]
    d = np.abs(r - np.array(bg)).max(axis=2)
    m = Image.fromarray(((d > thr) * 255).astype('uint8')).filter(ImageFilter.MedianFilter(5))
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    # ouverture plus forte : supprime les petites taches d'ombre isolées
    m = m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    return np.asarray(m) > 127

def hexc(c):
    return '#%02X%02X%02X' % c

# --- Pictogramme de droite (icône) ---
RBOX = (1004, 398, 1346, 740)            # zone intérieure de la tuile, pictogramme + marge
tile_bg = local_bg(RBOX)
rsym = feathered(RBOX, 22)
rmask = symbol_mask(RBOX, tile_bg)
ys, xs = np.where(rmask)
cx = (xs.min() + xs.max()) / 2; cy = (ys.min() + ys.max()) / 2
symw = xs.max() - xs.min() + 1; symh = ys.max() - ys.min() + 1

N = 1024
SAFE_R = N * 33 / 108                    # zone sûre des icônes adaptatives : cercle de 66 dp sur 108 dp

def place(target_w, canvas_bg, crop, mask, ccx, ccy):
    s = target_w / symw
    cw, ch = crop.size
    c2 = crop.resize((round(cw * s), round(ch * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (N, N), canvas_bg)
    ox = round(N / 2 - ccx * s); oy = round(N / 2 - ccy * s)
    canvas.alpha_composite(c2, (ox, oy))
    m2 = Image.fromarray((mask * 255).astype('uint8')).resize(c2.size, Image.LANCZOS)
    mfull = Image.new('L', (N, N), 0); mfull.paste(m2, (ox, oy))
    return canvas, mfull

# plus grande taille qui tient dans le cercle sûr (marge 3 %)
target = 0.70 * N
while True:
    fg, fmask = place(target, tile_bg + (255,), rsym, rmask, cx, cy)
    m = np.asarray(fmask) > 128
    yy, xx = np.where(m)
    rmax = np.sqrt((xx - N / 2) ** 2 + (yy - N / 2) ** 2).max()
    if rmax <= SAFE_R * 0.97: break
    target -= 4
print('icône : largeur pictogramme', round(target), 'px sur', N, '; rayon max', round(rmax), '/ zone sûre', round(SAFE_R), '; fond', hexc(tile_bg))
fg.convert('RGB').save(f'{OUT}/android-icon-foreground.png')
Image.new('RGB', (N, N), tile_bg).save(f'{OUT}/android-icon-background.png')
# icône générique (anciens lanceurs, web) : tuile arrondie + pictogramme, coins transparents
tile = Image.new('RGBA', (N, N), (0, 0, 0, 0))
rm = Image.new('L', (N * 4, N * 4), 0); ImageDraw.Draw(rm).rounded_rectangle((0, 0, N * 4 - 1, N * 4 - 1), radius=int(N * 4 * 0.225), fill=255)
rm = rm.resize((N, N), Image.LANCZOS)
icon_fg, _ = place(0.74 * N, tile_bg + (255,), rsym, rmask, cx, cy)
tile.paste(icon_fg, (0, 0), rm)
tile.save(f'{OUT}/icon.png')
tile.resize((48, 48), Image.LANCZOS).save(f'{OUT}/favicon.png')

# --- Logo principal (gauche) : écran de démarrage et présentation ---
LBOX = (222, 112, 838, 704)
page_bg = local_bg(LBOX)
lsym = feathered(LBOX, 30)
lmask = symbol_mask(LBOX, page_bg)
ys, xs = np.where(lmask)
lcx = (xs.min() + xs.max()) / 2; lcy = (ys.min() + ys.max()) / 2
symw = xs.max() - xs.min() + 1
# écran de démarrage : disque du fond d'origine, pictogramme dans les 2/3 centraux (zone non rognée par Android 12+)
splash, _ = place(0.56 * N, (0, 0, 0, 0), lsym, lmask, lcx, lcy)
disc = Image.new('L', (N * 4, N * 4), 0); ImageDraw.Draw(disc).ellipse((0, 0, N * 4 - 1, N * 4 - 1), fill=255)
disc = disc.resize((N, N), Image.LANCZOS)
base = Image.new('RGBA', (N, N), (0, 0, 0, 0)); base.paste(Image.new('RGBA', (N, N), page_bg + (255,)), (0, 0), disc)
base.alpha_composite(splash)
base.save(f'{OUT}/splash-icon.png')
# logo complet avec le nom, pour les écrans de présentation
full = im.crop((140, 135, 912, 878))
full.save(f'{OUT}/openplay-logo-full.png')
print('démarrage : fond', hexc(page_bg), '; logo complet', full.size)
