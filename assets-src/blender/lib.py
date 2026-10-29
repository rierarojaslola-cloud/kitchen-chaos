"""
Shared helpers for the Kitchen Chaos Blender asset pipeline.

Runs both as `python build_all.py` with the `bpy` module (pip install bpy) and inside the Blender
binary (`blender -b -P build_all.py -- ...`).

Conventions (match the Three.js client):
  * 1 Blender unit = 1 game unit = 1 kitchen tile.
  * Blender is Z-up; the glTF exporter converts to Y-up. A model that faces Blender -Y faces +Z in
    the game (towards the camera / the walkable side of a station).
  * Origin at floor level, centred on the tile.
  * Material names starting with "Theme_" are placeholders that the client swaps for the current
    restaurant's materials (counter body, top, trim).
  * Named nodes ("Knife", "Basket", "Anchor"…) are looked up by the client to animate parts.
"""
from __future__ import annotations

import math
import os
from typing import Iterable, Sequence

import bpy
from mathutils import Matrix, Vector

# ───────────────────────── scene ─────────────────────────


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.armatures, bpy.data.objects):
        for block in list(coll):
            coll.remove(block)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.unit_settings.system = 'METRIC'


def hex_to_linear(hex_color: str) -> tuple[float, float, float, float]:
    h = hex_color.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(srgb[0]), lin(srgb[1]), lin(srgb[2]), 1.0)


_mat_cache: dict[str, bpy.types.Material] = {}


def material(name: str, color: str, rough: float = 0.6, metal: float = 0.0,
             emissive: str | None = None, emission_strength: float = 1.0, alpha: float = 1.0) -> bpy.types.Material:
    key = f'{name}'
    if key in _mat_cache and _mat_cache[key].name in bpy.data.materials:
        return _mat_cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_to_linear(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emissive:
        bsdf.inputs['Emission Color'].default_value = hex_to_linear(emissive)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.diffuse_color = hex_to_linear(color)
    m.use_backface_culling = True  # exported as single-sided (cheaper, correct for closed meshes)
    _mat_cache[key] = m
    return m


def clear_material_cache() -> None:
    _mat_cache.clear()


# ───────────────────────── objects ─────────────────────────


def _finish(obj: bpy.types.Object, name: str, mat: bpy.types.Material | None, smooth: bool) -> bpy.types.Object:
    obj.name = name
    obj.data.name = name
    if mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if smooth:
        obj.data.shade_smooth()
    return obj


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 3, harden: bool = True) -> None:
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40)
    mod.harden_normals = harden
    obj.data.shade_smooth()


def add_subsurf(obj: bpy.types.Object, levels: int = 1) -> None:
    mod = obj.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    obj.data.shade_smooth()


def box(name: str, size: Sequence[float], loc: Sequence[float], mat=None, bevel: float = 0.0,
        segments: int = 3, rot: Sequence[float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _finish(obj, name, mat, False)
    if bevel > 0:
        add_bevel(obj, bevel, segments)
    return obj


def cylinder(name: str, radius: float, depth: float, loc: Sequence[float], mat=None, verts: int = 32,
             bevel: float = 0.0, rot: Sequence[float] = (0, 0, 0), radius2: float | None = None,
             fill: str = 'NGON') -> bpy.types.Object:
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot, end_fill_type=fill)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=radius2, depth=depth, location=loc, rotation=rot, end_fill_type=fill)
    obj = bpy.context.active_object
    _finish(obj, name, mat, False)
    if bevel > 0:
        add_bevel(obj, bevel, 3)
    else:
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(40))
    return obj


def sphere(name: str, radius: float, loc: Sequence[float], mat=None, scale: Sequence[float] = (1, 1, 1),
           segments: int = 24, rings: int = 14, subsurf: int = 0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _finish(obj, name, mat, True)
    if subsurf:
        add_subsurf(obj, subsurf)
    return obj


def torus(name: str, major: float, minor: float, loc: Sequence[float], mat=None, rot: Sequence[float] = (0, 0, 0),
          major_seg: int = 32, minor_seg: int = 10) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_seg,
                                     minor_segments=minor_seg, location=loc, rotation=rot)
    obj = bpy.context.active_object
    return _finish(obj, name, mat, True)


def lathe(name: str, profile: Sequence[tuple[float, float]], loc: Sequence[float], mat=None, steps: int = 32,
          smooth: bool = True) -> bpy.types.Object:
    """Revolve a (radius, height) profile around Z."""
    verts = []
    faces = []
    n = len(profile)
    for s in range(steps):
        a = 2 * math.pi * s / steps
        for r, z in profile:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for s in range(steps):
        s2 = (s + 1) % steps
        for i in range(n - 1):
            faces.append((s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    # merge duplicate pole vertices (radius 0)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    if mat is not None:
        mesh.materials.append(mat)
    if smooth:
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(50))
    return obj


def lathe_arc(name: str, profile: Sequence[tuple[float, float]], loc: Sequence[float], mat=None,
              center_deg: float = -90, span_deg: float = 120, steps: int = 16, thickness: float = 0.02) -> bpy.types.Object:
    """Open revolved shell (e.g. an apron wrapping a body) centred on `center_deg` (−90 = front, −Y)."""
    n = len(profile)
    verts, faces = [], []
    for s in range(steps + 1):
        a = math.radians(center_deg - span_deg / 2 + span_deg * s / steps)
        for r, z in profile:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for s in range(steps):
        for i in range(n - 1):
            faces.append((s * n + i, (s + 1) * n + i, (s + 1) * n + i + 1, s * n + i + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    if mat is not None:
        mesh.materials.append(mat)
    sol = obj.modifiers.new('Solidify', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = 1.0
    obj.modifiers.new('Subsurf', 'SUBSURF').levels = 1
    mesh.shade_smooth()
    return obj


def empty(name: str, loc: Sequence[float], parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.05
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    if parent is not None:
        set_parent(obj, parent)
    return obj


def set_parent(child: bpy.types.Object, parent: bpy.types.Object, bone: str | None = None) -> None:
    """Parent keeping the world transform (also for bone parenting)."""
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    if bone:
        child.parent_type = 'BONE'
        child.parent_bone = bone
    child.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    child.matrix_world = mw


def join(objs: Iterable[bpy.types.Object], name: str) -> bpy.types.Object:
    """Apply modifiers and join meshes (keeps materials per face)."""
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.select_all(action='DESELECT')
    return obj


def group(name: str, objs: Iterable[bpy.types.Object], loc: Sequence[float] = (0, 0, 0),
          parent: bpy.types.Object | None = None) -> bpy.types.Object:
    """Empty pivot with children (an animatable node in the glTF)."""
    e = empty(name, loc, parent)
    for o in objs:
        set_parent(o, e)
    return e


# ───────────────────────── export ─────────────────────────


def triangle_count(objs: Iterable[bpy.types.Object] | None = None) -> int:
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs or bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        ev.to_mesh_clear()
    return total


def export_glb(path: str, animations: bool = False) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tris = triangle_count()
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=animations,
    )
    if animations:
        kwargs.update(export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
                      export_optimize_animation_size=True)
    bpy.ops.export_scene.gltf(**kwargs)
    size = os.path.getsize(path)
    print(f'  → {os.path.basename(path)}: {tris} tris, {size / 1024:.0f} KB')
    return tris


def rad(deg: float) -> float:
    return math.radians(deg)


V = Vector
