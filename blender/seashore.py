"""Photoreal still of the seashore piece, path traced in Blender Cycles.

    blender -b -P blender/seashore.py -- --out exports/seashore-photo.png [--scale 0.5] [--samples 256] [--table marble|wood]

Real size: a 10 cm round pour, 1.26 cm thick. Built the way a real one is poured: sand
on the bottom, water colour in the layers over it, three white waves stacked at different
depths with clear resin between them, scanned shells pressed into the sand, a domed clear
coat over everything. Textures and HDRIs are CC0 from Poly Haven (blender/assets, fetched by
blender/fetch_assets.sh); shells are the Smithsonian scans in the repo's assets/scans.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import lace  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    if '--' + name not in argv:
        return default
    i = argv.index('--' + name) + 1
    if i >= len(argv) or argv[i].startswith('--'):
        sys.exit(f'--{name} needs a value')
    return argv[i]

OUT = os.path.abspath(arg('out', os.path.join(ROOT, 'exports', 'seashore-photo.png')))
SCALE = float(arg('scale', '1'))
SAMPLES = int(arg('samples', '256'))
TABLE = arg('table', 'marble')
if TABLE not in ('marble', 'wood'):
    sys.exit(f'--table must be marble or wood, got {TABLE}')
YAW = float(arg('yaw', '-20'))
ELEV = float(arg('elev', '48'))
DIST = float(arg('dist', '0.34'))
EXPOSURE = float(arg('exposure', '-1.0'))
A = os.path.join(HERE, 'assets')
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)

U = 0.03                      # one unit of the three.js piece = 3 cm
R = 1.7 * U                   # radius
H = 0.42 * U                  # resin thickness
BAY = Vector((-1.5 * U, -1.5 * U))  # centre of the bay, beyond the rim on the beach side


def sea(x, y):
    """0 on the beach, 1 out at sea (numpy or float)."""
    d = np.hypot(x - BAY.x, y - BAY.y)
    n = lace.fbm(np.asarray(x) / U * 1.4, np.asarray(y) / U * 1.4, 5, 3)
    return np.clip((d - 1.15 * U) / (2.1 * U) + 0.06 * n, 0, 1)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def sand_top(x, y):
    k = sea(x, y)
    bumps = lace.fbm(np.asarray(x) / U * 4 + 3, np.asarray(y) / U * 4, 9, 3)
    return np.maximum(0.0004, H * 0.55 * (1 - smooth(0.2, 0.46, k)) + 0.04 * U * bumps * (1 - k) + 0.0004)


# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.scale_length = 1.0


def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out


def img_node(nt, path, colour=True):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(path, check_existing=True)
    if not colour:
        n.image.colorspace_settings.name = 'Non-Color'
    return n


def mesh_from(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def grid_disc(name, radius, n, height_fn):
    """A disc as a square grid clipped to the circle, heights from height_fn."""
    xs = np.linspace(-radius, radius, n)
    X, Y = np.meshgrid(xs, xs)
    Z = height_fn(X, Y)
    idx = -np.ones((n, n), int)
    inside = np.hypot(X, Y) <= radius
    rr = np.hypot(X, Y)
    edge = inside & ~(np.roll(inside, 1, 0) & np.roll(inside, -1, 0) & np.roll(inside, 1, 1) & np.roll(inside, -1, 1))
    Xe = np.where(edge, X / np.maximum(rr, 1e-9) * radius, X)
    Ye = np.where(edge, Y / np.maximum(rr, 1e-9) * radius, Y)
    verts = []
    for j in range(n):
        for i in range(n):
            if inside[j, i]:
                idx[j, i] = len(verts)
                verts.append((Xe[j, i], Ye[j, i], Z[j, i]))
    faces = []
    for j in range(n - 1):
        for i in range(n - 1):
            q = (idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i])
            if min(q) >= 0:
                faces.append(q)
    ob = mesh_from(name, verts, faces)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---------------------------------------------------------------- resin body
def resin_body():
    e = 0.0016
    prof =[(0.0, 0.0), (R - e, 0.0)] + [((R - e) + e * math.sin(t), e - e * math.cos(t)) for t in np.linspace(0.1, math.pi / 2, 7)]
    top_e = 0.0022
    prof += [(R, H - top_e)]
    prof += [((R - top_e) + top_e * math.cos(t), (H - top_e) + top_e * math.sin(t)) for t in np.linspace(0.15, math.pi / 2, 9)]
    dome = 0.0009
    for r in np.linspace(R - top_e - 0.002, 0, 14):
        prof.append((r, H + dome * (1 - (r / R) ** 4) - 0.0002 * (r / R) ** 30))
    seg = 256
    verts, faces = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        for r, z in prof:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    P = len(prof)
    for k in range(seg):
        k2 = (k + 1) % seg
        for i in range(P - 1):
            faces.append((k * P + i, k2 * P + i, k2 * P + i + 1, k * P + i + 1))
    ob = mesh_from('resin', verts, faces)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.remove_doubles(threshold=1e-6)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in ob.data.polygons:
        p.use_smooth = True

    m, nt, out = node_mat('resin')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['IOR'].default_value = 1.54
    b.inputs['Transmission Dispersion Abbe Number'].default_value = 55.0
    b.inputs['Transmission Dispersion Scale'].default_value = 0.5
    # Cured epoxy is not a perfect mirror: a faint, uneven roughness.
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 60.0
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = 0.035
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    # Cycles blocks direct light behind glass (that path is a caustic), which leaves the
    # sand and foam inside dim and grey. Clear resin barely dims light, so shadow rays
    # pass through, lightly tinted: the standard glass-shadow fix.
    lp = nt.nodes.new('ShaderNodeLightPath')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (0.62, 0.8, 0.82, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs['Fac'])
    nt.links.new(b.outputs['BSDF'], mix.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    va = nt.nodes.new('ShaderNodeVolumeAbsorption')
    va.inputs['Color'].default_value = (0.86, 0.97, 0.95, 1)
    va.inputs['Density'].default_value = 6.0
    nt.links.new(va.outputs['Volume'], out.inputs['Volume'])
    ob.data.materials.append(m)
    return ob


# ---------------------------------------------------------------- sand and colour floor
def sand_floor():
    ob = grid_disc('sand', R * 0.985, 420, sand_top)
    # Close the sheet down to the floor: seen through the resin's wall, an open edge
    # shows the unlit underside of the sand as a dark band.
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data)
    edges = [e for e in bm.edges if e.is_boundary]
    new = bmesh.ops.extrude_edge_only(bm, edges=edges)['geom']
    for v in new:
        if isinstance(v, bmesh.types.BMVert):
            v.co.z = 0.0002
    bm.to_mesh(ob.data); bm.free()
    m, nt, out = node_mat('sand')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / 0.022, 1 / 0.022, 1 / 0.022)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    diff = img_node(nt, f'{A}/coast_sand_01_diff_4k.jpg')
    nor = img_node(nt, f'{A}/coast_sand_01_nor_gl_4k.jpg', False)
    rough = img_node(nt, f'{A}/coast_sand_01_rough_4k.jpg', False)
    for n in (diff, nor, rough):
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        n.projection = 'BOX'; n.projection_blend = 0.3  # the skirt round the edge is vertical
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 0.9
    hsv.inputs['Value'].default_value = 1.15
    nt.links.new(diff.outputs['Color'], hsv.inputs['Color'])
    warm = nt.nodes.new('ShaderNodeMix'); warm.data_type = 'RGBA'; warm.blend_type = 'MULTIPLY'
    warm.inputs['Factor'].default_value = 1.0
    warm.inputs['B'].default_value = (1.0, 0.84, 0.6, 1)
    nt.links.new(hsv.outputs['Color'], warm.inputs['A'])

    me = ob.data
    col = me.color_attributes.new('sea', 'FLOAT_COLOR', 'POINT')
    co = np.array([v.co[:] for v in me.vertices])
    k = sea(co[:, 0], co[:, 1])
    col.data.foreach_set('color', np.c_[k, k, k, np.ones_like(k)].ravel().astype(np.float32))
    attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'sea'
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    stops = [(0.30, (1, 1, 1)), (0.40, (0.70, 0.93, 0.88)), (0.48, (0.25, 0.75, 0.74)),
             (0.58, (0.05, 0.50, 0.60)), (0.70, (0.008, 0.18, 0.34)), (0.84, (0.003, 0.06, 0.17)), (1.0, (0.002, 0.03, 0.09))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p); e.color = (*c, 1)
    nt.links.new(attr.outputs['Fac'], ramp.inputs['Fac'])
    show = nt.nodes.new('ShaderNodeMapRange')
    show.inputs['From Min'].default_value = 0.33; show.inputs['From Max'].default_value = 0.6
    show.inputs['To Min'].default_value = 0.0; show.inputs['To Max'].default_value = 1.0
    nt.links.new(attr.outputs['Fac'], show.inputs['Value'])
    tint = nt.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'
    nt.links.new(show.outputs['Result'], tint.inputs['Factor'])
    nt.links.new(warm.outputs['Result'], tint.inputs['A'])
    nt.links.new(ramp.outputs['Color'], tint.inputs['B'])
    deep = nt.nodes.new('ShaderNodeMix'); deep.data_type = 'RGBA'
    nt.links.new(show.outputs['Result'], deep.inputs['Factor'])
    nt.links.new(tint.outputs['Result'], deep.inputs['A'])
    nt.links.new(ramp.outputs['Color'], deep.inputs['B'])
    wet = nt.nodes.new('ShaderNodeMapRange')
    wet.inputs['From Min'].default_value = 0.22; wet.inputs['From Max'].default_value = 0.34
    wet.inputs['To Min'].default_value = 1.0; wet.inputs['To Max'].default_value = 0.72
    nt.links.new(attr.outputs['Fac'], wet.inputs['Value'])
    dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'
    dark.inputs['Factor'].default_value = 1.0
    cmb = nt.nodes.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        nt.links.new(wet.outputs['Result'], cmb.inputs[ch])
    nt.links.new(deep.outputs['Result'], dark.inputs['A'])
    nt.links.new(cmb.outputs['Color'], dark.inputs['B'])
    nt.links.new(dark.outputs['Result'], b.inputs['Base Color'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.4
    nt.links.new(nor.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(rough.outputs['Color'], b.inputs['Roughness'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    me.materials.append(m)
    return ob


# ---------------------------------------------------------------- foam waves
def wave_sheet(name, z, front, crest, lacelen, seed, cell=1.0, size=3072):
    import hashlib
    import inspect
    across = lambda x, y: np.hypot(x - BAY.x, y - BAY.y) + 0.06 * 2.1 * U * lace.fbm(x / U * 1.4, y / U * 1.4, 5, 3)
    along = lambda x, y: np.arctan2(y - BAY.y, x - BAY.x) * 1.9 * U
    inside = lambda x, y: np.hypot(x, y) < R * 0.965
    with open(lace.__file__) as f:
        src = f.read()
    # Keyed by everything the mask depends on, so an edit never reuses a stale PNG.
    deps = (front, crest, lacelen, seed, cell, size, tuple(BAY), U, R, inspect.getsource(wave_sheet), src)
    key = hashlib.md5(repr(deps).encode()).hexdigest()[:10]
    path = os.path.join(CACHE, f'{name}_{key}.png')
    if not os.path.exists(path):
        m = lace.wave_mask(size, R, across, along, inside, front, crest, lacelen, seed, cell)
        img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
        px = np.repeat(m[::-1, :, None], 4, axis=2); px[..., 3] = 1
        img.pixels.foreach_set(px.ravel().astype(np.float32))
        img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.ops.mesh.primitive_plane_add(size=2 * R, location=(0, 0, z))
    ob = bpy.context.active_object; ob.name = name
    m, nt, out = node_mat(name)
    mask = img_node(nt, path, False)
    mask.interpolation = 'Cubic'
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (0.93, 0.97, 1.0, 1)
    b.inputs['Roughness'].default_value = 0.3
    b.inputs['Subsurface Weight'].default_value = 0.0
    b.inputs['Subsurface Radius'].default_value = (0.0006, 0.0006, 0.0006)
    sharp = nt.nodes.new('ShaderNodeMapRange')
    sharp.inputs['From Min'].default_value = 0.35; sharp.inputs['From Max'].default_value = 0.65
    nt.links.new(mask.outputs['Color'], sharp.inputs['Value'])
    nt.links.new(sharp.outputs['Result'], b.inputs['Alpha'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.00005
    nt.links.new(mask.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    ob.data.materials.append(m)
    return ob


# ---------------------------------------------------------------- scans
C = Matrix.Rotation(math.radians(90), 4, 'X')  # glTF Y-up -> Blender Z-up


def place_scan(file, size, rot3, x3, z3, yaw, sink, tint=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'scans', file + '.glb'))
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    ob = obs[0]
    for o in bpy.data.objects:
        if o not in before and o.type != 'MESH':
            bpy.data.objects.remove(o)
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    me = ob.data
    co = np.array([v.co[:] for v in me.vertices])
    co -= (co.min(0) + co.max(0)) / 2
    co *= size * U / (co.max(0) - co.min(0)).max()
    me.vertices.foreach_set('co', co.ravel())
    # The importer leaves the mesh in glTF's Y-up space and puts the Z-up turn on the
    # object (cleared above), so apply the three.js rotation first, then the turn.
    if rot3 == 'flat':
        c0 = co - co.mean(0)
        _, vecs = np.linalg.eigh(c0.T @ c0)
        n = vecs[:, 0]
        if (c0 @ n > 0).mean() > 0.5:  # most points on the + side: that's the underside
            n = -n
        M = Matrix.Rotation(yaw, 4, 'Z') @ Vector(n).rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    else:
        R3 = Euler(rot3, 'XYZ').to_matrix().to_4x4()
        M = Matrix.Rotation(yaw, 4, 'Z') @ C @ R3
    me.transform(M)
    co = np.array([v.co[:] for v in me.vertices])
    x, y = x3 * U, -z3 * U
    ob.location = (x, y, float(sand_top(x, y)) - co[:, 2].min() - sink * U)
    for p in me.polygons:
        p.use_smooth = True
    for mat in me.materials:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.5
        if tint is not None:
            link = next((l for l in nt.links if l.to_socket == bsdf.inputs['Base Color']), None)
            mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            mul.inputs['B'].default_value = (*tint, 1)
            if link:
                nt.links.new(link.from_socket, mul.inputs['A'])
            nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    return ob


# ---------------------------------------------------------------- table, light, camera
def table():
    bpy.ops.mesh.primitive_plane_add(size=1.2, location=(0, 0, 0))
    ob = bpy.context.active_object; ob.name = 'table'
    m, nt, out = node_mat('table')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    key = 'white_marble' if TABLE == 'marble' else 'wood_table_001'
    tile = 0.6 if TABLE == 'marble' else 0.45
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(25))
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    diff = img_node(nt, f'{A}/{key}_diff_4k.jpg')
    rough = img_node(nt, f'{A}/{key}_rough_4k.jpg', False)
    for n in (diff, rough):
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    nt.links.new(diff.outputs['Color'], b.inputs['Base Color'])
    if os.path.exists(f'{A}/{key}_nor_gl_4k.jpg'):  # white_marble ships without one
        nor = img_node(nt, f'{A}/{key}_nor_gl_4k.jpg', False)
        nt.links.new(mp.outputs['Vector'], nor.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.5
        nt.links.new(nor.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(rough.outputs['Color'], b.inputs['Roughness'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    ob.data.materials.append(m)
    return ob


def world():
    w = bpy.data.worlds.new('studio'); scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(f'{A}/studio_small_09_2k.hdr')
    mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(140))
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.55


def key_light():
    # A large softbox up and to the left: one long soft highlight across the dome, and
    # the light whose path through the resin makes the caustic on the table.
    ld = bpy.data.lights.new('softbox', 'AREA')
    ld.shape = 'RECTANGLE'; ld.size = 0.35; ld.size_y = 0.25
    ld.energy = 90.0
    ld.color = (1.0, 1.0, 1.0)
    try:
        ld.cycles.is_caustics_light = True
    except AttributeError:
        pass
    ob = bpy.data.objects.new('softbox', ld); scene.collection.objects.link(ob)
    ob.location = (-0.35, 0.25, 0.55)
    ob.rotation_euler = (Vector((0, 0, 0.0)) - ob.location).to_track_quat('-Z', 'Y').to_euler()
    return ob


def camera(focus):
    cd = bpy.data.cameras.new('cam')
    cd.lens = 100.0; cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0
    cd.dof.use_dof = True; cd.dof.aperture_fstop = 9.0
    ob = bpy.data.objects.new('cam', cd); scene.collection.objects.link(ob)
    yaw, el = math.radians(YAW - 90), math.radians(ELEV)
    target = Vector((0.0, 0.004, 0.004))
    ob.location = target + Vector((math.cos(el) * math.cos(yaw), math.cos(el) * math.sin(yaw), math.sin(el))) * DIST
    ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()
    cd.dof.focus_distance = (Vector(focus) - ob.location).length
    scene.camera = ob
    return ob


# ---------------------------------------------------------------- build
body = resin_body()
sand = sand_floor()
waves = [
    wave_sheet('wave1', H * 0.74, front=0.0715, crest=0.0048, lacelen=0.017, seed=12, cell=0.9),
    wave_sheet('wave2', H * 0.52, front=0.0865, crest=0.0032, lacelen=0.014, seed=31, cell=1.05),
    wave_sheet('wave3', H * 0.32, front=0.0995, crest=0.0018, lacelen=0.012, seed=47, cell=1.2),
]
flat_up = (-math.pi / 2, 0, 0)
scans = [
    place_scan('mimachlamys-senatoria-crassicostata-5dbe459a', 0.62, flat_up, -0.42, 0.92, 0.7, 0.06),
    place_scan('mimachlamys-asperrima-407a5ff5', 0.40, flat_up, -1.2, 0.18, -2.1, 0.04),
    place_scan('conus-textile-c29a9ede', 0.46, (0, 0, 0), -1.05, 0.72, 0.9, 0.06),
    place_scan('oliva-porphyria-f6b58975', 0.32, (0, 0, math.pi / 2), 0.08, 1.02, -0.6, 0.05),
    place_scan('linckia-laevigata-aff2c3e5', 0.86, 'flat', -0.5, 0.36, 0.5, 0.02, tint=(2.2, 1.15, 0.6)),
]
tbl = table()
world()
key_light()
star = scans[-1]
camera(star.location)

for o, caster, receiver in [(body, True, False), (tbl, False, True), (sand, False, True)]:
    for attr, val in (('is_caustics_caster', caster), ('is_caustics_receiver', receiver)):
        if hasattr(o, attr):
            setattr(o, attr, val)
        elif hasattr(o, 'cycles') and hasattr(o.cycles, attr):
            setattr(o.cycles, attr, val)

# ---------------------------------------------------------------- render
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
cy = scene.cycles
cy.device = 'GPU'
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.01
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
try:
    cy.denoising_use_gpu = True
except AttributeError:
    pass
cy.max_bounces = 24
cy.transmission_bounces = 24
cy.transparent_max_bounces = 24
cy.glossy_bounces = 8
cy.volume_bounces = 2
cy.caustics_refractive = True
cy.caustics_reflective = True
cy.blur_glossy = 0.5
scene.render.resolution_x = 1080
scene.render.resolution_y = 1350
scene.render.resolution_percentage = int(100 * SCALE)
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except TypeError:
    pass
scene.view_settings.exposure = EXPOSURE
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
if '--save' in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, 'seashore.blend'))
bpy.ops.render.render(write_still=True)
print('wrote', OUT)
