"""Build kata-viewer/assets/karateka.glb from tools/rig.json with Blender 4.5 (headless).

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" -b -noaudio -P tools/build-avatar.py

Use tools/build-avatar.ps1, which runs dump-rig -> this -> the GLB structural test.

Contract (PLAN.md steps 10-11):
- Rig space is Y-up, +Z forward, left = +X. Blender is Z-up; the glTF exporter (Y-up) maps
  Blender (x, y, z) -> glTF (x, z, -y), so a rig point (X, Y, Z) is placed at Blender (X, -Z, Y)
  and the GLB comes out in rig space with no runtime transform.
- Armature: exactly the 17 rig bone names at the rig joint positions, hips at the origin, plus
  deform-only helpers forearmTwistL/R (child of elbow, sibling of wrist) and toesL/R.
- Meshes: `body`, `handL`, `handR` with identity transforms, vertices in armature space, every
  vertex in exactly one vertex group (weight 1). Hands are a fist (basis) with shape keys
  open / spear / palm. Materials named gi, belt, skin (+ dark, trim).
- Armature object custom property rigSchemaHash = rig.json schemaHash (exported as node extras).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RIG = json.load(open(os.path.join(HERE, 'rig.json'), encoding='utf8'))
OUT = os.path.join(ROOT, 'kata-viewer', 'assets', 'karateka.glb')

J = RIG['joints']
FOOT, SEG, HAND = RIG['foot'], RIG['footSeg'], RIG['hand']
SHAPES = RIG['handShapes']          # ['fist', 'open', 'spear', 'palm']


def B(v):
    """rig (X, Y, Z) -> Blender (X, -Z, Y)"""
    return Vector((v[0], -v[2], v[1]))


def V(x, y, z):
    return Vector((x, y, z))


def add(a, b):
    return Vector((a[0] + b[0], a[1] + b[1], a[2] + b[2]))


# Rest positions of every joint in rig/armature space (hips at origin).
POS = {}
for name in J:
    p, cur = Vector((0, 0, 0)), name
    while cur:
        o = J[cur]['offset']
        p += Vector((o['x'], o['y'], o['z']))
        cur = J[cur]['parent']
    POS[name] = p


# ---------------------------------------------------------------------------
# Geometry builders (rig space). Each returns (verts, faces, smooth) where faces
# index into verts and smooth is a per-face flag.
# ---------------------------------------------------------------------------
def box(center, size, rot=Matrix.Identity(3)):
    cx, cy, cz = center
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    corners = [V(-sx, -sy, -sz), V(sx, -sy, -sz), V(sx, sy, -sz), V(-sx, sy, -sz),
               V(-sx, -sy, sz), V(sx, -sy, sz), V(sx, sy, sz), V(-sx, sy, sz)]
    verts = [Vector(center) + rot @ c for c in corners]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return verts, faces, [False] * 6


def cyl(p0, p1, r0, r1, n=14):
    """Tapered cylinder from p0 (radius r0) to p1 (radius r1), capped."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    ref = V(1, 0, 0) if abs(axis.x) < 0.9 else V(0, 0, 1)
    u = axis.cross(ref).normalized()
    w = axis.cross(u)
    verts, faces, smooth = [], [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        d = u * math.cos(a) + w * math.sin(a)
        verts.append(p0 + d * r0)
        verts.append(p1 + d * r1)
    for i in range(n):
        j = (i + 1) % n
        faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
        smooth.append(True)
    faces.append(tuple(2 * i for i in reversed(range(n))))
    faces.append(tuple(2 * i + 1 for i in range(n)))
    smooth += [False, False]
    return verts, faces, smooth


def sphere(center, r, seg=16, rings=10, top_only=False, squash=1.0):
    center = Vector(center)
    verts, faces, smooth = [], [], []
    r1 = rings if not top_only else rings // 2 + 1      # top_only: the upper cap (phi 0..~pi/2)
    for j in range(0, r1 + 1):
        phi = math.pi * j / rings
        for i in range(seg):
            th = 2 * math.pi * i / seg
            verts.append(center + V(r * math.sin(phi) * math.cos(th), r * math.cos(phi) * squash, r * math.sin(phi) * math.sin(th)))
    nrows = r1 + 1
    for j in range(nrows - 1):
        for i in range(seg):
            a = j * seg + i
            b = j * seg + (i + 1) % seg
            faces.append((a, b, b + seg, a + seg))
            smooth.append(True)
    return verts, faces, smooth


# ---------------------------------------------------------------------------
# Hands: same topology for every shape so they can be shape keys.
# Hand frame at the wrist: fingers along -y, thumb +z, palm normal medial (-sx*x),
# back of the hand outward (+sx*x). (Same convention as avatar.js.)
# ---------------------------------------------------------------------------
def hand_boxes(shape, sx):
    """List of (center, size, rot) boxes: palm, 4 fingers, thumb — in that order."""
    thick, w, length = HAND['thick'], HAND['w'], HAND['len']
    boxes = []
    if shape == 'fist':
        flen, fthick = 0.085, thick + 0.03
        boxes.append((V(0, -flen / 2, 0), (fthick, flen, w), Matrix.Identity(3)))
        for i in range(4):
            z = -w / 2 + w / 8 + i * (w / 4)
            boxes.append((V(sx * (fthick / 2 - 0.006), -flen - 0.004, z), (0.024, 0.024, w / 4 - 0.005), Matrix.Identity(3)))
        boxes.append((V(-sx * 0.012, -flen + 0.03, w / 2 + 0.006), (0.022, 0.045, 0.024), Matrix.Identity(3)))
        return boxes
    gap = {'open': 0.004, 'spear': 0.0, 'palm': 0.003}[shape]
    palm_len = length - 0.075
    boxes.append((V(0, -palm_len / 2, 0), (thick, palm_len, w), Matrix.Identity(3)))
    fw = (w - gap * 3) / 4
    tilt = Matrix.Rotation(-0.35, 3, 'X') if shape == 'palm' else Matrix.Identity(3)
    for i in range(4):
        z = -w / 2 + fw / 2 + i * (fw + gap)
        c = V(0, -0.0375, z)                       # finger centre, relative to the knuckle line
        boxes.append((V(0, -palm_len, 0) + tilt @ c, (thick * 0.85, 0.075, fw), tilt))
    thumb_out = shape == 'open'
    trot = Matrix.Rotation(-0.5, 3, 'X') if thumb_out else Matrix.Identity(3)
    boxes.append((V(-sx * (0 if thumb_out else 0.008), -0.045, w / 2 + (0.012 if thumb_out else 0.004)), (0.02, 0.05, 0.02), trot))
    if shape == 'palm':
        # quarter turn about the forearm, then quarter bend about x: palm heel faces the
        # strike (-y), fingers point up (+z when the arm is out)
        R = Matrix.Rotation(-math.pi / 2, 3, 'X') @ Matrix.Rotation(-sx * math.pi / 2, 3, 'Y')
        boxes = [(R @ c, s, R @ r) for (c, s, r) in boxes]
    return boxes


def hand_verts(shape, sx, origin):
    verts, faces, smooth = [], [], []
    for (c, s, r) in hand_boxes(shape, sx):
        v, f, sm = box(Vector(origin) + c, s, r)
        base = len(verts)
        verts += v
        faces += [tuple(i + base for i in face) for face in f]
        smooth += sm
    return verts, faces, smooth


# ---------------------------------------------------------------------------
# Scene assembly
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, rgb, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    return m


class MeshBuilder:
    """Accumulates parts into one mesh with per-part vertex group + material."""

    def __init__(self, name, materials):
        self.name = name
        self.materials = materials
        self.verts, self.faces, self.smooth = [], [], []
        self.groups = {}          # group name -> [vertex indices]
        self.mat_index = []       # per face

    def part(self, geom, group, material):
        v, f, sm = geom
        base = len(self.verts)
        self.verts += [B(p) for p in v]             # rig -> Blender
        self.faces += [tuple(i + base for i in face) for face in f]
        self.smooth += sm
        self.mat_index += [list(self.materials).index(material)] * len(f)
        self.groups.setdefault(group, []).extend(range(base, base + len(v)))

    def build(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        for m in self.materials.values():
            mesh.materials.append(m)
        for poly, sm, mi in zip(mesh.polygons, self.smooth, self.mat_index):
            poly.use_smooth = sm
            poly.material_index = mi
        mesh.validate()
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for g, idx in self.groups.items():
            obj.vertex_groups.new(name=g).add(idx, 1.0, 'REPLACE')
        return obj


def build_armature(schema_hash):
    arm = bpy.data.armatures.new('karateka')
    arm_obj = bpy.data.objects.new('karateka', arm)
    arm_obj['rigSchemaHash'] = schema_hash
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head, b.tail = B(head), B(tail)
        if parent:
            b.parent = eb[parent]
        b.use_deform = True
        return b

    # Torso chain points up the spine; hanging limbs point down them (tail = child joint).
    child_of = {'hips': 'spine', 'spine': 'chest', 'chest': 'neck', 'neck': 'head'}
    for side in ('L', 'R'):
        child_of.update({'shoulder' + side: 'elbow' + side, 'elbow' + side: 'wrist' + side,
                         'hip' + side: 'knee' + side, 'knee' + side: 'ankle' + side})
    tail_dir = {'head': V(0, 0.22, 0)}
    for side in ('L', 'R'):
        tail_dir['wrist' + side] = V(0, -HAND['len'] * 0.5, 0)
        tail_dir['ankle' + side] = V(0, -RIG['soleBelowAnkle'], 0)
    for name in J:                       # rig.json preserves parent-before-child order
        head = POS[name]
        tail = POS[child_of[name]] if name in child_of else head + tail_dir[name]
        bone(name, head, tail, J[name]['parent'])
    for side in ('L', 'R'):
        e, w, a = POS['elbow' + side], POS['wrist' + side], POS['ankle' + side]
        bone('forearmTwist' + side, e + (w - e) * 0.5, w, 'elbow' + side)
        toe0 = a + V(0, FOOT['y'], FOOT['z'] + FOOT['l'] / 2 - SEG['toe'])
        bone('toes' + side, toe0, toe0 + V(0, 0, SEG['toe']), 'ankle' + side)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


def build_body(mats):
    mb = MeshBuilder('body', mats)
    P = POS
    # torso
    mb.part(box(P['hips'] + V(0, 0.02, 0), (0.32, 0.18, 0.20)), 'hips', 'gi')
    mb.part(cyl(P['spine'] + V(0, -0.02, 0), P['chest'] + V(0, 0.02, 0), 0.15, 0.16), 'spine', 'gi')
    mb.part(box(P['chest'] + V(0, 0.12, 0), (0.36, 0.34, 0.22)), 'chest', 'gi')
    mb.part(box(P['chest'] + V(0, -0.06, 0), (0.34, 0.07, 0.23)), 'chest', 'belt')
    mb.part(box(P['chest'] + V(0, -0.06, 0.13), (0.09, 0.06, 0.05)), 'chest', 'belt')
    for s in (-1, 1):
        mb.part(box(P['chest'] + V(s * 0.06, 0.14, 0.113), (0.025, 0.30, 0.01), Matrix.Rotation(-s * 0.32, 3, 'Z')), 'chest', 'trim')
    # neck + head
    mb.part(cyl(P['neck'] + V(0, -0.02, 0), P['neck'] + V(0, 0.05, 0), 0.045, 0.045, 12), 'neck', 'skin')
    mb.part(sphere(P['head'] + V(0, 0.10, 0), 0.115), 'head', 'skin')
    mb.part(sphere(P['head'] + V(0, 0.105, -0.012), 0.12, top_only=True), 'head', 'dark')
    mb.part(box(P['head'] + V(0, 0.085, 0.12), (0.03, 0.03, 0.03)), 'head', 'skin')       # nose
    for s in (-1, 1):
        mb.part(box(P['head'] + V(s * 0.04, 0.12, 0.105), (0.024, 0.02, 0.012)), 'head', 'dark')   # eye
        mb.part(box(P['head'] + V(s * 0.042, 0.145, 0.102), (0.04, 0.008, 0.008)), 'head', 'dark')  # brow
    # arms
    for side in ('L', 'R'):
        sh, el, wr = P['shoulder' + side], P['elbow' + side], P['wrist' + side]
        mb.part(sphere(sh, 0.07, 12, 8), 'shoulder' + side, 'gi')
        mb.part(cyl(sh, el, 0.062, 0.052), 'shoulder' + side, 'gi')
        mb.part(sphere(el, 0.048, 12, 8), 'elbow' + side, 'skin')
        mid = el + (wr - el) * 0.5
        mb.part(cyl(el, mid, 0.046, 0.04), 'elbow' + side, 'skin')
        mb.part(cyl(mid, wr, 0.04, 0.032), 'forearmTwist' + side, 'skin')      # distal forearm follows the half twist
        mb.part(sphere(wr, 0.03, 10, 6), 'wrist' + side, 'skin')
    # legs
    for side in ('L', 'R'):
        hp, kn, an = P['hip' + side], P['knee' + side], P['ankle' + side]
        mb.part(cyl(hp, kn, 0.082, 0.066), 'hip' + side, 'gi')
        mb.part(sphere(kn, 0.066, 12, 8), 'knee' + side, 'gi')
        mb.part(cyl(kn, an, 0.064, 0.05), 'knee' + side, 'gi')
        mb.part(sphere(an, 0.035, 10, 6), 'ankle' + side, 'skin')
        z = FOOT['z'] - FOOT['l'] / 2
        for seg in ('heel', 'ball', 'toe'):
            ln = SEG[seg]
            h = FOOT['h'] * (0.7 if seg == 'toe' else 1.0)
            w = FOOT['w'] * (0.85 if seg == 'heel' else 1.0)
            y = FOOT['y'] - FOOT['h'] / 2 + h / 2
            mb.part(box(an + V(0, y, z + ln / 2), (w, h, ln - 0.004)), ('toes' if seg == 'toe' else 'ankle') + side, 'skin')
            z += ln
    return mb.build()


def build_hand(side, mats):
    sx = 1 if side == 'L' else -1
    origin = POS['wrist' + side]
    mb = MeshBuilder('hand' + side, mats)
    mb.part(hand_verts('fist', sx, origin), 'wrist' + side, 'skin')
    obj = mb.build()
    obj.shape_key_add(name='Basis', from_mix=False)
    for shape in SHAPES:
        if shape == 'fist':
            continue
        key = obj.shape_key_add(name=shape, from_mix=False)
        v, _, _ = hand_verts(shape, sx, origin)
        assert len(v) == len(obj.data.vertices), shape
        for i, p in enumerate(v):
            key.data[i].co = B(p)
    return obj


def main():
    clear_scene()
    mats = {
        'gi': make_material('gi', (0.93, 0.90, 0.84)),
        'belt': make_material('belt', (0.05, 0.05, 0.05), 0.8),
        'skin': make_material('skin', (0.62, 0.40, 0.24), 0.7),
        'dark': make_material('dark', (0.06, 0.04, 0.03)),
        'trim': make_material('trim', (0.82, 0.78, 0.70)),
    }
    arm_obj = build_armature(RIG['schemaHash'])
    for obj in (build_body(mats), build_hand('L', mats), build_hand('R', mats)):
        obj.parent = arm_obj
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm_obj
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', export_yup=True,
        export_skins=True, export_morph=True, export_morph_normal=False, export_morph_tangent=False,
        export_animations=False, export_extras=True, export_apply=True,
        export_texcoords=False, export_normals=True, export_materials='EXPORT',
        export_def_bones=False, export_rest_position_armature=True,
    )
    print('wrote', OUT, os.path.getsize(OUT), 'bytes; schema', RIG['schemaHash'])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
