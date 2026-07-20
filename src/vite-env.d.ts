/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_E2E_FIXTURES?: "1";
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const __RALPHY_E2E_BUILD__: boolean;
