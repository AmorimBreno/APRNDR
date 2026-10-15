// Constantes do servidor, num lugar só.

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Porta do servidor. O Vite (apps/web, porta 7430) repassa /api e /ws para cá. */
export const PORTA_SERVIDOR = 7431;

/** Raiz do repositório: apps/server/src -> três pastas acima. */
export const RAIZ_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const PASTA_PERFIS = join(RAIZ_REPOSITORIO, "profiles");

/** Pasta local do app (fora da pasta de dados): %LOCALAPPDATA%\estudos-app. */
export const PASTA_APP = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "estudos-app");

export const PASTA_LOGS = join(PASTA_APP, "logs");

/** Chaves de API que o servidor procura nas variáveis de usuário do Windows se faltarem no processo. */
export const CHAVES_API = ["OPENROUTER_API_KEY", "TAVILY_API_KEY"] as const;

/** Espera depois da última mudança de arquivo antes de recarregar o perfil. */
export const ESPERA_WATCHER_MS = 300;
