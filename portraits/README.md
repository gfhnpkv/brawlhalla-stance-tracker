# Legend portraits (optional)

The main page (`index.html`), the stats page (`stats.html`), the history view and the phone view (`app.html`) show a portrait for each legend if you add one here.
Legend art belongs to Blue Mammoth Games / Ubisoft. The images in this folder were added by the site owner: Legend art © Blue Mammoth Games, used with permission.

1. Add your images to this folder, named after the legend in lowercase with dashes:
   `bodvar.png`, `lord-vraxx.png`, `qinghua-baobao.png`. The pages always ask for `<slug>.avif` (small copies)
   and `<slug>.png` (fallback and full-size art), so use PNG for the original and make the AVIFs (below).
2. List the file names in `index.json`, for example:
   ```json
   ["bodvar.png", "lord-vraxx.png", "qinghua-baobao.png"]
   ```

Legends without a portrait show a plain tile. Tall images (about 3:4) look best;
they are cropped from the top.

The pages load small AVIF copies, not these PNGs: `mini/<name>.avif` for tiles and lists, and
`large/<name>.avif` (720px) for big art such as the tracker's spotlight. The PNGs stay as the fallback
for browsers that can't show AVIF. Put the small icons in `mini/`, then (re)make the AVIF
copies with `python3 tools/make_avif.py` (macOS; it skips files that are already up to date).
After replacing a picture under the same name, bump `IMG_CACHE` in `sw.js` so returning visitors get it.
