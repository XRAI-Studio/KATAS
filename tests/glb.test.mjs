// Structural test of the committed skinned avatar (PLAN.md step 15). Parses the
// GLB directly — header + JSON chunk + BIN chunk — no loader, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RIG } from '../kata-viewer/js/rig.js';
import { JOINT_NAMES, HAND_SHAPES } from '../kata-viewer/js/poses.js';
import { rigSchemaHash } from '../kata-viewer/js/rig-schema.js';

const GLB = join(dirname(fileURLToPath(import.meta.url)), '..', 'kata-viewer', 'assets', 'karateka.glb');
const near = (a, b, eps) => Math.abs(a - b) < eps;

function parseGlb(path) {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'glTF magic');
  assert.equal(dv.getUint32(4, true), 2, 'glTF version 2');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const CTYPE = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(g, bin, idx) {
  const acc = g.accessors[idx];
  const bv = g.bufferViews[acc.bufferView];
  const [T, size] = CTYPE[acc.componentType];
  const n = NCOMP[acc.type];
  const stride = bv.byteStride || n * size;
  const base = bin.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const view = new T(bin.buffer, base + i * stride, n);
    out.push(Array.from(view));
  }
  return out;
}

// glTF node TRS -> 4x4 column-major matrix; compose down the tree.
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {   // a * b, column-major
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const { json: g, bin } = parseGlb(GLB);
const nodeByName = Object.fromEntries(g.nodes.map((n, i) => [n.name, i]));
const parentOf = {};
g.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));
const worldMatrix = (i) => { const p = parentOf[i]; const m = nodeMatrix(g.nodes[i]); return p === undefined ? m : mul(worldMatrix(p), m); };
const worldPos = (i) => worldMatrix(i).slice(12, 15);

// Rig rest positions in armature space
const rigPos = {};
for (const n of JOINT_NAMES) {
  const { parent, offset } = RIG.JOINTS[n];
  const p = parent ? rigPos[parent] : [0, 0, 0];
  rigPos[n] = [p[0] + offset.x, p[1] + offset.y, p[2] + offset.z];
}

test('every rig joint is a node exactly once, with the schema parent', () => {
  for (const n of JOINT_NAMES) {
    const ids = g.nodes.map((x, i) => x.name === n ? i : -1).filter(i => i >= 0);
    assert.equal(ids.length, 1, `${n} appears ${ids.length}×`);
    const parent = RIG.JOINTS[n].parent;
    if (parent) assert.equal(g.nodes[parentOf[ids[0]]].name, parent, `${n} parent`);
  }
  for (const side of ['L', 'R']) {
    for (const h of ['forearmTwist', 'toes']) assert.ok(nodeByName[h + side] !== undefined, h + side);
    assert.equal(g.nodes[parentOf[nodeByName['forearmTwist' + side]]].name, 'elbow' + side);
    assert.equal(g.nodes[parentOf[nodeByName['toes' + side]]].name, 'ankle' + side);
  }
});

test('joint rest positions reconstructed through the full TRS chain equal rig FK (proves the axis contract)', () => {
  for (const n of JOINT_NAMES) {
    const p = worldPos(nodeByName[n]);
    for (let k = 0; k < 3; k++) assert.ok(near(p[k], rigPos[n][k], 1e-4), `${n}[${k}] ${p[k]} vs ${rigPos[n][k]}`);
  }
  const hips = worldPos(nodeByName.hips);
  assert.ok(Math.hypot(...hips) < 1e-6, `hips at origin, got ${hips}`);
});

test('helper bones sit where the plan says', () => {
  for (const side of ['L', 'R']) {
    const e = rigPos['elbow' + side], w = rigPos['wrist' + side];
    const ft = worldPos(nodeByName['forearmTwist' + side]);
    for (let k = 0; k < 3; k++) assert.ok(near(ft[k], (e[k] + w[k]) / 2, 1e-4), `forearmTwist${side}[${k}]`);
  }
});

test('mesh nodes body/handL/handR have identity transforms and are skinned to the character skin', () => {
  assert.equal(g.skins.length, 1);
  const skin = g.skins[0];
  assert.equal(skin.joints.length, JOINT_NAMES.length + 4);
  for (const name of ['body', 'handL', 'handR']) {
    const i = nodeByName[name];
    assert.ok(i !== undefined, name);
    const n = g.nodes[i];
    assert.ok(!n.translation && !n.rotation && !n.scale && !n.matrix, `${name} identity TRS`);
    assert.equal(n.skin, 0, `${name} skinned`);
    assert.ok(n.mesh !== undefined);
  }
});

