import type { AssetKey, Assets } from "./assets";
import type { GameState, Point } from "./game/simulation";
import { ROOM_PROPS } from "./game/room";

type RenderOptions = { moving: boolean; reducedMotion: boolean };
const RALPHY_SIZE = 80;
const round = (value: number) => Math.round(value);

function imageAt(
	context: CanvasRenderingContext2D,
	assets: Assets,
	key: AssetKey,
	x: number,
	y: number,
	width: number,
	height = width,
	fallback = "#ffa630",
): void {
	const image = assets.images[key];
	if (image) {
		context.drawImage(image, round(x), round(y), round(width), round(height));
		return;
	}
	context.fillStyle = "#0a0a0b";
	context.fillRect(round(x), round(y), round(width), round(height));
	context.strokeStyle = fallback;
	context.lineWidth = 3;
	context.strokeRect(
		round(x) + 2,
		round(y) + 2,
		round(width) - 4,
		round(height) - 4,
	);
	context.beginPath();
	context.moveTo(round(x) + 4, round(y) + 4);
	context.lineTo(round(x + width) - 4, round(y + height) - 4);
	context.stroke();
}

function centeredImage(
	context: CanvasRenderingContext2D,
	assets: Assets,
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

function ralphyKey(state: GameState, moving: boolean): AssetKey {
	const dx = state.aim.x - state.player.x;
	const dy = state.aim.y - state.player.y;
	if (Math.abs(dx) > Math.abs(dy)) {
		if (dx < 0) return moving ? "ralphyLeftMove" : "ralphyLeft";
		return moving ? "ralphyRightMove" : "ralphyRight";
	}
	if (dy < 0) return moving ? "ralphyUpMove" : "ralphyUp";
	return moving ? "ralphyDownMove" : "ralphyDown";
}

function drawTargets(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: Assets,
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
	assets: Assets,
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
		const texture = assets.images.teslaArc;
		if (texture) {
			const phase = reducedMotion ? 0 : (state.time * 72) % 24;
			for (let x = -phase; x < link.distance; x += 24) context.drawImage(texture, round(x), -6, 24, 12);
		} else {
			context.strokeStyle = "#8fe9ff";
			context.lineWidth = 4;
			context.beginPath();
			context.moveTo(0, 0);
			context.lineTo(round(link.distance), 0);
			context.stroke();
		}
		context.restore();
	}
	const splitBursts = new Set<string>();
	for (const projectile of state.projectiles) {
		const size = Math.max(10, projectile.radius * 4.2);
		if (
			projectile.maxTravel !== undefined &&
			projectile.travelled < 64 &&
			!splitBursts.has(projectile.triggerId)
		) {
			centeredImage(context, assets, "shotgunSplit", projectile, size * 4);
			splitBursts.add(projectile.triggerId);
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
		context.save();
		context.translate(round(projectile.x), round(projectile.y));
		context.rotate(Math.atan2(projectile.vy, projectile.vx));
		if (projectile.penetration)
			imageAt(
				context,
				assets,
				"spectralTrail",
				-size * 1.8,
				-size / 2,
				size * 2.3,
				size,
			);
		else imageAt(context, assets, "bullet", -size / 2, -size / 2, size);
		context.restore();
	}
}

function drawPlayer(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: Assets,
	options: RenderOptions,
): void {
	const bob =
		options.reducedMotion || !options.moving
			? 0
			: Math.round(Math.sin(state.time * 14) * 2);
	imageAt(
		context,
		assets,
		ralphyKey(state, options.moving),
		state.player.x - RALPHY_SIZE / 2,
		state.player.y - 46 + bob,
		RALPHY_SIZE,
	);
	const aim = Math.atan2(
		state.aim.y - state.player.y,
		state.aim.x - state.player.x,
	);
	context.save();
	context.translate(round(state.player.x), round(state.player.y + bob));
	context.rotate(aim);
	imageAt(context, assets, "revolver", 9, -32, 64);
	context.restore();
}

function drawDamage(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: Assets,
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
	assets: Assets,
	options: RenderOptions,
): void {
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, state.room.width, state.room.height);
	const room = assets.images.room;
	if (room) context.drawImage(room, 0, 0, state.room.width, state.room.height);
	else {
		context.fillStyle = "#171719";
		context.fillRect(0, 0, state.room.width, state.room.height);
		context.strokeStyle = "#ffa630";
		context.lineWidth = 8;
		context.strokeRect(
			state.room.minX,
			state.room.minY,
			state.room.maxX - state.room.minX,
			state.room.maxY - state.room.minY,
		);
	}
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
