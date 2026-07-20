import { defineConfig } from "vite";

export default defineConfig({
	base: process.env.VITE_BASE_PATH ?? "/",
	define: {
		__RALPHY_E2E_BUILD__: JSON.stringify(
			process.env.VITE_E2E_FIXTURES === "1",
		),
	},
});
