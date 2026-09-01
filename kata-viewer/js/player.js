// Timeline playback engine — pure logic, no Three.js, no DOM (Node-testable).
import { composePose, JOINT_NAMES } from './poses.js';
import { eulerXYZToQuat, slerp } from './quat.js';

export const SECONDS_PER_BEAT = 1.0;
const DEFAULT_BEATS = 2;
// When a step's first keyframe coincides with the previous step's last one,
// the step-to-step walk (pose + embusen) occupies this fraction of the step.
const TRANSITION_FRACTION = 0.25;

// Kime: a technique lands sharply and is held before the next motion begins.
export const KIME_HOLD_BEATS = 0.3;
// A hold may take at most this fraction of the gap to the next keyframe.
const MAX_HOLD_FRACTION = 0.5;

// Segment curves — all monotonic on [0,1] with f(0)=0, f(1)=1 (no overshoot),
// so a sample always lies between its two keyframes.
const CURVES = {
  smooth: (u) => u * u * (3 - 2 * u),
  easeIn: (u) => u * u,
  easeOut: (u) => 1 - (1 - u) * (1 - u),
  linear: (u) => u,
  // Accelerate, peak speed near 2/3 of the way, arrive still moving: abrupt stop.
  kime: (u) => u * u * (2 - u),
};

// Curve for the segment A -> B, from whether A is a pass-through (still moving)
// and how B is arrived at.
function segmentCurve(fromMoving, toEase) {
  if (toEase === 'kime') return CURVES.kime;
  if (toEase === 'pass') return fromMoving ? CURVES.linear : CURVES.easeIn;
  return fromMoving ? CURVES.easeOut : CURVES.smooth;
}

// ---------------------------------------------------------------------------
// Keyframe resolution. An entry is
//   { time, parts: [poseName...], overrides?, root?, ease?, hold?, embusen? }
// and resolves to an internal keyframe whose pose has quaternion joints.
// ---------------------------------------------------------------------------
const HAND_OPEN = { open: 1, fist: 0 };

function resolveEntry(entry, poseLib) {
  const parts = [];
  const techniques = [];
  let passStance = false;
  for (const name of entry.parts) {
    const p = poseLib[name];
    if (!p) throw new Error(`unknown pose "${name}"`);
    parts.push(p);
    if (p.kime) techniques.push(name);
    if (p.pass) passStance = true;
  }
  if (entry.overrides) parts.push({ joints: entry.overrides });
  if (entry.root) parts.push({ root: entry.root });
  const pose = composePose(...parts);
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = eulerXYZToQuat(pose.joints[n]);
  const kf = {
    time: entry.time,
    pose: {
      root: pose.root,
      joints,
      hands: { L: HAND_OPEN[pose.hands.L], R: HAND_OPEN[pose.hands.R] },
      airborne: pose.airborne,
    },
    techniques,
    passStance,
    ease: entry.ease,
    hold: entry.hold,
  };
  if (entry.embusen) kf.embusen = entry.embusen;
  return kf;
}

// A keyframe lands with kime when it introduces a technique the previous
// keyframe did not have; pass-through stances flow; everything else is soft.
function deriveEase(kf, prev) {
  if (kf.ease) return kf.ease;
  if (kf.passStance) return 'pass';
  const before = new Set(prev ? prev.techniques : []);
  if (kf.techniques.some(n => !before.has(n))) return 'kime';
  return 'soft';
}

// Second pass over the finished list: a kime keyframe is followed by a
// hold-end keyframe with the same pose. The hold never reaches past half the
// gap to the next keyframe, and the final keyframe holds implicitly.
function insertHolds(kfs, defaultHold) {
  const out = [];
  for (let i = 0; i < kfs.length; i++) {
    const kf = kfs[i];
    out.push(kf);
    if (kf.ease !== 'kime' || i === kfs.length - 1) continue;
    const gap = kfs[i + 1].time - kf.time;
    const h = Math.min(kf.hold ?? defaultHold, gap * MAX_HOLD_FRACTION);
    if (h <= 1e-9) continue;
    out.push({ ...kf, time: kf.time + h, ease: 'soft', hold: undefined, holdEnd: true });
  }
  return out;
}

function finalize(kfs, defaultHold) {
  for (let i = 0; i < kfs.length; i++) kfs[i].ease = deriveEase(kfs[i], kfs[i - 1]);
  return insertHolds(kfs, defaultHold);
}

// Build a standalone clip (e.g. a bunkai attack) from entries in any time unit.
export function buildClip(entries, poseLib, { hold = 0 } = {}) {
  return finalize(entries.map(e => resolveEntry(e, poseLib)), hold);
}

