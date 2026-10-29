"""
Kitchen stations (1×1 tile, front = -Y in Blender = +Z in game).

Material placeholders swapped by the client per restaurant:
  Theme_Body (cabinet body), Theme_Top (worktop), Theme_Trim (kick plate / dark details)
Animated nodes / materials looked up by the client:
  board: Knife · grill: mat Heat · fryer: Basket, mat Oil · pot: Water (mat Water), mat BlueFlame
  oven: mat Fire · wok: Pan, Flames (mat WokFlame) · serve: Bell, mat Lamp · trash: Lid
  crate: Fill (where the client places sample food), Sign (crate label position)
Every station has empties "Anchor" (held-item position) and "Top" (overhead indicator height).
"""
from __future__ import annotations

import math

from lib import (add_bevel, add_subsurf, box, cylinder, empty, group, join, lathe, material, rad, sphere,
                 torus)

TOP = 0.92  # worktop surface height


def mats():
    return dict(
        body=material('Theme_Body', '#c8382b', rough=0.55),
        top=material('Theme_Top', '#d6dadd', rough=0.4, metal=0.3),
        trim=material('Theme_Trim', '#2a2d33', rough=0.7),
        steel=material('steel', '#c3cbd1', rough=0.28, metal=0.9),
        dark_steel=material('dark_steel', '#3a3f45', rough=0.4, metal=0.7),
        black=material('black_iron', '#1d1f22', rough=0.45, metal=0.6),
        handle=material('handle', '#d5dbe0', rough=0.25, metal=0.95),
        wood=material('wood', '#c58a4f', rough=0.7),
        dark_wood=material('dark_wood', '#7a5030', rough=0.8),
        knob=material('knob', '#1b1b1e', rough=0.4),
    )


def markers(anchor_z: float = TOP, top_z: float = 1.25, anchor_y: float = 0.0) -> None:
    empty('Anchor', (0, anchor_y, anchor_z))
    empty('Top', (0, 0, top_z))


def cabinet(m, body=None, with_top=True, doors=True, top_mat=None):
    """Kitchen base unit: body, framed doors with handles, recessed kick plate, overhanging worktop."""
    body = body or m['body']
    parts = [
        box('cab', (0.94, 0.86, 0.78), (0, 0.02, 0.47), body, bevel=0.03),
        box('kick', (0.88, 0.8, 0.08), (0, 0.04, 0.04), m['trim'], bevel=0.01, segments=2),
    ]
    if doors:
        for x in (-0.225, 0.225):
            parts.append(box(f'door{x}', (0.41, 0.03, 0.66), (x, -0.41, 0.48), body, bevel=0.018, segments=2))
            parts.append(box(f'panel{x}', (0.31, 0.012, 0.52), (x, -0.425, 0.48), body, bevel=0.012, segments=2))
            hx = x + (0.13 if x < 0 else -0.13)
            parts.append(cylinder(f'handle{x}', 0.011, 0.2, (hx, -0.455, 0.66), m['handle'], verts=10, rot=(0, 0, 0)))
            for dz in (-0.1, 0.1):
                parts.append(cylinder(f'post{x}{dz}', 0.009, 0.03, (hx, -0.44, 0.66 + dz), m['handle'], verts=8, rot=(rad(90), 0, 0)))
    if with_top:
        parts.append(box('worktop', (1.0, 0.98, 0.07), (0, 0.0, 0.885), top_mat or m['top'], bevel=0.02))
    return parts


# ───────────────────────── stations ─────────────────────────

def counter():
    m = mats()
    join(cabinet(m), 'Counter')
    markers()


def board():
    m = mats()
    parts = cabinet(m)
    b = box('board', (0.7, 0.5, 0.05), (0, 0.0, TOP + 0.025), m['wood'], bevel=0.018)
    groove = box('groove', (0.62, 0.012, 0.004), (0, -0.2, TOP + 0.051), m['dark_wood'])
    parts += [b, groove]
    join(parts, 'Board')
    blade = box('blade', (0.3, 0.07, 0.012), (0.0, 0, 0), material('blade', '#e3e9ed', rough=0.12, metal=1.0), bevel=0.004, segments=2)
    handle = box('kh', (0.13, 0.04, 0.032), (-0.21, 0, 0), m['knob'], bevel=0.012)
    rivets = [cylinder(f'rv{i}', 0.006, 0.036, (-0.24 + i * 0.05, 0, 0), m['handle'], verts=8) for i in range(2)]
    knife = join([blade, handle, *rivets], 'KnifeMesh')
    k = group('Knife', [knife], (0, 0, 0))
    k.location = (0.2, -0.17, TOP + 0.065)
    k.rotation_euler = (0, 0, rad(-23))
    markers(TOP + 0.05)


