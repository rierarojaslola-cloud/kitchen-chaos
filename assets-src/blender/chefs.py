"""
Chef characters: stylised bodies with an 8-bone armature and baked animation clips.

Rigging is rigid (each body part follows one bone), the usual approach for chunky party-game
characters: no skin stretching, perfectly stable silhouettes, tiny files.

Bones (all pointing up, roll 0 → local X = world X, local Y = world Z, local Z = world -Y):
  root ─ hips ─┬ spine ─┬ head
               │        ├ arm.L / arm.R
               └ leg.L / leg.R
Clips: Idle, Walk, Carry, Chop, Repair, Celebrate, Sad (24 fps). Carry/Chop/Repair only matter for
the arms; the client overlays them on Idle/Walk.

Nodes the client relies on: "Hold" (item anchor), "Eye_L", "Eye_R" (blink), "Mouth" (sad flip),
"HeadTop" (badge height).
"""
from __future__ import annotations

import math

import bpy

from lib import (add_bevel, add_subsurf, box, cylinder, empty, join, lathe, lathe_arc, material, rad, set_parent,
                 sphere, torus)

INK = '#1d1a1a'


def shade(hex_color: str, amt: float) -> str:
    import colorsys
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(hh, max(0, min(1, ll + amt)), ss)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


class ChefBuilder:
    def __init__(self, c: dict):
        self.c = c
        self.W = c['bodyW']
        self.H = c['bodyH']
        self.hs = c['headScale']
        self.hip = 0.3
        self.torsoH = 0.46 * self.H
        self.shoulderZ = self.hip + self.torsoH * 0.82
        self.headR = 0.2 * self.hs
        self.headZ = self.hip + self.torsoH + self.headR * 0.82
        cid = c['id']
        self.m_jacket = material(f'{cid}_jacket', c['primary'], rough=0.75)
        self.m_apron = material(f'{cid}_apron', c['secondary'], rough=0.85)
        self.m_skin = material(f'{cid}_skin', c['skin'], rough=0.55)
        self.m_hair = material(f'{cid}_hair', c['hair'], rough=0.7)
        self.m_pants = material('pants', '#2c3036', rough=0.85)
        self.m_shoe = material('shoe', '#1d1a1a', rough=0.45)
        self.m_ink = material('ink', INK, rough=0.25)
        self.m_white = material('white_cloth', '#fbfaf6', rough=0.8)
        self.m_glint = material('glint', '#ffffff', rough=0.1, emissive='#ffffff', emission_strength=0.6)
        self.m_blush = material('blush', '#ff9a9a', rough=0.8)
        self.m_mouth = material('mouth', '#7a2a2a', rough=0.5)

    # ───────── armature ─────────
    def armature(self) -> bpy.types.Object:
        arm_data = bpy.data.armatures.new(f'{self.c["id"]}_rig')
        arm = bpy.data.objects.new('Rig', arm_data)
        bpy.context.collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm_data.edit_bones

        def bone(name, head, parent=None, length=0.08):
            b = eb.new(name)
            b.head = head
            b.tail = (head[0], head[1], head[2] + length)
            b.roll = 0
            if parent:
                b.parent = eb[parent]
            return b

        W = self.W
        bone('root', (0, 0, 0), length=0.05)
        bone('hips', (0, 0, self.hip), 'root')
        bone('spine', (0, 0, self.hip + 0.02), 'hips', length=self.torsoH * 0.6)
        bone('head', (0, 0, self.hip + self.torsoH - 0.02), 'spine', length=self.headR)
        bone('arm.L', (0.25 * W, 0, self.shoulderZ), 'spine', length=0.06)
        bone('arm.R', (-0.25 * W, 0, self.shoulderZ), 'spine', length=0.06)
        bone('leg.L', (0.1 * W, 0, self.hip), 'hips', length=0.06)
        bone('leg.R', (-0.1 * W, 0, self.hip), 'hips', length=0.06)
        bpy.ops.object.mode_set(mode='OBJECT')
        for pb in arm.pose.bones:
            pb.rotation_mode = 'XYZ'
        return arm

    # ───────── body parts (world space, then parented to bones) ─────────
    def leg(self, side: int):
        x = side * 0.1 * self.W
        thigh = sphere(f'thigh{side}', 0.075, (x, 0, self.hip - 0.1), self.m_pants, scale=(1, 1, 1.5), segments=16, rings=10)
        shoe = box(f'shoe{side}', (0.13, 0.21, 0.085), (x, -0.035, 0.0425), self.m_shoe, bevel=0.035, segments=3)
        sole = box(f'sole{side}', (0.135, 0.215, 0.022), (x, -0.035, 0.011), material('sole', '#e9e2d4', rough=0.6), bevel=0.008, segments=2)
        return join([thigh, shoe, sole], f'Leg_{"L" if side > 0 else "R"}')

    def body(self):
        W, H, hip, th = self.W, self.H, self.hip, self.torsoH
        prof = [(0.0, 0.0), (0.2 * W, 0.0), (0.235 * W, 0.08 * H), (0.245 * W, 0.24 * H), (0.215 * W, 0.4 * H),
                (0.13 * W, th), (0.0, th + 0.01)]
        torso = lathe('torso', prof, (0, 0, hip - 0.04), self.m_jacket, steps=28)
        add_subsurf(torso, 1)
        # apron: curved panel following the belly
        # apron: a shell that follows the torso profile (slightly larger) over the front 120°
        apron_prof = [(r * 1.04 + 0.006, z) for r, z in prof if 0.0 < z <= 0.36 * H] + [(0.25 * W * 1.04, 0.36 * H)]
        apron_prof = [(0.205 * W * 1.04, -0.02)] + sorted(set(apron_prof), key=lambda p: p[1])
        apron = lathe_arc('apron', apron_prof, (0, 0, hip - 0.04), self.m_apron, span_deg=118, thickness=0.018)
        strap = torus('strap', 0.235 * W, 0.012, (0, 0, hip + 0.26 * H), self.m_apron, major_seg=28, minor_seg=6)
        pocket = box('pocket', (0.15 * W, 0.02, 0.075), (0, -0.262 * W, hip + 0.09 * H), material(f'{self.c["id"]}_pocket', shade(self.c['secondary'], -0.1), rough=0.85), bevel=0.01)
        collar = torus('collar', 0.12 * W, 0.03, (0, 0, hip + th - 0.06), self.m_jacket, major_seg=24, minor_seg=8)
        buttons = [sphere(f'btn{i}', 0.018, (0.075 * W, -0.235 * W, hip + (0.34 + i * 0.07) * H), material('button', '#e9e2d4', rough=0.3), segments=10, rings=6) for i in range(2)]
        belly = [apron, strap, pocket, collar, *buttons]
        return join([torso, *belly], 'Body')

    def arm(self, side: int):
        x = side * 0.25 * self.W
        z = self.shoulderZ
        upper = sphere(f'upper{side}', 0.06, (x, 0, z - 0.11), self.m_jacket, scale=(1, 1, 2.0), segments=16, rings=10)
        cuff = torus(f'cuff{side}', 0.058, 0.018, (x, 0, z - 0.2), self.m_jacket, major_seg=16, minor_seg=6)
        hand = sphere(f'hand{side}', 0.064, (x, 0, z - 0.26), self.m_skin, scale=(1, 0.9, 1), segments=16, rings=10)
        thumb = sphere(f'thumb{side}', 0.025, (x - side * 0.04, -0.04, z - 0.24), self.m_skin, segments=10, rings=6)
        return join([upper, cuff, hand, thumb], f'Arm_{"L" if side > 0 else "R"}')

    def head(self):
        r, z, c = self.headR, self.headZ, self.c
        parts = []
        skull = sphere('skull', r, (0, 0, z), self.m_skin, scale=(1, 0.96, 0.95), segments=24, rings=16)
        parts.append(skull)
        covered = c['hat'] == 'hijab'
        for side in (-1, 1):
            if not covered:
                parts.append(sphere(f'ear{side}', r * 0.2, (side * r * 0.97, 0.02, z - r * 0.05), self.m_skin, scale=(0.6, 1, 1.1), segments=12, rings=8))
            brow_mat = material(f'{c["id"]}_brow', '#2a1a12', rough=0.7) if covered else self.m_hair
            brow = box(f'brow{side}', (r * 0.32, r * 0.06, r * 0.07), (side * r * 0.36, -r * 0.88, z + r * 0.33), brow_mat, bevel=r * 0.025, segments=2)
            brow.rotation_euler = (0, side * rad(10), 0)
            parts.append(brow)
            parts.append(sphere(f'blush{side}', r * 0.13, (side * r * 0.56, -r * 0.74, z - r * 0.17), self.m_blush, scale=(1, 0.35, 0.6), segments=12, rings=8))
        parts.append(sphere('nose', r * 0.13, (0, -r * 0.97, z - r * 0.05), material(f'{c["id"]}_nose', shade(c['skin'], -0.05), rough=0.5), scale=(1, 0.9, 0.85), segments=14, rings=10))
        if not covered:
            parts.extend(self.hair())
        parts.extend(self.hat())
        parts.extend(self.accessory_head())
        return join(parts, 'Head')

    def eyes(self):
        r, z = self.headR, self.headZ
        out = []
        for side, tag in ((1, 'L'), (-1, 'R')):
            eye = sphere(f'Eye_{tag}', r * 0.13, (side * r * 0.36, -r * 0.86, z + r * 0.08), self.m_ink, scale=(0.85, 0.6, 1.2), segments=14, rings=10)
            glint = sphere(f'glint{tag}', r * 0.045, (side * r * 0.36 + r * 0.03, -r * 0.93, z + r * 0.14), self.m_glint, segments=8, rings=6)
            parts = [eye, glint]
            if self.c.get('lashes'):
                for k in range(2):
                    lash = box(f'lash{tag}{k}', (r * 0.085, r * 0.03, r * 0.022), (side * r * (0.45 + k * 0.03), -r * 0.9, z + r * (0.2 - k * 0.05)), self.m_ink, bevel=r * 0.008, segments=1)
                    lash.rotation_euler = (0, side * rad(-28 - k * 18), 0)
                    parts.append(lash)
            out.append(join(parts, f'Eye_{tag}'))
        return out

    def mouth(self):
        r, z = self.headR, self.headZ
        m = torus('Mouth', r * 0.15, r * 0.035, (0, -r * 0.88, z - r * 0.32), self.m_mouth, rot=(rad(90), 0, 0), major_seg=16, minor_seg=6)
        # keep the lower half only (smile)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.mode_set(mode='EDIT')
        import bmesh
        bm = bmesh.from_edit_mesh(m.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > r * 0.02], context='VERTS')
        bmesh.update_edit_mesh(m.data)
        bpy.ops.object.mode_set(mode='OBJECT')
        return m

    def hair(self):
        r, z, st = self.headR, self.headZ, self.c['hairStyle']
        H = self.m_hair
        out = []
        cap = lambda: sphere('hairCap', r * 1.05, (0, r * 0.08, z + r * 0.3), H, scale=(1, 1, 0.72), segments=24, rings=12)
        if st == 'short':
            out.append(cap())
            out.append(sphere('fringe', r * 0.45, (r * 0.3, -r * 0.72, z + r * 0.55), H, scale=(1.3, 0.6, 0.5), segments=14, rings=8))
        elif st == 'curly':
            for i in range(13):
                a = i / 13 * 2 * math.pi
                out.append(sphere(f'curl{i}', r * 0.33, (math.cos(a) * r * 0.82, math.sin(a) * r * 0.8 + r * 0.1, z + r * 0.35 + math.sin(i * 1.7) * r * 0.08), H, segments=12, rings=8))
            out.append(sphere('curlTop', r * 0.7, (0, r * 0.1, z + r * 0.62), H, scale=(1, 1, 0.6), segments=16, rings=10))
        elif st == 'buns':
            out.append(cap())
            for side in (-1, 1):
                out.append(sphere(f'bun{side}', r * 0.37, (side * r * 0.78, r * 0.1, z + r * 0.84), H, segments=16, rings=10))
                out.append(torus(f'band{side}', r * 0.22, r * 0.05, (side * r * 0.66, r * 0.1, z + r * 0.68), material('hairband', '#ffd166', rough=0.4), rot=(0, side * rad(40), 0), major_seg=14, minor_seg=6))
        elif st == 'ponytail':
            out.append(cap())
            tail = sphere('tail', r * 0.24, (0, r * 1.05, z - r * 0.05), H, scale=(1, 1, 2.6), segments=14, rings=10)
            tail.rotation_euler = (rad(-25), 0, 0)
            out.append(tail)
        elif st == 'afro':
            # rounded volume of overlapping puffs sitting behind the hairline, face fully clear
            cx, cy, cz = 0.0, r * 0.38, z + r * 0.4
            out.append(sphere('afroCore', r * 1.05, (cx, cy + r * 0.05, cz), H, scale=(1.1, 1, 0.92), segments=20, rings=12))
            n = 0
            for ring_i, elev in enumerate((-0.35, 0.05, 0.45, 0.85)):
                count = (10, 12, 10, 6)[ring_i]
                for k in range(count):
                    a = k / count * 2 * math.pi + ring_i * 0.4
                    dx, dy, dz = math.cos(a) * math.cos(elev), math.sin(a) * math.cos(elev), math.sin(elev)
                    if dy < -0.25 and dz < 0.6:
                        continue  # nothing hangs over the face
                    out.append(sphere(f'puff{n}', r * 0.46, (cx + dx * r * 1.02, cy + dy * r * 0.9, cz + dz * r * 0.85), H, segments=12, rings=8))
                    n += 1
            # bright headband marks the hairline so the face reads clearly at TV distance
            out.append(torus('afroBand', r * 0.99, r * 0.085, (0, r * 0.02, z + r * 0.42), material(f'{self.c["id"]}_band', '#ffd166', rough=0.5), rot=(rad(-22), 0, 0), major_seg=28, minor_seg=8))
        elif st == 'braid':
            # side parting + a thick braid falling over the right shoulder to the front (visible from the camera)
            out.append(cap())
            out.append(sphere('sweep', r * 0.5, (-r * 0.35, -r * 0.62, z + r * 0.5), H, scale=(1.4, 0.6, 0.55), segments=14, rings=8))
            segs = 9
            for i in range(segs):
                t = i / (segs - 1)
                x = -r * (0.82 + 0.25 * math.sin(t * 2.2))
                y = r * (0.15 - 1.05 * t)
                zz = z - r * (0.25 + 2.0 * t)
                out.append(sphere(f'braid{i}', r * (0.2 - t * 0.05), (x + r * 0.05 * (1 if i % 2 else -1), y, zz), H, scale=(1, 0.85, 1.2), segments=12, rings=8))
            out.append(torus('braidTie', r * 0.1, r * 0.04, (-r * 0.9, -r * 0.98, z - r * 2.33), material(f'{self.c["id"]}_tie', '#ffd166', rough=0.5), major_seg=12, minor_seg=6))
            out.append(sphere('braidEnd', r * 0.12, (-r * 0.9, -r * 1.02, z - r * 2.46), H, scale=(1, 0.8, 1.4), segments=10, rings=8))
        elif st == 'long':
            out.append(cap())
            back = box('hairBack', (r * 1.8, r * 0.5, r * 1.7), (0, r * 0.62, z - r * 0.42), H, bevel=r * 0.22, segments=4)
            out.append(back)
            for side in (-1, 1):
                out.append(sphere(f'lock{side}', r * 0.3, (side * r * 0.86, -r * 0.18, z - r * 0.38), H, scale=(0.75, 0.9, 2.0), segments=14, rings=10))
        elif st == 'mohawk':
            # short buzz cut with a tall crest from forehead to crown
            buzz = material(f'{self.c["id"]}_buzz', shade(self.c['hair'], 0.08), rough=0.9)
            out.append(sphere('buzz', r * 1.03, (0, r * 0.1, z + r * 0.32), buzz, scale=(1, 1, 0.66), segments=24, rings=12))
            for i in range(7):
                t = i / 6
                spike = cylinder(f'spike{i}', r * 0.17, r * (0.42 + 0.12 * math.sin(t * math.pi)), (0, -r * 0.62 + t * r * 1.25, z + r * (0.82 + 0.18 * math.sin(t * math.pi))), H, verts=8, radius2=r * 0.03)
                spike.rotation_euler = (rad(-45 + t * 95), 0, 0)
                out.append(spike)
        return out

    def hat(self):
        r, z, c = self.headR, self.headZ, self.c
        out = []
        W = self.m_white
        hat = c['hat']
        if hat == 'toque':
            out.append(cylinder('band', r * 0.84, r * 0.36, (0, 0, z + r * 0.78), W, verts=28, bevel=r * 0.04))
            for i in range(7):
                a = i / 7 * 2 * math.pi
                out.append(sphere(f'puff{i}', r * 0.44, (math.cos(a) * r * 0.44, math.sin(a) * r * 0.44, z + r * 1.32), W, segments=14, rings=10))
            out.append(sphere('crown', r * 0.6, (0, 0, z + r * 1.5), W, segments=16, rings=10))
        elif hat == 'beret':
            col = '#27445f' if c['secondary'] == '#f2e3c6' else c['secondary']
            b = sphere('beret', r * 1.08, (r * 0.1, 0, z + r * 0.86), material(f'{c["id"]}_beret', col, rough=0.9), scale=(1.05, 1.05, 0.3), segments=24, rings=12)
            b.rotation_euler = (0, rad(14), 0)
            out.append(b)
            out.append(cylinder('stalk', r * 0.05, r * 0.15, (r * 0.18, 0, z + r * 1.18), material(f'{c["id"]}_beret', col), verts=8))
        elif hat == 'bandana':
            col = '#e2553f' if c['secondary'] == '#20242b' else c['secondary']
            m = material(f'{c["id"]}_bandana', col, rough=0.85)
            band = torus('bandana', r * 0.96, r * 0.12, (0, 0, z + r * 0.42), m, rot=(rad(-12), 0, 0), major_seg=28, minor_seg=8)
            knot = sphere('knot', r * 0.17, (0, r * 0.98, z + r * 0.32), m, segments=10, rings=8)
            tails = [box(f'btail{s}', (r * 0.14, r * 0.05, r * 0.42), (s * r * 0.1, r * 1.05, z + r * 0.1), m, bevel=r * 0.03) for s in (-1, 1)]
            for t, s in zip(tails, (-1, 1)):
                t.rotation_euler = (rad(-20), s * rad(15), 0)
            out += [band, knot, *tails]
        elif hat == 'mushroom':
            out.append(lathe('mushHat', [(0.0, 0.0), (r * 0.82, 0), (r * 1.28, r * 0.26), (r * 1.18, r * 0.62), (r * 0.62, r * 1.02), (0.0, r * 1.1)], (0, 0, z + r * 0.58), W, steps=32))
            add_subsurf(out[-1], 1)
        elif hat == 'hijab':
            import bmesh
            # headscarf colour comes from `hair` (the hair itself is hidden)
            fabric = material(f'{c["id"]}_hijab', c['hair'], rough=0.85)
            R = r * 1.1
            hood = sphere('hood', R, (0, r * 0.04, z + r * 0.04), fabric, scale=(1, 1, 1.04), segments=28, rings=18)
            bpy.context.view_layer.objects.active = hood
            bpy.ops.object.mode_set(mode='EDIT')
            bm = bmesh.from_edit_mesh(hood.data)
            # open an oval for the face: front-facing vertices below the forehead line
            face = [v for v in bm.verts if v.co.y < -R * 0.28 and v.co.z < R * 0.5 and abs(v.co.x) < R * 0.78]
            bmesh.ops.delete(bm, geom=face, context='VERTS')
            bmesh.update_edit_mesh(hood.data)
            bpy.ops.object.mode_set(mode='OBJECT')
            sol = hood.modifiers.new('Solidify', 'SOLIDIFY')
            sol.thickness = r * 0.06
            sol.offset = -1
            drape = lathe('drape', [(r * 0.68, 0.0), (r * 0.82, -r * 0.3), (r * 1.02, -r * 0.62)], (0, r * 0.05, z - r * 0.45), fabric, steps=28)
            dsol = drape.modifiers.new('Solidify', 'SOLIDIFY')
            dsol.thickness = r * 0.05
            out += [hood, drape]
        elif hat == 'cap':
            out.append(sphere('capDome', r * 1.1, (0, 0.01, z + r * 0.42), material(f'{c["id"]}_cap', c['primary'], rough=0.7), scale=(1, 1, 0.68), segments=24, rings=12))
            brim_col = '#164f4f' if c['secondary'] == '#f6efe2' else c['secondary']
            brim = cylinder('brim', r * 0.64, r * 0.06, (0, -r * 0.82, z + r * 0.5), material(f'{c["id"]}_brim', brim_col, rough=0.7), verts=24, bevel=r * 0.02)
            brim.scale = (1, 0.75, 1)
            out.append(brim)
        return out

    def accessory_head(self):
        r, z, c = self.headR, self.headZ, self.c
        acc = c['accessory']
        out = []
        if acc == 'beard':
            out.append(sphere('beard', r * 0.78, (0, -r * 0.42, z - r * 0.48), self.m_hair, scale=(1.15, 0.75, 0.9), segments=18, rings=12))
        elif acc == 'mustache':
            for s in (-1, 1):
                m = sphere(f'stache{s}', r * 0.12, (s * r * 0.2, -r * 0.96, z - r * 0.2), self.m_hair, scale=(2.4, 0.8, 0.9), segments=12, rings=8)
                m.rotation_euler = (0, s * rad(-20), 0)
                out.append(m)
        elif acc == 'glasses':
            frame = material('glasses', '#2a1d17', rough=0.3)
            for s in (-1, 1):
                out.append(torus(f'lens{s}', r * 0.21, r * 0.035, (s * r * 0.36, -r * 0.94, z + r * 0.08), frame, rot=(rad(90), 0, 0), major_seg=20, minor_seg=6))
            out.append(box('bridge', (r * 0.26, r * 0.04, r * 0.04), (0, -r * 0.98, z + r * 0.12), frame))
        elif acc == 'earring':
            out.append(torus('earring', r * 0.08, r * 0.022, (r * 1.0, 0, z - r * 0.22), material('gold', '#ffd166', rough=0.2, metal=0.9), rot=(0, rad(90), 0), major_seg=12, minor_seg=6))
        return out

    def scarf(self):
        if self.c['accessory'] != 'scarf':
            return None
        m = material('scarf', '#e2553f', rough=0.9)
        ring = torus('scarfRing', 0.15 * self.W, 0.05, (0, 0, self.hip + self.torsoH - 0.03), m, major_seg=24, minor_seg=8)
        tail = box('scarfTail', (0.07, 0.04, 0.2), (0.06, -0.15 * self.W, self.hip + self.torsoH - 0.14), m, bevel=0.015)
        return join([ring, tail], 'Scarf')

    # ───────── assembly ─────────
    def build(self) -> bpy.types.Object:
        rig = self.armature()
        set_parent(self.leg(1), rig, 'leg.L')
        set_parent(self.leg(-1), rig, 'leg.R')
        set_parent(self.body(), rig, 'spine')
        sc = self.scarf()
        if sc:
            set_parent(sc, rig, 'spine')
        set_parent(self.arm(1), rig, 'arm.L')
        set_parent(self.arm(-1), rig, 'arm.R')
        set_parent(self.head(), rig, 'head')
        for e in self.eyes():
            set_parent(e, rig, 'head')
        set_parent(self.mouth(), rig, 'head')
        hold = empty('Hold', (0, -0.42 * max(1.0, self.W * 0.9), self.hip + self.torsoH * 0.55))
        set_parent(hold, rig, 'spine')
        top = empty('HeadTop', (0, 0, self.headZ + self.headR * 1.9))
        set_parent(top, rig, 'head')
        if self.c['accessory'] == 'beard':
            bpy.data.objects['Mouth'].hide_render = True
        self.animate(rig)
        return rig

    # ───────── animation ─────────
    def animate(self, rig: bpy.types.Object) -> None:
        pb = rig.pose.bones
        rig.animation_data_create()

        def clip(name: str, length: int, keys: dict[int, dict[str, dict[str, tuple]]]):
            act = bpy.data.actions.new(name)
            act.use_fake_user = True
            rig.animation_data.action = act
            # reset pose
            for b in pb:
                b.location = (0, 0, 0)
                b.rotation_euler = (0, 0, 0)
                b.scale = (1, 1, 1)
            for frame, bones in sorted(keys.items()):
                for bname, props in bones.items():
                    b = pb[bname]
                    for prop, value in props.items():
                        setattr(b, prop, value)
                        b.keyframe_insert(prop, frame=frame)
            # every bone keyed at start/end so clips fully define the pose
            for b in pb:
                for prop in ('location', 'rotation_euler'):
                    for f in (0, length):
                        if not _has_key(act, b.name, prop, f):
                            b.keyframe_insert(prop, frame=f)
            act.frame_range = (0, length)

        def R(x=0.0, y=0.0, z=0.0):
            return {'rotation_euler': (rad(x), rad(y), rad(z))}

        def L(y=0.0):  # bone local Y == world up
            return {'location': (0, y, 0)}

        # Idle — breathing and a gentle head sway
        clip('Idle', 48, {
            0: {'hips': L(0), 'head': R(0, 3, 0), 'arm.L': R(0, 0, -4), 'arm.R': R(0, 0, 4)},
            24: {'hips': L(0.008), 'head': R(-2, -3, 0), 'arm.L': R(-3, 0, -5), 'arm.R': R(-3, 0, 5)},
            48: {'hips': L(0), 'head': R(0, 3, 0), 'arm.L': R(0, 0, -4), 'arm.R': R(0, 0, 4)},
        })
        # Walk — 16-frame cycle (0.67 s at 1×), contact poses on 0 and 8
        swing = 34
        clip('Walk', 16, {
            0: {'leg.L': R(-swing), 'leg.R': R(swing), 'arm.L': R(swing * 0.8, 0, -6), 'arm.R': R(-swing * 0.8, 0, 6), 'hips': L(0.0), 'spine': R(7, 0, -3)},
            4: {'leg.L': R(0), 'leg.R': R(0), 'arm.L': R(0, 0, -6), 'arm.R': R(0, 0, 6), 'hips': L(0.035), 'spine': R(7, 0, 0)},
            8: {'leg.L': R(swing), 'leg.R': R(-swing), 'arm.L': R(-swing * 0.8, 0, -6), 'arm.R': R(swing * 0.8, 0, 6), 'hips': L(0.0), 'spine': R(7, 0, 3)},
            12: {'leg.L': R(0), 'leg.R': R(0), 'arm.L': R(0, 0, -6), 'arm.R': R(0, 0, 6), 'hips': L(0.035), 'spine': R(7, 0, 0)},
            16: {'leg.L': R(-swing), 'leg.R': R(swing), 'arm.L': R(swing * 0.8, 0, -6), 'arm.R': R(-swing * 0.8, 0, 6), 'hips': L(0.0), 'spine': R(7, 0, -3)},
        })
        # Carry — arms forward holding a tray
        clip('Carry', 24, {
            0: {'arm.L': R(-72, 0, 14), 'arm.R': R(-72, 0, -14)},
            12: {'arm.L': R(-76, 0, 14), 'arm.R': R(-76, 0, -14)},
            24: {'arm.L': R(-72, 0, 14), 'arm.R': R(-72, 0, -14)},
        })
        # Chop — right arm chops, left arm steadies the food
        clip('Chop', 8, {
            0: {'arm.R': R(-112, 0, -10), 'arm.L': R(-55, 0, 18), 'spine': R(10)},
            4: {'arm.R': R(-55, 0, -10), 'arm.L': R(-55, 0, 18), 'spine': R(14)},
            8: {'arm.R': R(-112, 0, -10), 'arm.L': R(-55, 0, 18), 'spine': R(10)},
        })
        # Repair — fast alternating hammering
        clip('Repair', 6, {
            0: {'arm.R': R(-95, 0, -8), 'arm.L': R(-60, 0, 8), 'spine': R(16)},
            3: {'arm.R': R(-60, 0, -8), 'arm.L': R(-95, 0, 8), 'spine': R(16)},
            6: {'arm.R': R(-95, 0, -8), 'arm.L': R(-60, 0, 8), 'spine': R(16)},
        })
        # Celebrate — jumps with both arms up
        clip('Celebrate', 20, {
            0: {'hips': L(0), 'arm.L': R(-155, 0, 10), 'arm.R': R(-155, 0, -10), 'leg.L': R(0), 'leg.R': R(0), 'head': R(-10)},
            5: {'hips': L(0.14), 'arm.L': R(-170, 0, 25), 'arm.R': R(-170, 0, -25), 'leg.L': R(-25), 'leg.R': R(25), 'head': R(-15)},
            10: {'hips': L(0), 'arm.L': R(-150, 0, 5), 'arm.R': R(-150, 0, -5), 'leg.L': R(0), 'leg.R': R(0), 'head': R(-10)},
            15: {'hips': L(0.14), 'arm.L': R(-170, 0, 25), 'arm.R': R(-170, 0, -25), 'leg.L': R(25), 'leg.R': R(-25), 'head': R(-15)},
            20: {'hips': L(0), 'arm.L': R(-155, 0, 10), 'arm.R': R(-155, 0, -10), 'leg.L': R(0), 'leg.R': R(0), 'head': R(-10)},
        })
        # Sad — slumped, head down, slow sigh
        clip('Sad', 48, {
            0: {'spine': R(14), 'head': R(24, 0, 0), 'hips': L(-0.02), 'arm.L': R(4, 0, -2), 'arm.R': R(4, 0, 2)},
            24: {'spine': R(18), 'head': R(28, 0, 4), 'hips': L(-0.03), 'arm.L': R(6, 0, -2), 'arm.R': R(6, 0, 2)},
            48: {'spine': R(14), 'head': R(24, 0, 0), 'hips': L(-0.02), 'arm.L': R(4, 0, -2), 'arm.R': R(4, 0, 2)},
        })
        rig.animation_data.action = bpy.data.actions['Idle']
        for b in pb:
            b.location = (0, 0, 0)
            b.rotation_euler = (0, 0, 0)


def _has_key(act: bpy.types.Action, bone: str, prop: str, frame: int) -> bool:
    path = f'pose.bones["{bone}"].{prop}'
    for fc in _fcurves(act):
        if fc.data_path == path:
            for kp in fc.keyframe_points:
                if abs(kp.co[0] - frame) < 0.01:
                    return True
    return False


def _fcurves(act: bpy.types.Action):
    # Blender ≥4.4 layered actions; fall back to legacy `act.fcurves`
    if hasattr(act, 'layers') and len(act.layers):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    elif hasattr(act, 'fcurves'):
        yield from act.fcurves


def build_chef(c: dict) -> bpy.types.Object:
    return ChefBuilder(c).build()
