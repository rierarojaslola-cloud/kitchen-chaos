"""
Builds every GLB asset of the game.

Usage (from the repo root):
  python assets-src/blender/build_all.py [chefs] [stations] [--only id1,id2]
  blender -b -P assets-src/blender/build_all.py -- [chefs] [stations]

Requires the `bpy` module (pip install bpy, Python 3.11+) or the Blender binary (5.x).
Output: assets-src/blender/out/*.glb (raw) → `node scripts/optimize-models.mjs` → apps/web/public/models
(committed, so deploying the game never needs Blender).
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
# Raw exports; scripts/optimize-models.mjs compresses them into apps/web/public/models
OUT = os.path.join(HERE, 'out')

import bpy  # noqa: E402

from lib import clear_material_cache, export_glb, reset_scene  # noqa: E402


def args() -> list[str]:
    argv = sys.argv
    return argv[argv.index('--') + 1:] if '--' in argv else argv[1:]


def main() -> None:
    a = args()
    only = None
    if '--only' in a:
        only = set(a[a.index('--only') + 1].split(','))
    targets = [x for x in a if x in ('chefs', 'stations')] or ['chefs', 'stations']
    report: dict[str, int] = {}

    if 'chefs' in targets:
        from chefs import build_chef
        with open(os.path.join(HERE, 'data', 'characters.json'), encoding='utf-8') as f:
            chars = json.load(f)
        for c in chars:
            if only and c['id'] not in only:
                continue
            print(f'chef {c["id"]}')
            reset_scene()
            clear_material_cache()
            build_chef(c)
            report[f'chef-{c["id"]}'] = export_glb(os.path.join(OUT, f'chef-{c["id"]}.glb'), animations=True)

    if 'stations' in targets:
        from stations import STATIONS
        for sid, builder in STATIONS.items():
            if only and sid not in only:
                continue
            print(f'station {sid}')
            reset_scene()
            clear_material_cache()
            builder()
            report[f'station-{sid}'] = export_glb(os.path.join(OUT, f'station-{sid}.glb'))

    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    for k, tris in report.items():
        manifest[k] = {'file': f'{k}.glb', 'tris': tris, 'blender': bpy.app.version_string}
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(manifest.items())), f, indent=2)
    print(f'done: {len(report)} assets')


main()