def grill():
    m = mats()
    parts = cabinet(m, body=m['dark_steel'], with_top=False)
    parts.append(box('rim', (1.0, 0.98, 0.07), (0, 0, 0.885), m['steel'], bevel=0.02))
    parts.append(box('plate', (0.82, 0.74, 0.04), (0, 0.02, TOP + 0.01), m['black'], bevel=0.012))
    heat = material('Heat', '#2a1410', rough=0.5, emissive='#ff5a1f', emission_strength=1.0)
    for i in range(6):
        parts.append(box(f'ridge{i}', (0.76, 0.034, 0.016), (0, -0.26 + i * 0.105, TOP + 0.035), heat, bevel=0.006, segments=2))
    parts.append(box('tray', (0.6, 0.08, 0.04), (0, -0.48, TOP - 0.06), m['steel'], bevel=0.01))
    for x in (-0.2, 0.2):
        parts.append(cylinder(f'knob{x}', 0.045, 0.05, (x, -0.47, 0.72), m['knob'], verts=16, rot=(rad(90), 0, 0), bevel=0.01))
        parts.append(box(f'tick{x}', (0.01, 0.012, 0.035), (x, -0.5, 0.74), m['handle']))
    join(parts, 'Grill')
    markers(TOP + 0.045)


def fryer():
    m = mats()
    parts = cabinet(m, body=material('fryer_body', '#8e979e', rough=0.35, metal=0.6), with_top=False)
    parts.append(box('rim', (1.0, 0.98, 0.07), (0, 0, 0.885), m['steel'], bevel=0.02))
    parts.append(box('well', (0.72, 0.64, 0.06), (0, 0.02, TOP - 0.01), m['black'], bevel=0.015))
    parts.append(box('panel', (0.5, 0.02, 0.12), (0, -0.44, 0.72), m['black'], bevel=0.01))
    parts.append(box('lamp', (0.05, 0.015, 0.05), (0.18, -0.455, 0.72), material('pilot', '#ffb020', emissive='#ffb020', emission_strength=3), bevel=0.01))
    join(parts, 'Fryer')
    oil = box('Oil', (0.64, 0.56, 0.01), (0, 0.02, TOP + 0.01), material('Oil', '#d99a1e', rough=0.12, emissive='#ff9b1f', emission_strength=0.15))
    oil.name = 'Oil'
    wire = material('wire', '#d5dbe0', rough=0.3, metal=0.9)
    bars = [box('brim', (0.48, 0.42, 0.02), (0, 0.02, TOP + 0.1), wire, bevel=0.008)]
    for i in range(7):
        bars.append(box(f'bx{i}', (0.012, 0.4, 0.012), (-0.21 + i * 0.07, 0.02, TOP + 0.03), wire))
    for i in range(4):
        bars.append(box(f'bz{i}', (0.46, 0.01, 0.07), (0, -0.17 + i * 0.12, TOP + 0.065), wire))
    bars.append(box('bh', (0.04, 0.42, 0.03), (0, -0.36, TOP + 0.16), m['knob'], bevel=0.012))
    bars[-1].rotation_euler = (rad(25), 0, 0)
    group('Basket', [join(bars, 'BasketMesh')], (0, 0, 0))
    markers(TOP - 0.06)


def pot():
    m = mats()
    parts = cabinet(m)
    parts.append(torus('burner', 0.22, 0.03, (0, 0, TOP + 0.02), m['black'], major_seg=28, minor_seg=8))
    flame = torus('flame', 0.17, 0.02, (0, 0, TOP + 0.035), material('BlueFlame', '#10203f', emissive='#3c8dff', emission_strength=1.0), major_seg=28, minor_seg=6)
    body = lathe('potBody', [(0.0, 0.0), (0.24, 0.0), (0.265, 0.02), (0.27, 0.3), (0.29, 0.315), (0.28, 0.33), (0.255, 0.31), (0.25, 0.04), (0.0, 0.035)],
                 (0, 0, TOP + 0.04), m['steel'], steps=36)
    handles = [torus(f'ph{s}', 0.055, 0.016, (s * 0.3, 0, TOP + 0.3), m['knob'], rot=(rad(90), 0, 0), major_seg=14, minor_seg=6) for s in (-1, 1)]
    join(parts + [flame, body, *handles], 'Pot')
    water = cylinder('Water', 0.248, 0.02, (0, 0, TOP + 0.28), material('Water', '#8fc4d6', rough=0.08), verts=32)
    water.name = 'Water'
    markers(TOP + 0.22, 1.45)


