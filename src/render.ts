import type { AssetKey, LoadedAssets } from "./assets";
import {
	RALPHY_ATLAS,
	selectRalphyPose,
	type RalphyPose,
} from "./game/presentation";
import type { GameState, Point } from "./game/simulation";
import { ROOM_PROPS } from "./game/room";

type RenderOptions = { reducedMotion: boolean };
const round = (value: number) => Math.round(value);

function imageAt(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	key: AssetKey,
	x: number,
	y: number,
	width: number,
	height = width,
): void {
	context.drawImage(
		assets[key],
		round(x),
		round(y),
		round(width),
		round(height),
	);
}

function centeredImage(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	key: AssetKey,
	point: Point,
	size: number,
): void {
	imageAt(
		context,
		assets,
		key,
		point.x - size / 2,
		point.y - size / 2,
		size,
		size,
	);
}

function drawRalphyFrame(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	pose: RalphyPose,
	x: number,
	y: number,
): void {
	const atlas = assets.ralphyAtlas;
	const { cellSize, destinationSize, anchorX, anchorY } = RALPHY_ATLAS;
	context.save();
	context.translate(round(x), round(y));
	if (pose.flipX) context.scale(-1, 1);
	context.drawImage(
		atlas,
		pose.frame.col * cellSize,
		pose.frame.row * cellSize,
		cellSize,
		cellSize,
		round((-destinationSize * anchorX) / cellSize),
		round((-destinationSize * anchorY) / cellSize),
		destinationSize,
		destinationSize,
	);
	context.restore();
}

function drawTargets(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
): void {
	for (const target of state.targets) {
		centeredImage(
			context,
			assets,
			target.kind,
			target,
			target.kind === "dummy" ? 66 : 58,
		);
		if (target.frozenUntil > state.time) {
			context.strokeStyle = "#8fe9ff";
			context.lineWidth = 3;
			context.beginPath();
			context.arc(
				round(target.x),
				round(target.y),
				target.radius + 6,
				0,
				Math.PI * 2,
			);
			context.stroke();
			imageAt(
				context,
				assets,
				"freezeBurst",
				target.x - 16,
				target.y - target.radius - 24,
				32,
			);
		}
		if (target.kind === "chaser") {
			context.fillStyle = "#0a0a0b";
			context.fillRect(
				round(target.x - 20),
				round(target.y + target.radius + 8),
				40,
				5,
			);
			context.fillStyle = "#ffa630";
			context.fillRect(
				round(target.x - 19),
				round(target.y + target.radius + 9),
				round((38 * target.health) / target.maxHealth),
				3,
			);
		}
	}
}

function drawProjectiles(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	reducedMotion: boolean,
): void {
	const projectiles = new Map(state.projectiles.map((projectile) => [projectile.id, projectile]));
	for (const link of state.teslaLinks) {
		const a = projectiles.get(link.a);
		const b = projectiles.get(link.b);
		if (!a || !b) continue;
		const angle = Math.atan2(b.y - a.y, b.x - a.x);
		context.save();
		context.translate(round(a.x), round(a.y));
		context.rotate(angle);
		context.beginPath();
		context.rect(0, -6, round(link.distance), 12);
		context.clip();
		context.globalAlpha = 0.7;
		const phase = reducedMotion ? 0 : (state.time * 72) % 24;
		for (let x = -phase; x < link.distance; x += 24)
			context.drawImage(assets.teslaArc, round(x), -6, 24, 12);
		context.restore();
	}
	const splitBursts = new Set<string>();
	for (const projectile of state.projectiles) {
		const size = Math.max(10, projectile.radius * 4.2);
		if (
			projectile.maxTravel !== undefined &&
			projectile.travelled < 64 &&
			projectile.splitParentId !== undefined &&
			projectile.splitOrigin !== undefined &&
			!splitBursts.has(projectile.splitParentId)
		) {
			centeredImage(context, assets, "shotgunSplit", projectile.splitOrigin, size * 4);
			splitBursts.add(projectile.splitParentId);
		}
		if (projectile.behaviors.spiral) {
			context.globalAlpha = 0.55;
			centeredImage(context, assets, "orbitTrail", projectile, size * 1.5);
			context.globalAlpha = 1;
		}
		if ((projectile.homingMarkerRemaining ?? 0) > 0) {
			context.globalAlpha = 0.45;
			centeredImage(context, assets, "homingMarker", projectile, size * 1.7);
			context.globalAlpha = 1;
		}
		if (projectile.penetration) {
			context.save();
			context.translate(round(projectile.x), round(projectile.y));
			context.rotate(Math.atan2(projectile.vy, projectile.vx));
			imageAt(
				context,
				assets,
				"spectralTrail",
				-size * 1.8,
				-size / 2,
				size * 2.3,
				size,
			);
			context.restore();
		}
		centeredImage(context, assets, "soulProjectile", projectile, size);
	}
}

