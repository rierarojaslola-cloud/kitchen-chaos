"""
Renders review images of exported GLBs with Cycles (CPU), from the in-game camera angle.
Usage: python assets-src/blender/preview.py out.png model1.glb [model2.glb ...] [--pose Walk:0.2]
Models are laid out in a row. Optional pose: action name and normalised time.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
pose = None
if '--pose' in argv:
    i = argv.index('--pose')
    pose = argv[i + 1]
    del argv[i:i + 2]
out, models = argv[0], argv[1:]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 360 * max(1, len(models))
scene.render.resolution_y = 460
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.06, 0.08, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2

spacing = 1.0
for i, path in enumerate(models):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    x = (i - (len(models) - 1) / 2) * spacing
    for r in roots:
        r.location.x += x
    if pose:
        name, t = pose.split(':')
        for o in new:
            if o.type == 'ARMATURE' and o.animation_data:
                act = bpy.data.actions.get(name) or next((a for a in bpy.data.actions if a.name.startswith(name)), None)
                if act:
                    o.animation_data.action = act
                    if act.slots:
                        o.animation_data.action_slot = act.slots[0]
                    scene.frame_set(int(act.frame_range[0] + (act.frame_range[1] - act.frame_range[0]) * float(t)))

# floor
bpy.ops.mesh.primitive_plane_add(size=40)
floor = bpy.context.active_object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.33, 0.3, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
floor.data.materials.append(fm)

# lights: warm key + cool rim
key = bpy.data.lights.new('key', 'SUN')
key.energy = 3.2
key.angle = math.radians(8)
ko = bpy.data.objects.new('key', key)
ko.rotation_euler = (math.radians(50), math.radians(-10), math.radians(-30))
scene.collection.objects.link(ko)
rim = bpy.data.lights.new('rim', 'AREA')
rim.energy = 120
rim.size = 3
rim.color = (0.6, 0.85, 1.0)
ro = bpy.data.objects.new('rim', rim)
ro.location = (0, 4, 3)
ro.rotation_euler = (math.radians(-55), 0, math.radians(180))
scene.collection.objects.link(ro)

# camera: game pitch (41°), orthographic
cam = bpy.data.cameras.new('cam')
cam.type = 'ORTHO'
cam.ortho_scale = max(1.6, len(models) * spacing * 1.05)
co = bpy.data.objects.new('cam', cam)
pitch = math.radians(41)
target = Vector((0, 0, 0.55))
co.location = target + Vector((0, -math.cos(pitch), math.sin(pitch))) * 10
direction = target - co.location
co.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(co)
scene.camera = co

scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('preview →', out)