def oven():
    m = mats()
    brick = material('brick', '#8c4b2f', rough=0.85)
    mortar = material('mortar', '#5e3220', rough=0.95)
    parts = [box('base', (0.96, 0.94, 0.84), (0, 0.01, 0.42), brick, bevel=0.03)]
    for row in range(5):
        parts.append(box(f'mortar{row}', (0.965, 0.945, 0.012), (0, 0.01, 0.12 + row * 0.16), mortar))
    for row in range(5):
        off = 0.12 if row % 2 else -0.12
        for x in (-0.36 + off, off, 0.36 + off):
            if abs(x) < 0.47:
                parts.append(box(f'vj{row}{x}', (0.012, 0.012, 0.15), (x, -0.475, 0.04 + row * 0.16 + 0.08), mortar))
    parts.append(box('ledge', (1.0, 0.98, 0.07), (0, 0, 0.885), m['top'], bevel=0.02))
    dome = lathe('dome', [(0.0, 0.0), (0.47, 0.0), (0.46, 0.14), (0.4, 0.3), (0.28, 0.42), (0.12, 0.48), (0.0, 0.49)], (0, 0.06, TOP), material('dome', '#d9c6a8', rough=0.9), steps=36)
    add_subsurf(dome, 1)
    chimney = cylinder('chimney', 0.08, 0.34, (0, 0.18, TOP + 0.55), brick, verts=16, radius2=0.07)
    cap = cylinder('ccap', 0.11, 0.04, (0, 0.18, TOP + 0.73), mortar, verts=16, bevel=0.01)
    arch = torus('arch', 0.22, 0.05, (0, -0.415, TOP), brick, rot=(rad(90), 0, 0), major_seg=24, minor_seg=8)
    parts += [dome, chimney, cap, arch]
    # keep only the upper half of the arch ring
    import bmesh
    import bpy
    bpy.context.view_layer.objects.active = arch
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(arch.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.03], context='VERTS')  # local Y = world up
    bmesh.update_edit_mesh(arch.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    mouth = cylinder('mouth', 0.21, 0.02, (0, -0.432, TOP), material('Fire', '#2b0d05', rough=1.0, emissive='#ff7a1a', emission_strength=0.6), verts=24, rot=(rad(90), 0, 0), fill='TRIFAN')
    bpy.context.view_layer.objects.active = mouth
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mouth.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.001], context='VERTS')  # keep the upper half
    bmesh.update_edit_mesh(mouth.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    logs = []
    for i in range(3):
        lg = cylinder(f'log{i}', 0.032, 0.24, (-0.33 + i * 0.03, -0.5, 0.06 + i * 0.055), material('log', '#5a3420', rough=0.9), verts=10, rot=(0, rad(90), rad(i * 25)))
        logs.append(lg)
    join(parts + [mouth, *logs], 'Oven')
    markers(TOP + 0.03, 1.75, anchor_y=-0.24)


def wok():
    m = mats()
    parts = cabinet(m, body=material('wok_body', '#2b2f35', rough=0.5), with_top=False)
    parts.append(box('rim', (1.0, 0.98, 0.07), (0, 0, 0.885), material('wok_top', '#4a5058', rough=0.4, metal=0.7), bevel=0.02))
    parts.append(torus('ring', 0.24, 0.035, (0, 0, TOP + 0.02), m['black'], major_seg=28, minor_seg=8))
    join(parts, 'WokBase')
    fl = material('WokFlame', '#10203f', emissive='#2f7dff', emission_strength=1.0)
    cones = []
    for i in range(10):
        a = i / 10 * 2 * math.pi
        cones.append(cylinder(f'f{i}', 0.035, 0.13, (math.cos(a) * 0.16, math.sin(a) * 0.16, TOP + 0.08), fl, verts=8, radius2=0.0))
    group('Flames', [join(cones, 'FlamesMesh')], (0, 0, 0))
    pan = lathe('wokPan', [(0.0, 0.0), (0.12, 0.005), (0.26, 0.07), (0.33, 0.14), (0.32, 0.148), (0.25, 0.08), (0.12, 0.018), (0.0, 0.015)], (0, 0, TOP + 0.06), m['black'], steps=36)
    handle = cylinder('wh', 0.022, 0.34, (0.48, -0.06, TOP + 0.19), material('wok_handle', '#5a3a24', rough=0.6), verts=12, rot=(0, rad(90 - 14), 0))
    group('Pan', [join([pan, handle], 'PanMesh')], (0, 0, 0))
    markers(TOP + 0.1, 1.45)


def serve():
    m = mats()
    parts = cabinet(m, body=m['trim'])
    parts.append(box('stripe', (0.96, 0.02, 0.08), (0, -0.44, 0.62), material('stripe', '#ffc23d', rough=0.4), bevel=0.008))
    for x in (-0.44, 0.44):
        parts.append(cylinder(f'post{x}', 0.025, 0.74, (x, 0.38, TOP + 0.37), m['steel'], verts=12))
    parts.append(box('gantry', (0.98, 0.2, 0.07), (0, 0.3, TOP + 0.72), m['steel'], bevel=0.02))
    parts.append(box('ticketRail', (0.9, 0.03, 0.04), (0, 0.19, TOP + 0.66), m['dark_steel'], bevel=0.008))
    lamp = box('lamp', (0.86, 0.12, 0.025), (0, 0.3, TOP + 0.68), material('Lamp', '#5a1c0a', emissive='#ff6a2a', emission_strength=1.6), bevel=0.008)
    join(parts + [lamp], 'Serve')
    gold = material('brass', '#e2b34a', rough=0.2, metal=0.95)
    dome = lathe('bell', [(0.0, 0.0), (0.08, 0.0), (0.075, 0.03), (0.05, 0.06), (0.015, 0.075), (0.0, 0.08)], (0, 0, 0), gold, steps=24)
    base = cylinder('bellBase', 0.09, 0.012, (0, 0, 0.006), material('bell_base', '#3a2a22', rough=0.6), verts=24)
    knob = sphere('bellKnob', 0.016, (0, 0, 0.09), gold, segments=10, rings=6)
    g = group('Bell', [join([dome, base, knob], 'BellMesh')], (0, 0, 0))
    g.location = (0.36, -0.32, TOP)
    markers(TOP, 1.9)


def trash():
    m = mats()
    bin_ = lathe('bin', [(0.0, 0.0), (0.3, 0.0), (0.31, 0.02), (0.34, 0.75), (0.35, 0.78), (0.0, 0.78)], (0, 0, 0), m['steel'], steps=36)
    band = torus('band', 0.335, 0.02, (0, 0, 0.4), m['dark_steel'], major_seg=36, minor_seg=6)
    pedal = box('pedal', (0.16, 0.12, 0.03), (0, -0.35, 0.06), m['knob'], bevel=0.01)
    join([bin_, band, pedal], 'Bin')
    lid_mesh = lathe('binLid', [(0.0, 0.0), (0.37, 0.0), (0.36, 0.04), (0.2, 0.09), (0.0, 0.1)], (0, 0, 0.79), m['steel'], steps=36)
    hinge = cylinder('hinge', 0.02, 0.2, (0, 0.33, 0.8), m['dark_steel'], verts=10, rot=(0, rad(90), 0))
    lid = join([lid_mesh, hinge], 'LidMesh')
    g = group('Lid', [], (0, 0.33, 0.79))
    from lib import set_parent
    set_parent(lid, g)
    markers(0.85, 1.25)


def crate():
    m = mats()
    parts = [box('base', (0.96, 0.92, 0.6), (0, 0.0, 0.3), m['body'], bevel=0.03),
             box('baseKick', (0.9, 0.86, 0.06), (0, 0.02, 0.03), m['trim'], bevel=0.01)]
    plank = material('plank', '#b9824d', rough=0.8)
    dark = m['dark_wood']
    parts.append(box('crBottom', (0.9, 0.86, 0.05), (0, 0, 0.625), dark, bevel=0.01))
    for i in range(3):
        z = 0.68 + i * 0.1
        parts.append(box(f'sF{i}', (0.9, 0.04, 0.075), (0, -0.42, z), plank, bevel=0.012, segments=2))
        parts.append(box(f'sB{i}', (0.9, 0.04, 0.075), (0, 0.42, z), plank, bevel=0.012, segments=2))
        parts.append(box(f'sL{i}', (0.04, 0.86, 0.075), (-0.44, 0, z), plank, bevel=0.012, segments=2))
        parts.append(box(f'sR{i}', (0.04, 0.86, 0.075), (0.44, 0, z), plank, bevel=0.012, segments=2))
    for x in (-0.44, 0.44):
        for y in (-0.42, 0.42):
            parts.append(box(f'corner{x}{y}', (0.06, 0.06, 0.32), (x, y, 0.79), dark, bevel=0.01))
    join(parts, 'Crate')
    empty('Fill', (0, 0, 0.66))
    empty('Sign', (0, -0.47, 0.38))
    markers(0.95, 1.35)


STATIONS = {
    'counter': counter,
    'board': board,
    'grill': grill,
    'fryer': fryer,
    'pot': pot,
    'oven': oven,
    'wok': wok,
    'serve': serve,
    'trash': trash,
    'crate': crate,
}
