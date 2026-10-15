import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Front na 7430; /api e /ws vão para o servidor na 7431 (apps/server/src/config.ts).
export default defineConfig({
	plugins: [react()],
	server: {
		port: 7430,
		strictPort: true,
		proxy: {
			"/api": "http://localhost:7431",
			"/ws": { target: "ws://localhost:7431", ws: true },
		},
	},
});
