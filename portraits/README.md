# Legend portraits (optional)

The main page (`index.html`) and the Stance Lab (`stances.html`) show a portrait for each legend if you add one here.
Legend art belongs to Blue Mammoth Games / Ubisoft. The images in this folder were added by the site owner: Legend art © Blue Mammoth Games, used with permission.

1. Add your images to this folder, named after the legend in lowercase with dashes:
   `bodvar.png`, `lord-vraxx.png`, `queen-nai.webp`, `qinghua-baobao.jpg` (png, jpg, webp or avif).
2. List the file names in `index.json`, for example:
   ```json
   ["bodvar.png", "lord-vraxx.png", "queen-nai.webp"]
   ```

Legends without a portrait show their crest in the Stance Lab and a plain tile on the main page. Tall images (about 3:4) look best;
they are cropped from the top.

The tracker (`index.html`) shows the full image behind the selected legend and a small icon from
`mini/` (same file name) behind each legend tile, falling back to the full image. Import the icons with
`python3 tools/import_portraits.py ../brawllhala-images/legends/mini --mini`.
