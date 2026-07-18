// Timeline playback engine — pure logic, no Three.js, no DOM (Node-testable).
import { composePose, JOINT_NAMES } from './poses.js';

export const SECONDS_PER_BEAT = 1.0;
const DEFAULT_BEATS = 2;
// When a step's first keyframe coincides with the previous step's last one,
// the step-to-step walk (pose + embusen) occupies this fraction of the step.
const TRANSITION_FRACTION = 0.25;

function resolveKeyframePose(kf, poseLib) {
  const parts = [];
  if (kf.stance) parts.push(poseLib[kf.stance]);
  for (const a of kf.arms || []) parts.push(poseLib[a]);
  for (const l of kf.legs || []) parts.push(poseLib[l]);
  if (kf.overrides) parts.push({ joints: kf.overrides });
  if (kf.root) parts.push({ root: kf.root });
  return composePose(...parts);
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
      kfs.push({ time, pose: resolveKeyframePose(kf, poseLib), embusen });
    }
    cursor = end;
  }
  return { duration: cursor, steps, kfs };
}

const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
function lerpAngle(a, b, u) {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * u;
}

export function samplePose(timeline, t) {
  const kfs = timeline.kfs;
  if (t <= kfs[0].time) return snapshot(kfs[0]);
  if (t >= kfs[kfs.length - 1].time) return snapshot(kfs[kfs.length - 1]);
  // binary search: last index with kf.time <= t
  let lo = 0, hi = kfs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (kfs[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  const a = kfs[lo], b = kfs[Math.min(lo + 1, kfs.length - 1)];
  const span = b.time - a.time;
  const u = span > 1e-9 ? smooth((t - a.time) / span) : 1;
  const joints = {};
  for (const n of JOINT_NAMES) {
    const ja = a.pose.joints[n], jb = b.pose.joints[n];
    joints[n] = { x: lerp(ja.x, jb.x, u), y: lerp(ja.y, jb.y, u), z: lerp(ja.z, jb.z, u) };
  }
  const root = {
    x: lerp(a.pose.root.x, b.pose.root.x, u),
    y: lerp(a.pose.root.y, b.pose.root.y, u),
    z: lerp(a.pose.root.z, b.pose.root.z, u),
    ry: lerpAngle(a.pose.root.ry, b.pose.root.ry, u),
  };
  const embusen = {
    x: lerp(a.embusen.x, b.embusen.x, u),
    z: lerp(a.embusen.z, b.embusen.z, u),
    facing: lerpAngle(a.embusen.facing, b.embusen.facing, u),
  };
  return { root, joints, embusen };
}

function snapshot(kf) {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = { ...kf.pose.joints[n] };
  return { root: { ...kf.pose.root }, joints, embusen: { ...kf.embusen } };
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
