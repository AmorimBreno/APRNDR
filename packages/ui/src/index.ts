// Lógica comum a todos os perfis: cliente do WebSocket, estado da janela de
// perfil (reducer), hooks e registro de painéis. Nada aqui conhece um perfil
// específico. Os componentes visuais da tela provisória ficam em
// apps/web/src/provisorio/ (serão trocados no redesenho).

export * from "./cliente.ts";
export * from "./estado-janela.ts";
export * from "./paineis.tsx";
export * from "./tipos.ts";
export * from "./use-janela-perfil.ts";
export * from "./use-perfis.ts";
