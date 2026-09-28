import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [react(), svgr()],
	base: mode !== 'development' ? '/pdf/' : '/',
	resolve: {
		alias: {
			"@shared/ui": resolve(__dirname, "../shared/ui/src"),
			"@shared/types": resolve(__dirname, "../shared/types/src"),
			"@frontend": resolve(__dirname, "../frontend/src"),
		},
		mainFields: [],
	},
	optimizeDeps: {
		// Exclude shared packages from pre-bundling to always use source and avoid cache issues
		exclude: ["@shared/ui", "@shared/types"],
		include: ["@shared/ui", "@shared/types"],
	},
	server: {
		port: 5174,
		fs: {
			allow: [
				resolve(__dirname, "../shared/ui"),
				resolve(__dirname, "../shared/types"),
				resolve(__dirname, "../frontend"),
				resolve(__dirname, "../../"),
			],
		},
		// Force Vite to watch for changes in shared packages and frontend
		watch: {
			ignored: ["!**/../shared/ui/**", "!**/../shared/types/**", "!**/../frontend/**"],
		},
	},
}));
