import { expect, test } from "bun:test";
import { createGame } from "./simulation";
import { RALPHY_CLIPS, selectRalphyPose, validateRalphyAtlas } from "./presentation";

const at = (time: number) => {
  const state = createGame(() => 0);
  return { ...state, time, aim: { x: state.player.x, y: state.player.y + 1 } };
};

test.each([[0, 0], [0.449, 0], [0.45, 1], [0.9, 0]] as const)(
  "idle frame at %fs",
  (time, col) => expect(selectRalphyPose(at(time), false).frame).toMatchObject({ row: 0, col }),
);

test.each([[0, 0], [0.1, 1], [0.2, 2], [0.3, 3], [0.4, 0]] as const)(
  "move frame at %fs",
  (time, offset) => {
    const base = at(time);
    const state = { ...base, player: { ...base.player, vx: 1 } };
    expect(selectRalphyPose(state, false).frame).toMatchObject({ row: 1, col: offset });
  },
);

test("uses three authored views and mirrors only right", () => {
  const base = createGame(() => 0);
  const pose = (x: number, y: number) => selectRalphyPose({ ...base, aim: { x, y } }, false);
  expect(pose(base.player.x, 0)).toMatchObject({ facing: "up", frame: { col: 4 }, flipX: false });
  expect(pose(0, base.player.y)).toMatchObject({ facing: "left", frame: { col: 8 }, flipX: false });
  expect(pose(960, base.player.y)).toMatchObject({ facing: "right", frame: { col: 8 }, flipX: true });
  expect(pose(base.player.x + 1, base.player.y - 1).facing).toBe("up");
  expect(pose(base.player.x + 1, base.player.y + 1).facing).toBe("down");
});

test("honors fire reload hurt death boundaries and precedence", () => {
  const base = at(0);
  const pose = (overrides: Partial<typeof base>, time: number) =>
    selectRalphyPose({ ...base, ...overrides, time }, false);

  expect(pose({ lastShotAt: 1 }, 1.059)).toMatchObject({ state: "fire", frame: { row: 2, col: 0 } });
  expect(pose({ lastShotAt: 1 }, 1.06)).toMatchObject({ state: "fire", frame: { row: 2, col: 1 } });
  expect(pose({ lastShotAt: 1 }, 1.16).state).toBe("idle");
  expect(pose({ lastShotAt: 1, player: { ...base.player, vx: 1 } }, 1).state).toBe("fire");
  expect(pose({ lastHurtAt: 1 }, 1.179)).toMatchObject({ state: "hurt", frame: { row: 4 } });
  expect(pose({ lastHurtAt: 1 }, 1.18).state).toBe("idle");

  const reload = { ...base.reload, reloading: true, startedAt: 1, completesAt: 2.5 };
  expect(pose({ reload }, 1).frame).toMatchObject({ row: 3, col: 0 });
  expect(pose({ reload }, 1.5).frame).toMatchObject({ row: 3, col: 1 });
  expect(pose({ reload }, 2).frame).toMatchObject({ row: 3, col: 2 });

  const all = { reload, lastShotAt: 2, lastHurtAt: 2, diedAt: 2 };
  expect(pose(all, 2).state).toBe("death");
  expect(pose({ ...all, diedAt: null }, 2).state).toBe("hurt");
  expect(pose({ ...all, diedAt: null, lastHurtAt: null }, 2).state).toBe("reload");
});

test.each([[0, 0], [0.1, 1], [0.2, 2], [0.34, 3], [10, 3]] as const)(
  "death frame at age %fs",
  (age, col) => {
    const base = at(5 + age);
    expect(selectRalphyPose({ ...base, diedAt: 5 }, false).frame).toMatchObject({ row: 5, col });
  },
);

test("death pose never mirrors when aim changes", () => {
  const base = createGame(() => 0);
  const dead = { ...base, diedAt: 1, time: 2, player: { ...base.player, health: 0 } };
  expect(selectRalphyPose({ ...dead, aim: { x: 0, y: dead.player.y } }, false).flipX).toBe(false);
  expect(selectRalphyPose({ ...dead, aim: { x: 999, y: dead.player.y } }, false).flipX).toBe(false);
});

