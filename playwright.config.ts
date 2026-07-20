import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4174",
		viewport: { width: 1440, height: 900 },
		launchOptions: existsSync(chromePath)
			? { executablePath: chromePath }
			: undefined,
	},
	webServer: {
		command:
			"VITE_E2E_FIXTURES=1 bun run build && bun run vite preview --host 127.0.0.1 --port 4174",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
