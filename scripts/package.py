from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
site=root / "_site"
site.mkdir(exist_ok=True)
(site / "data").mkdir(exist_ok=True)
for name in ("index.html","styles.css","app.js","favicon.svg"):
    shutil.copyfile(root / name,site / name)
shutil.copyfile(root / "data/radar.json",site / "data/radar.json")
(site / ".nojekyll").write_text("",encoding="utf-8")

