"""Готує зображення для сайту з оригіналів у img/Works.

Для кожної роботи робить:
  img/works/<slug>-1000.webp   — сітка
  img/works/<slug>-2000.webp   — лайтбокс (лише якщо оригінал більший)
  анімовані GIF → анімований WebP

І перезаписує assets/js/data.js, зберігаючи назви й описи, які вже
відредаговані руками: технічні поля (розміри, lqip) рахуються заново,
текстові — переносяться зі старого файлу.

Запуск:  python tools/build-images.py
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "img", "Works")
# не "works": на Windows це та сама тека, що й оригінальна img/Works
OUT = os.path.join(ROOT, "img", "web")
DATA = os.path.join(ROOT, "assets", "js", "data.js")

GRID_W = 1000
FULL_W = 2000

# теки-оригінали → ідентифікатори категорій на сайті
CATEGORIES = [
    ("selected", "Основні роботи", "Selected works", "Основні роботи"),
    ("illustration", "Дизайн та ілюстрації", "Design & illustration", "Дизайн та ілюстрації"),
    ("graphite", "Графіка", "Graphite", "Графіка"),
    ("landscape", "Пейзажі", "Landscapes", "Пейзажі"),
    ("sketch", "Скетчі", "Sketches", "Скетчі"),
    ("animation", "Покадрова 2D анімація", "Frame-by-frame 2D animation", "Покадрова 2д анімація"),
]
FOLDER_TO_CAT = {c[3]: c[0] for c in CATEGORIES}

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e", "є": "ie",
    "ж": "zh", "з": "z", "и": "y", "і": "i", "ї": "i", "й": "i", "к": "k", "л": "l",
    "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ь": "",
    "ю": "iu", "я": "ia", "ы": "y", "э": "e", "ё": "e", "ъ": "",
}


def slugify(name):
    s = "".join(TRANSLIT.get(ch, ch) for ch in name.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def load_existing():
    """Читає поточний data.js, щоб не затерти відредаговані назви й описи."""
    if not os.path.exists(DATA):
        return {}
    text = open(DATA, encoding="utf-8").read()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        return {}
    try:
        blob = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        print("  ! data.js не розбирається як JSON — тексти не переносяться")
        return {}
    return {w["slug"]: w for w in blob.get("works", [])}


def lqip(im):
    """Крихітна розмита версія в data-URI — показується, поки вантажиться робота."""
    tiny = im.copy()
    tiny.thumbnail((20, 20))
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=40, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"немає теки {SRC}")
    os.makedirs(OUT, exist_ok=True)
    existing = load_existing()

    works, total_src, total_out = [], 0, 0

    for folder in sorted(os.listdir(SRC)):
        cat = FOLDER_TO_CAT.get(folder)
        if cat is None:
            print(f"  ? тека «{folder}» не описана в CATEGORIES — пропускаю")
            continue
        for fname in sorted(os.listdir(os.path.join(SRC, folder))):
            path = os.path.join(SRC, folder, fname)
            base = os.path.splitext(fname)[0]
            slug = slugify(base)
            total_src += os.path.getsize(path)

            src = Image.open(path)
            w, h = src.size
            animated = getattr(src, "n_frames", 1) > 1

            if animated:
                out_grid = os.path.join(OUT, slug + ".webp")
                src.save(out_grid, "WEBP", save_all=True, quality=72, method=4)
                full = None
            else:
                flat = src.convert("RGB")
                grid = flat.copy()
                grid.thumbnail((GRID_W, GRID_W))
                out_grid = os.path.join(OUT, f"{slug}-{GRID_W}.webp")
                grid.save(out_grid, "WEBP", quality=80, method=5)

                full = None
                if max(w, h) > GRID_W * 1.25:
                    big = flat.copy()
                    big.thumbnail((FULL_W, FULL_W))
                    full = os.path.join(OUT, f"{slug}-{FULL_W}.webp")
                    big.save(full, "WEBP", quality=82, method=5)

            total_out += os.path.getsize(out_grid) + (os.path.getsize(full) if full else 0)

            prev = existing.get(slug, {})
            works.append({
                "slug": slug,
                "cat": cat,
                "title": prev.get("title") or base,
                "titleEn": prev.get("titleEn") or base,
                "blurb": prev.get("blurb", ""),
                "blurbEn": prev.get("blurbEn", ""),
                "year": prev.get("year", ""),
                "tool": prev.get("tool", ""),
                "featured": prev.get("featured", 0),
                "w": w,
                "h": h,
                "anim": animated,
                "full": bool(full),
                "lqip": lqip(src.convert("RGB")),
            })
            print(f"  {os.path.getsize(path)//1024:>7} КБ → {slug}")

    payload = {
        "categories": [{"id": c[0], "uk": c[1], "en": c[2]} for c in CATEGORIES],
        "works": works,
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    with open(DATA, "w", encoding="utf-8") as f:
        f.write("/* Згенеровано tools/build-images.py.\n"
                "   Назви, описи, рік і featured можна правити руками —\n"
                "   повторний запуск скрипта їх збереже. */\n")
        f.write("window.SITE_DATA = " + body + ";\n")

    print(f"\n{len(works)} робіт · оригінали {total_src/1048576:.1f} МБ "
          f"→ веб {total_out/1048576:.2f} МБ")


if __name__ == "__main__":
    main()
