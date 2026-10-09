"""Add an inline data-URI favicon to both entry documents (no extra request)."""
from pathlib import Path

ICON = (
    '<link rel="icon" href="data:image/svg+xml,'
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Crect width='32' height='32' rx='7' fill='%230066FF'/%3E"
    "%3Ccircle cx='16' cy='16' r='6.5' fill='none' stroke='white' stroke-width='2'/%3E"
    "%3Ccircle cx='16' cy='16' r='2' fill='white'/%3E%3C/svg%3E\" />"
)

for name in ("index.html", "demo/index.html"):
    path = Path(name)
    text = path.read_text(encoding="utf-8")
    if 'rel="icon"' in text:
        print("already patched", name)
        continue
    text = text.replace("</title>", "</title>\n    " + ICON, 1)
    path.write_text(text, encoding="utf-8")
    print("patched", name)
