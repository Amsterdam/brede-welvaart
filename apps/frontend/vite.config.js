import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), svgr()],
	resolve: {
		alias: {
			"@shared/ui": resolve(__dirname, "../shared/ui/src"),
			"@shared/types": resolve(__dirname, "../shared/types/src"),
		},
		mainFields: [],
	},
	optimizeDeps: {
		// Exclude shared packages from pre-bundling to always use source and avoid cache issues
		exclude: ["@shared/ui", "@shared/types"],
		include: ["@shared/ui", "@shared/types"],
	},
	server: {
		fs: {
			allow: [
				resolve(__dirname, "../shared/ui"),
				resolve(__dirname, "../shared/types"),
				resolve(__dirname, "../../"),
			],
		},
		// Force Vite to watch for changes in shared/ui and not cache them
		watch: {
			ignored: ["!**/../shared/ui/**", "!**/../shared/types/**"],
		},
	},
});
