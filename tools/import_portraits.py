#!/usr/bin/env python3
"""Copy legend images you already have into portraits/ with the names the site expects.

Images named by Brawlhalla legend ID (e.g. 10.png) or by legend name (e.g. "Lord Vraxx.png")
are copied to portraits/<slug>.<ext> (e.g. lord-vraxx.png) and listed in portraits/index.json.
Nothing is downloaded. Only add images you have permission to publish.

Usage (from the project folder):
    python3 tools/import_portraits.py SOURCE_FOLDER [--dry-run]

Example:
    python3 tools/import_portraits.py ../brawllhala-images/legends/full --dry-run
    python3 tools/import_portraits.py ../brawllhala-images/legends/full
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.avif'}
THUMB_SIZE = 360  # longest side of the tile backgrounds in portraits/thumbs/


def slug(name):
    """Same rule as the pages: 'Bödvar' -> 'bodvar', 'Qinghua & Baobao' -> 'qinghua-baobao'."""
    ascii_name = unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower().replace('&', ' ')).strip('-')


def load_legends():
    """Legend names and the official ID -> name map, read from legends.js."""
    src = (PROJECT / 'legends.js').read_text(encoding='utf-8')
    names = re.findall(r'"order": \d+, "name": "([^"]+)"', src)
    id_block = src[src.index('const BRAWLHALLA_ID_MAP'):]
    id_block = id_block[:id_block.index('};')]
    ids = {int(i): n for i, n in re.findall(r'(\d+): "([^"]+)"', id_block)}
    return names, ids


def make_thumbs(dest, files):
    """Small copies for the tracker's legend tiles, so the page doesn't load every full image.
    Uses macOS sips; elsewhere the tiles fall back to the full images."""
    if not shutil.which('sips'):
        print('sips not found (macOS only): skipped portraits/thumbs/. Tiles will use the full images.')
        return
    thumbs = dest / 'thumbs'
    thumbs.mkdir(exist_ok=True)
    for name in files:
        subprocess.run(['sips', '-Z', str(THUMB_SIZE), str(dest / name), '--out', str(thumbs / name)],
                       check=True, capture_output=True)
    print(f'Made {len(files)} thumbnails in portraits/thumbs/.')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', type=Path, help='folder with the images')
    ap.add_argument('--dry-run', action='store_true', help='show what would happen without copying anything')
    args = ap.parse_args()

    if not args.source.is_dir():
        sys.exit(f'Not a folder: {args.source}')
    names, ids = load_legends()
    by_slug = {slug(n): n for n in names}
    dest = PROJECT / 'portraits'

    matched, unmatched = {}, []
    for f in sorted(args.source.iterdir()):
        if f.suffix.lower() not in EXTS or not f.is_file():
            continue
        stem = f.stem
        name = ids.get(int(stem)) if stem.isdigit() else by_slug.get(slug(stem))
        if not name:
            unmatched.append(f.name)
            continue
        if name in matched:
            continue  # keep the first image found for a legend
        matched[name] = f

    print(f'Matched {len(matched)} of {len(names)} legends from {args.source}')
    if unmatched:
        print(f'Skipped {len(unmatched)} files that are not one of the 70 legends: {", ".join(unmatched[:12])}{" ..." if len(unmatched) > 12 else ""}')
    missing = [n for n in names if n not in matched]
    if missing:
        print(f'No image for: {", ".join(missing)}')

    files = []
    for name, f in matched.items():
        target = dest / f'{slug(name)}{f.suffix.lower()}'
        files.append(target.name)
        if args.dry_run:
            print(f'  would copy {f.name} -> portraits/{target.name}  ({name})')
        else:
            shutil.copy2(f, target)

    files.sort()
    if args.dry_run:
        print(f'Dry run: nothing copied. portraits/index.json would list {len(files)} images.')
        return
    (dest / 'index.json').write_text(json.dumps(files, indent=2) + '\n', encoding='utf-8')
    print(f'Copied {len(files)} images into portraits/ and wrote portraits/index.json.')
    make_thumbs(dest, files)
    print('Check them with: python3 server.py  (then open http://localhost:8000/stances.html)')
    print('Publish with:    git add portraits && git commit -m "Add portraits" && git push')


if __name__ == '__main__':
    main()
