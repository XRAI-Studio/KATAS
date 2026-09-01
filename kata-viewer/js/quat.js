// Pure quaternion helpers on plain {x, y, z, w} objects. No Three.js, no DOM
// (Node-importable). Conventions match THREE: Euler angles are intrinsic 'XYZ'
// in radians, which is what avatar.js applies via Object3D.rotation.

export function eulerXYZToQuat(e) {
  const x = e.x || 0, y = e.y || 0, z = e.z || 0;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

// Spherical linear interpolation along the shortest arc.
export function slerp(a, b, t) {
  if (t <= 0) return { x: a.x, y: a.y, z: a.z, w: a.w };
  if (t >= 1) return { x: b.x, y: b.y, z: b.z, w: b.w };
  if (a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w) return { x: a.x, y: a.y, z: a.z, w: a.w };
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let wa, wb;
  if (cos > 1 - 1e-10) {
    wa = 1 - t; wb = t;                       // nearly parallel: lerp
  } else {
    const theta = Math.acos(cos), sin = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sin;
    wb = Math.sin(t * theta) / sin;
  }
  const x = a.x * wa + bx * wb, y = a.y * wa + by * wb, z = a.z * wa + bz * wb, w = a.w * wa + bw * wb;
  const n = 1 / Math.hypot(x, y, z, w);
  return { x: x * n, y: y * n, z: z * n, w: w * n };
}

// Inverse of eulerXYZToQuat (principal range). Debug/inspection aid.
export function quatToEulerXYZ(q) {
  const { x, y, z, w } = q;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.min(1, Math.max(-1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return { x: Math.atan2(-m23, m33), y: ey, z: Math.atan2(-m12, m11) };
  }
  return { x: Math.atan2(m32, m22), y: ey, z: 0 };
}
