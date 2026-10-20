// Ponto de entrada do núcleo. O pacote é consumido direto do código-fonte
// TypeScript (sem passo de build): o tsx e o Vite entendem TS.

export * from "./agentes.ts";
export * from "./eventos.ts";
export * from "./imagens.ts";
export * from "./janela-perfil.ts";
export * from "./modelos.ts";
export * from "./montagem.ts";
export * from "./perfis.ts";
export * from "./pergunta.ts";
export * from "./ponte.ts";
export * from "./protocolo.ts";
export * from "./sessoes.ts";
export * from "./subagentes.ts";

// Do pi, para o servidor não depender do pacote direto (a versão fica fixada só aqui).
export { getAgentDir, type ModelRuntime } from "@earendil-works/pi-coding-agent";
