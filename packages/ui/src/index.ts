// Lógica e componentes comuns a todos os perfis: cliente do WebSocket, estado
// da janela de perfil (reducer), hooks, registro de painéis e as peças da
// janela (conversa, barra de pergunta, seletor de modelo, histórico), com o
// visual do design system APRNDR. Nada aqui conhece um perfil específico.
// Os estilos das peças ficam em estilo.css ("@estudos/ui/estilo.css").

export * from "./cliente.ts";
export * from "./estado-janela.ts";
export * from "./paineis.tsx";
export * from "./telas-iniciais.ts";
export * from "./tipos.ts";
export * from "./use-janela-perfil.ts";
export * from "./use-perfis.ts";
export * from "./visual/AgenteAnimado.tsx";
export * from "./visual/Avatares.tsx";
export * from "./visual/BarraPergunta.tsx";
export * from "./visual/Conversa.tsx";
export * from "./visual/FaixaMarca.tsx";
export * from "./visual/Fala.tsx";
export * from "./visual/InfoResposta.tsx";
export * from "./visual/Historico.tsx";
export * from "./visual/Markdown.tsx";
export * from "./visual/movimento.ts";
export * from "./visual/PainelPergunta.tsx";
export * from "./visual/Pedidos.tsx";
export * from "./visual/SeletorAgente.tsx";
export * from "./paineis-nucleo.ts";
export * from "./visual/SeletorModelo.tsx";
