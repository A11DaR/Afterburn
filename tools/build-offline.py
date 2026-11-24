"""Build a self-contained copy of AFTERBURN from dist. Usage: python tools/build-offline.py PLAY.html"""
import argparse
import base64
import json
import re
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / "dist"
MIME = {".png": "image/png", ".ttf": "font/ttf", ".wav": "audio/wav", ".json": "application/json"}


def data_url(media_type, raw):
    return "data:" + media_type + ";base64," + base64.b64encode(raw).decode("ascii")


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Expected exactly one occurrence of " + old)
    return source.replace(old, new)


def build():
    assets = {
        path.relative_to(DIST).as_posix(): data_url(MIME[path.suffix], path.read_bytes())
        for path in sorted((DIST / "art").rglob("*")) if path.is_file()
    }
    modules = {}
    for path in sorted(DIST.glob("*.js")):
        source = path.read_text(encoding="utf-8")
        # Bare import-map entries work from an embedded module even on file://.
        source = re.sub(r"""(\bfrom\s+['"])\./""", r"\1afterburn/", source)
        if path.name == "scenery.js":
            source = replace_once(source, "img.src='art/'+path", "img.src=afterburnAsset('art/'+path)")
            source = replace_once(source, "fetch('art/palette.json')", "fetch(afterburnAsset('art/palette.json'))")
        if path.name == "audio.js":
            source = replace_once(source, "new URL(path,import.meta.url)", "afterburnAsset(path)")
        modules["afterburn/" + path.name] = data_url("text/javascript", source.encode("utf-8"))

    css = (DIST / "style.css").read_text(encoding="utf-8")
    css = replace_once(css, "art/afterburn-grid.ttf", assets["art/afterburn-grid.ttf"])
    page = (DIST / "index.html").read_text(encoding="utf-8")
    page = re.sub(r'<link rel="preload"[^>]+>\s*', "", page)
    page = replace_once(page, 'href="art/icon.png"', 'href="' + assets["art/icon.png"] + '"')
    page = replace_once(page, 'src="art/briefing.png"', 'src="' + assets["art/briefing.png"] + '"')
    page = replace_once(page, '<link rel="stylesheet" href="style.css">', "<style>" + css + "</style>")
    compact = (",", ":")
    boot = "<script>const afterburnGameAssets=" + json.dumps(assets, separators=compact) + ";\n"
    boot += "globalThis.afterburnAsset=path=>afterburnGameAssets[path.startsWith('./')?path.slice(2):path];</script>\n"
    boot += '<script type="importmap">' + json.dumps({"imports": modules}, separators=compact) + "</script>\n"
    boot += '<script type="module">import "afterburn/main.js";</script>'
    return replace_once(page, '<script type="module" src="main.js"></script>', boot)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    destination = parser.parse_args().output
    destination.write_text(build(), encoding="utf-8")