function drawPlayer(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	options: RenderOptions,
): void {
	const pose = selectRalphyPose(state, options.reducedMotion);
	const aim = Math.atan2(
		state.aim.y - state.player.y,
		state.aim.x - state.player.x,
	);
	const bob =
		options.reducedMotion || pose.state !== "move"
			? 0
			: Math.round(Math.sin(state.time * 14) * 2);
	const bodyX = state.player.x - Math.cos(aim) * pose.bodyRecoil;
	const bodyY = state.player.y + bob - Math.sin(aim) * pose.bodyRecoil;
	drawRalphyFrame(context, assets, pose, bodyX, bodyY);

	if (pose.state === "death") return;
	context.save();
	context.translate(round(bodyX), round(bodyY));
	context.rotate(aim + Math.sin(pose.gunSpin) * 0.08);
	imageAt(
		context,
		assets,
		"ghostRevolver",
		9 - pose.gunRecoil,
		-32,
		64,
	);
	if (pose.state === "fire" && pose.frame.col % 4 === 0) {
		imageAt(
			context,
			assets,
			"muzzleFlash",
			55 - pose.gunRecoil,
			-16,
			32,
		);
	}
	context.restore();
}

function drawDamage(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	reducedMotion: boolean,
): void {
	context.textAlign = "center";
	context.font = "bold 18px ui-monospace, monospace";
	for (const event of state.metrics.hitEvents) {
		const age = state.time - event.time;
		if (age < 0 || age > 0.7) continue;
		const target = state.targets.find(
			(candidate) => candidate.id === event.targetId,
		);
		const point =
			event.x === undefined || event.y === undefined
				? target
				: { x: event.x, y: event.y };
		if (!point) continue;
		const y =
			point.y -
			(target?.radius ?? 18) -
			18 -
			(reducedMotion ? 0 : age * 28);
		context.globalAlpha = Math.max(0, 1 - age / 0.7);
		if (!reducedMotion) centeredImage(context, assets, "impact", point, 34);
		context.fillStyle = "#f5f5f4";
		context.fillText(`${Math.round(event.damage)}`, round(point.x), round(y));
	}
	context.globalAlpha = 1;
	context.textAlign = "start";
}

function drawAim(context: CanvasRenderingContext2D, state: GameState): void {
	context.strokeStyle = "#ffa630";
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(round(state.aim.x - 7), round(state.aim.y));
	context.lineTo(round(state.aim.x + 7), round(state.aim.y));
	context.moveTo(round(state.aim.x), round(state.aim.y - 7));
	context.lineTo(round(state.aim.x), round(state.aim.y + 7));
	context.stroke();
}

export function renderGame(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	options: RenderOptions,
): void {
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, state.room.width, state.room.height);
	context.drawImage(assets.room, 0, 0, state.room.width, state.room.height);
	for (const prop of ROOM_PROPS)
		centeredImage(
			context,
			assets,
			prop.kind,
			{ x: prop.x, y: prop.y },
			prop.size,
		);
	drawTargets(context, state, assets);
	drawProjectiles(context, state, assets, options.reducedMotion);
	drawPlayer(context, state, assets, options);
	drawDamage(context, state, assets, options.reducedMotion);
	drawAim(context, state);
}
