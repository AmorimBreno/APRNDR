import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { semRecarregarAoVoltar } from "./src/vite-sem-recarregar.ts";

// Front na 7430; /api e /ws vão para o servidor na 7431 (apps/server/src/config.ts).
// semRecarregarAoVoltar: a página não recarrega quando o notebook acorda (src/vite-sem-recarregar.ts).
export default defineConfig({
	plugins: [react(), semRecarregarAoVoltar()],
	server: {
		port: 7430,
		strictPort: true,
		proxy: {
			"/api": "http://localhost:7431",
			"/ws": { target: "ws://localhost:7431", ws: true },
		},
	},
});