export function buildTimeline(kata, poseLib) {
  const steps = [];
  const kfs = [];
  let cursor = 0;
  for (const step of kata.steps) {
    const dur = (step.beats ?? DEFAULT_BEATS) * SECONDS_PER_BEAT;
    const start = cursor;
    const end = cursor + dur;
    const embusen = step.embusen || { x: 0, z: 0, facing: 0 };
    steps.push({
      id: step.id, label: step.label, coachCall: step.coachCall,
      kiai: !!step.kiai, start, end,
      unverified: step.transition ? step.transition.known === false : false,
      bunkai: step.bunkai || { known: false },
      embusen,
    });
    for (const kf of step.keyframes) {
      let time = start + kf.t * dur;
      if (kfs.length && time <= kfs[kfs.length - 1].time + 1e-9) {
        time = start + TRANSITION_FRACTION * dur;
      }
      kfs.push(resolveEntry({
        time,
        parts: [kf.stance, ...(kf.arms || []), ...(kf.legs || [])].filter(Boolean),
        overrides: kf.overrides,
        root: kf.root,
        ease: kf.ease,
        hold: kf.hold !== undefined ? kf.hold * SECONDS_PER_BEAT : undefined,
        embusen,
      }, poseLib));
    }
    cursor = end;
  }
  return { duration: cursor, steps, kfs: finalize(kfs, KIME_HOLD_BEATS * SECONDS_PER_BEAT) };
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------
const lerp = (a, b, u) => a + (b - a) * u;
function lerpAngle(a, b, u) {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * u;
}

function snapshot(kf) {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = { ...kf.pose.joints[n] };
  const out = { root: { ...kf.pose.root }, joints, hands: { ...kf.pose.hands } };
  if (kf.embusen) out.embusen = { ...kf.embusen };
  return out;
}

// Pure function of time over a finalized keyframe list.
export function sampleClip(kfs, t) {
  if (t <= kfs[0].time) return snapshot(kfs[0]);
  if (t >= kfs[kfs.length - 1].time) return snapshot(kfs[kfs.length - 1]);
  // binary search: last index with kf.time <= t
  let lo = 0, hi = kfs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (kfs[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  const a = kfs[lo], b = kfs[Math.min(lo + 1, kfs.length - 1)];
  if (a.pose === b.pose) return snapshot(a);          // inside a hold
  const span = b.time - a.time;
  const u = span > 1e-9 ? segmentCurve(a.ease === 'pass', b.ease)((t - a.time) / span) : 1;
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = slerp(a.pose.joints[n], b.pose.joints[n], u);
  const root = {
    x: lerp(a.pose.root.x, b.pose.root.x, u),
    y: lerp(a.pose.root.y, b.pose.root.y, u),
    z: lerp(a.pose.root.z, b.pose.root.z, u),
    ry: lerpAngle(a.pose.root.ry, b.pose.root.ry, u),
  };
  const hands = {
    L: lerp(a.pose.hands.L, b.pose.hands.L, u),
    R: lerp(a.pose.hands.R, b.pose.hands.R, u),
  };
  const out = { root, joints, hands };
  if (a.embusen && b.embusen) {
    out.embusen = {
      x: lerp(a.embusen.x, b.embusen.x, u),
      z: lerp(a.embusen.z, b.embusen.z, u),
      facing: lerpAngle(a.embusen.facing, b.embusen.facing, u),
    };
  }
  return out;
}

export function samplePose(timeline, t) {
  return sampleClip(timeline.kfs, t);
}

export function stepAt(timeline, t) {
  const steps = timeline.steps;
  if (t <= 0) return steps[0];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (t >= steps[i].start) return steps[i];
  }
  return steps[0];
}

export class Player {
  constructor(timeline, { onStep, onKiai } = {}) {
    this.timeline = timeline;
    this.onStep = onStep || (() => {});
    this.onKiai = onKiai || (() => {});
    this._time = 0;
    this._speed = 1;
    this._playing = false;
    this._lastStepId = null;
  }

  get time() { return this._time; }
  get playing() { return this._playing; }
  get speed() { return this._speed; }

  play() {
    if (this._time >= this.timeline.duration) this._time = 0; // replay from start
    this._playing = true;
  }
  pause() { this._playing = false; }
  toggle() { this._playing ? this.pause() : this.play(); }

  setSpeed(s) { this._speed = Math.min(5, Math.max(0.1, s)); }

  seek(t) {
    this._time = Math.min(this.timeline.duration, Math.max(0, t));
    this._notifyStep(false);
  }

  seekStep(idx) {
    const steps = this.timeline.steps;
    const i = Math.min(steps.length - 1, Math.max(0, idx));
    this.seek(steps[i].start);
  }

  nextStep() {
    const cur = stepAt(this.timeline, this._time);
    const idx = this.timeline.steps.indexOf(cur);
    this.seekStep(idx + 1);
  }

  prevStep() {
    const cur = stepAt(this.timeline, this._time);
    const idx = this.timeline.steps.indexOf(cur);
    if (this._time > cur.start + 1e-6) this.seekStep(idx);
    else this.seekStep(idx - 1);
  }

  tick(dt) {
    if (this._playing) {
      this._time += dt * this._speed;
      if (this._time >= this.timeline.duration) {
        this._time = this.timeline.duration;
        this._playing = false;
      }
      if (this._time < 0) this._time = 0;
      this._notifyStep(true);
    }
    return this._time;
  }

  _notifyStep(fromPlayback) {
    const step = stepAt(this.timeline, this._time);
    if (step.id !== this._lastStepId) {
      const forward = this._lastStepId === null ||
        step.start >= (this.timeline.steps.find(s => s.id === this._lastStepId)?.start ?? -1);
      this._lastStepId = step.id;
      this.onStep(step);
      if (fromPlayback && forward && step.kiai) this.onKiai(step);
    }
  }
}
