import { expect, test } from "bun:test";
import { bootstrap } from "./main";

class FakeElement {
	children: FakeElement[] = [];
	textContent = "";
	readonly attributes = new Map<string, string>();

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

	replaceChildren(...children: FakeElement[]): void {
		this.children = children;
	}
}

test("a failed asset preflight never mounts or requests a frame and leaves one alert", async () => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
	const app = new FakeElement();
	const queries: string[] = [];
	const fakeDocument = {
		querySelector(selector: string) {
			queries.push(selector);
			if (selector === "#app") return app;
			throw new Error(`bootstrap queried ${selector} before asset preflight`);
		},
		createElement() {
			return new FakeElement();
		},
	};
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: fakeDocument,
	});
	let frameRequests = 0;
	let stateResolutions = 0;
	try {
		await bootstrap({
			loadAssets: async () => {
				throw new Error(
					"Required generated asset failed to load: twinWeave (/assets/generated/effects/artifacts/twin-weave.png)",
				);
			},
			requestFrame: () => {
				frameRequests += 1;
				return 1;
			},
			resolveInitialState: async () => {
				stateResolutions += 1;
				return undefined;
			},
		});
	} finally {
		if (previous) Object.defineProperty(globalThis, "document", previous);
		else Reflect.deleteProperty(globalThis, "document");
	}

	expect(queries).toEqual(["#app"]);
	expect(frameRequests).toBe(0);
	expect(stateResolutions).toBe(0);
	expect(app.children).toHaveLength(1);
	expect(app.children[0]?.attributes.get("role")).toBe("alert");
	expect(app.children[0]?.textContent).toContain("twinWeave");
});
