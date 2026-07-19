import type { GameState } from "./simulation";

export type Facing = "down" | "up" | "left" | "right";
export type AnimationState = "idle" | "move" | "fire" | "reload" | "hurt" | "death";
export type AtlasFrame = { col: number; row: number; durationMs: number };
export type RalphyPose = {
  state: AnimationState;
  facing: Facing;
  frame: AtlasFrame;
  flipX: boolean;
  bodyRecoil: number;
  gunRecoil: number;
  gunSpin: number;
};

export const RALPHY_ATLAS = {
  cellSize: 128,
  columns: 12,
  rows: 6,
  destinationSize: 80,
  anchorX: 64,
  anchorY: 74,
} as const;

export const RALPHY_CLIPS = [
  { state: "idle", loop: true, holdLast: false },
  { state: "move", loop: true, holdLast: false },
  { state: "fire", loop: false, holdLast: false },
  { state: "reload", loop: false, holdLast: false },
  { state: "hurt", loop: false, holdLast: false },
  { state: "death", loop: false, holdLast: true },
] as const;

const clips = {
  idle: { row: 0, durations: [450, 450], loop: true },
  move: { row: 1, durations: [100, 100, 100, 100], loop: true },
  fire: { row: 2, durations: [60, 100], loop: false },
  reload: { row: 3, durations: [500, 500, 500], loop: false },
  hurt: { row: 4, durations: [180], loop: false },
  death: { row: 5, durations: [100, 100, 140, 140], loop: false },
} as const;

const directionBases: Record<Facing, number> = { down: 0, up: 4, left: 8, right: 8 };

function facingFor(state: GameState): Facing {
  const dx = state.aim.x - state.player.x;
  const dy = state.aim.y - state.player.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}

function timedFrame(ageSeconds: number, durations: readonly number[], loop: boolean, reducedMotion: boolean): number {
  if (loop && reducedMotion) return 0;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  let elapsed = Math.max(0, ageSeconds * 1000);
  if (loop) elapsed %= total;
  elapsed += Number.EPSILON * 128 * Math.max(1, elapsed, total);
  let end = 0;
  for (let index = 0; index < durations.length; index += 1) {
    end += durations[index]!;
    if (elapsed < end) return index;
  }
  return durations.length - 1;
}

function reloadProgress(state: GameState): number {
  const duration = state.reload.completesAt - state.reload.startedAt;
  if (duration <= 0) return state.time >= state.reload.completesAt ? 1 : 0;
  return Math.max(0, Math.min(1, (state.time - state.reload.startedAt) / duration));
}

function requireFinite(value: number | null, name: string): void {
  if (value !== null && !Number.isFinite(value)) throw new Error(`${name} must be finite${name === "time" ? "" : " when present"}`);
}

function isYoungerThan(time: number, timestamp: number, duration: number): boolean {
  const tolerance = Number.EPSILON * 128 * Math.max(1, Math.abs(time), Math.abs(timestamp), duration);
  return time - timestamp + tolerance < duration;
}

export function selectRalphyPose(state: GameState, reducedMotion: boolean): RalphyPose {
  requireFinite(state.time, "time");
  requireFinite(state.lastShotAt, "lastShotAt");
  requireFinite(state.lastHurtAt, "lastHurtAt");
  requireFinite(state.diedAt, "diedAt");
  if (state.reload.reloading) {
    if (!Number.isFinite(state.reload.startedAt)) throw new Error("reload.startedAt must be finite when reloading");
    if (!Number.isFinite(state.reload.completesAt)) throw new Error("reload.completesAt must be finite when reloading");
  }

  let stateName: AnimationState;
  if (state.diedAt !== null) stateName = "death";
  else if (state.lastHurtAt !== null && isYoungerThan(state.time, state.lastHurtAt, 0.18)) stateName = "hurt";
  else if (state.reload.reloading) stateName = "reload";
  else if (state.lastShotAt !== null && isYoungerThan(state.time, state.lastShotAt, 0.16)) stateName = "fire";
  else if (!state.paused && Math.hypot(state.player.vx, state.player.vy) > 0) stateName = "move";
  else stateName = "idle";

  const clip = clips[stateName];
  const progress = stateName === "reload" ? reloadProgress(state) : 0;
  const frameIndex = stateName === "reload"
    ? Math.min(clip.durations.length - 1, Math.floor(progress * clip.durations.length))
    : timedFrame(
      stateName === "fire" ? state.time - state.lastShotAt!
        : stateName === "hurt" ? state.time - state.lastHurtAt!
          : stateName === "death" ? state.time - state.diedAt!
            : state.time,
      clip.durations,
      clip.loop,
      reducedMotion,
    );
  const facing = facingFor(state);

  return {
    state: stateName,
    facing,
    frame: {
      col: (stateName === "death" ? 0 : directionBases[facing]) + frameIndex,
      row: clip.row,
      durationMs: clip.durations[frameIndex]!,
    },
    flipX: stateName === "death" ? false : facing === "right",
    bodyRecoil: reducedMotion ? 0 : stateName === "fire" && frameIndex === 0 ? 3 : 0,
    gunRecoil: reducedMotion ? 0 : stateName === "fire" ? (frameIndex === 0 ? 6 : 2) : 0,
    gunSpin: reducedMotion ? 0 : stateName === "reload" ? progress * Math.PI * 2 : 0,
  };
}

export function validateRalphyAtlas(): string[] {
  const errors: string[] = [];
  const heldClipStates = RALPHY_CLIPS.filter((clip) => clip.holdLast).map((clip) => clip.state);
  if (heldClipStates.length !== 1 || heldClipStates[0] !== "death") errors.push("death must be the sole held clip");
  if (RALPHY_CLIPS.find((clip) => clip.state === "death")?.loop) errors.push("death must not loop");
  for (const [name, clip] of Object.entries(clips)) {
    const durations: readonly number[] = clip.durations;
    if (durations.length === 0) errors.push(`${name} has no frames`);
    for (const duration of durations) {
      if (!Number.isFinite(duration) || duration <= 0) errors.push(`${name} has invalid frame duration ${duration}`);
    }
    if (clip.row < 0 || clip.row >= RALPHY_ATLAS.rows) errors.push(`${name} row ${clip.row} is out of bounds`);
    const bases = name === "death" ? [0] : Object.values(directionBases);
    for (const base of bases) {
      for (let index = 0; index < durations.length; index += 1) {
        const col = base + index;
        if (col < 0 || col >= RALPHY_ATLAS.columns) errors.push(`${name} column ${col} is out of bounds`);
      }
    }
  }
  return errors;
}