test('hand meshes carry morph targets open/spear/palm (fist is the basis)', () => {
  for (const name of ['handL', 'handR']) {
    const mesh = g.meshes[g.nodes[nodeByName[name]].mesh];
    assert.deepEqual(mesh.extras.targetNames, HAND_SHAPES.filter(s => s !== 'fist'));
    for (const prim of mesh.primitives) {
      assert.equal(prim.targets.length, 3);
      const n = g.accessors[prim.attributes.POSITION].count;
      for (const t of prim.targets) {
        assert.ok(t.POSITION !== undefined && t.NORMAL !== undefined, `${name} target has POSITION and NORMAL`);
        assert.equal(g.accessors[t.POSITION].count, n, `${name} target vertex count`);
        assert.equal(g.accessors[t.NORMAL].count, n);
        // a morph target that moves nothing is a broken export
        assert.ok(readAccessor(g, bin, t.POSITION).some(d => Math.hypot(...d) > 1e-4), `${name} target displaces vertices`);
      }
    }
  }
});

test('materials gi, belt and skin exist', () => {
  const names = g.materials.map(m => m.name);
  for (const m of ['gi', 'belt', 'skin']) assert.ok(names.includes(m), m);
});

test('skin is valid: IBMs per joint, JOINTS_0 indices in range, WEIGHTS_0 sum to 1, no unweighted vertex', () => {
  const skin = g.skins[0];
  const ibm = readAccessor(g, bin, skin.inverseBindMatrices);
  assert.equal(ibm.length, skin.joints.length);
  // Meshes have identity transforms, so restWorld(joint) * IBM must be the identity.
  skin.joints.forEach((j, i) => {
    const m = mul(worldMatrix(j), ibm[i]);
    for (let k = 0; k < 16; k++) assert.ok(near(m[k], k % 5 === 0 ? 1 : 0, 1e-4), `IBM ${g.nodes[j].name}[${k}] = ${m[k]}`);
  });
  let vertices = 0;
  for (const name of ['body', 'handL', 'handR']) {
    const mesh = g.meshes[g.nodes[nodeByName[name]].mesh];
    for (const prim of mesh.primitives) {
      assert.ok(prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined, `${name} skinned attributes`);
      const J = readAccessor(g, bin, prim.attributes.JOINTS_0);
      const W = readAccessor(g, bin, prim.attributes.WEIGHTS_0);
      assert.equal(J.length, W.length);
      for (let i = 0; i < J.length; i++) {
        const sum = W[i].reduce((a, b) => a + b, 0);
        assert.ok(near(sum, 1, 1e-3), `${name} vertex ${i} weight sum ${sum}`);
        for (let k = 0; k < 4; k++) {
          assert.ok(J[i][k] < skin.joints.length, `${name} joint index ${J[i][k]}`);
          if (W[i][k] > 0) assert.ok(J[i][k] >= 0);
        }
      }
      vertices += J.length;
    }
  }
  assert.ok(vertices > 500, `vertex count ${vertices}`);
});

test('lowest vertex (rest pose, armature space) sits at the sole: -HIPS_Y + 5 mm', () => {
  let minY = Infinity;
  for (const name of ['body', 'handL', 'handR']) {
    const mesh = g.meshes[g.nodes[nodeByName[name]].mesh];
    for (const prim of mesh.primitives) for (const p of readAccessor(g, bin, prim.attributes.POSITION)) minY = Math.min(minY, p[1]);
  }
  // hips mount at HIPS_Y; standing sole is footSoleY(rest) below the floor by RIG arithmetic:
  const soleRel = RIG.HIP.y - RIG.THIGH - RIG.SHIN - RIG.SOLE_BELOW_ANKLE;   // = -0.9775 (hips-relative)
  assert.ok(near(minY, soleRel, 0.005), `lowest vertex ${minY} vs ${soleRel}`);
});

test('rig schema hash embedded in the armature node matches the live RIG', () => {
  const arm = g.nodes.find(n => n.name === 'karateka');
  assert.ok(arm, 'armature node');
  assert.equal(arm.extras?.rigSchemaHash, rigSchemaHash());
});

test('GLB is small enough for Pages (< 2 MB)', () => {
  assert.ok(statSync(GLB).size < 2 * 1024 * 1024);
});