test("death is the sole held nonlooping atlas clip", () => {
  expect(validateRalphyAtlas()).toEqual([]);
  expect(RALPHY_CLIPS.filter((clip) => clip.holdLast).map((clip) => clip.state)).toEqual(["death"]);
});

test("reduced motion freezes loops but retains essential states", () => {
  const base = at(0.55);
  const moving = { ...base, player: { ...base.player, vx: 1 } };
  expect(selectRalphyPose(moving, true).frame).toMatchObject({ row: 1, col: 0 });
  expect(selectRalphyPose({ ...base, lastShotAt: 0.5 }, true)).toMatchObject({
    state: "fire",
    bodyRecoil: 0,
    gunRecoil: 0,
    gunSpin: 0,
  });
});

test("returns restrained deterministic fire and reload transforms", () => {
  const fire = at(1);
  expect(selectRalphyPose({ ...fire, lastShotAt: 1 }, false)).toMatchObject({ bodyRecoil: 3, gunRecoil: 6, gunSpin: 0 });
  expect(selectRalphyPose({ ...fire, time: 1.06, lastShotAt: 1 }, false)).toMatchObject({ bodyRecoil: 0, gunRecoil: 2 });

  const reload = { ...fire.reload, reloading: true, startedAt: 0, completesAt: 1.5 };
  expect(selectRalphyPose({ ...fire, time: 0.75, reload }, false).gunSpin).toBe(Math.PI);
  expect(selectRalphyPose({ ...fire, time: 0.75, reload }, true).gunSpin).toBe(0);
});

test("pause suppresses move and every returned pose stays finite and in bounds", () => {
  const base = createGame(() => 0);
  const samples = [
    { ...base, time: 0.5 },
    { ...base, time: 0.5, player: { ...base.player, vx: 1 } },
    { ...base, time: 0.5, lastShotAt: 0.45 },
    { ...base, time: 0.5, reload: { ...base.reload, reloading: true, startedAt: 0, completesAt: 1.5 } },
    { ...base, time: 0.5, lastHurtAt: 0.45 },
    { ...base, time: 0.5, diedAt: 0 },
  ];
  expect(selectRalphyPose({ ...samples[1]!, paused: true }, false).state).toBe("idle");
  for (const state of samples) {
    const pose = selectRalphyPose(state, false);
    expect(pose.frame.col).toBeGreaterThanOrEqual(0);
    expect(pose.frame.col).toBeLessThan(12);
    expect(pose.frame.row).toBeGreaterThanOrEqual(0);
    expect(pose.frame.row).toBeLessThan(6);
    expect(pose.frame.durationMs).toBeGreaterThan(0);
    expect([pose.bodyRecoil, pose.gunRecoil, pose.gunSpin].every(Number.isFinite)).toBe(true);
  }
});

test("rejects nonfinite presentation clocks", () => {
  const base = createGame(() => 0);
  expect(() => selectRalphyPose({ ...base, time: Number.NaN }, false)).toThrow("time must be finite");
  expect(() => selectRalphyPose({ ...base, lastShotAt: Number.POSITIVE_INFINITY }, false))
    .toThrow("lastShotAt must be finite when present");
  expect(() => selectRalphyPose({ ...base, lastHurtAt: Number.NaN }, false))
    .toThrow("lastHurtAt must be finite when present");
  expect(() => selectRalphyPose({ ...base, diedAt: Number.NEGATIVE_INFINITY }, false))
    .toThrow("diedAt must be finite when present");
  expect(() => selectRalphyPose({
    ...base,
    reload: { ...base.reload, reloading: true, startedAt: Number.NaN },
  }, false)).toThrow("reload.startedAt must be finite when reloading");
  expect(() => selectRalphyPose({
    ...base,
    reload: { ...base.reload, reloading: true, completesAt: Number.POSITIVE_INFINITY },
  }, false)).toThrow("reload.completesAt must be finite when reloading");
});

test("declared atlas clips are valid", () => {
  expect(validateRalphyAtlas()).toEqual([]);
});
