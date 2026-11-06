#!/usr/bin/env python3
"""Make the small AVIF copies of the legend portraits that the pages load.

For every portraits/<slug>.png this writes:
  portraits/mini/<slug>.avif   from portraits/mini/<slug>.png (tiles, lists, history)
  portraits/large/<slug>.avif  720px on the long side (big art, e.g. the spotlight panel)
The PNGs stay as the fallback. Files already newer than their PNG are skipped.
Needs macOS (uses sips, which keeps the transparency).

Usage (from the project folder), e.g. after adding a legend with import_portraits.py:
    python3 tools/make_avif.py [--force]
"""
import argparse
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PORTRAITS = PROJECT / 'portraits'
QUALITY = '60'
LARGE_SIZE = '720'


def convert(src, dest, resize, force):
    if not src.exists():
        return 'missing'
    if not force and dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return 'skipped'
    dest.parent.mkdir(exist_ok=True)
    cmd = ['sips', '-s', 'format', 'avif', '-s', 'formatOptions', QUALITY]
    if resize:
        cmd += ['-Z', resize]
    subprocess.run(cmd + [str(src), '--out', str(dest)], check=True, capture_output=True)
    return 'made'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--force', action='store_true', help='remake every file')
    args = parser.parse_args()
    counts = {}
    for png in sorted(PORTRAITS.glob('*.png')):
        jobs = [(PORTRAITS / 'mini' / png.name, PORTRAITS / 'mini' / f'{png.stem}.avif', None),
                (png, PORTRAITS / 'large' / f'{png.stem}.avif', LARGE_SIZE)]
        for src, dest, resize in jobs:
            result = convert(src, dest, resize, args.force)
            counts[result] = counts.get(result, 0) + 1
            if result == 'missing':
                print(f'no {src.relative_to(PROJECT)}, skipped', file=sys.stderr)
    print(', '.join(f'{n} {k}' for k, n in counts.items()))


if __name__ == '__main__':
    main()
