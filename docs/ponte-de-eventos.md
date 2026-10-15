# Ponte de eventos: como uma extensão de perfil fala com a interface

Este documento é para quem escreve uma extensão de perfil (uma ferramenta em profiles/<id>/extensions/) que precisa mostrar algo na tela do app ou perguntar algo ao usuário. A regra do projeto (AGENTS.md) é que a ferramenta nunca fala direto com um componente: ela emite um evento com três partes, o identificador do painel, a ação e os dados, e o núcleo repassa sem interpretar (ESPECIFICACAO.md, 5.3).

O código do núcleo está em packages/core/src/ponte.ts. A extensão de perfil não importa nada do núcleo: o pi carrega as extensões de outra pasta, e elas não enxergam o pacote @estudos/core. Tudo passa pelo barramento de eventos do pi, o `pi.events`, com nomes de evento e dados simples (objetos que viram JSON).


## Os eventos

- "interface:mostrar", da ferramenta para a interface. Dados: `{ painel, acao, dados }`. O núcleo repassa à janela como o evento `acao_interface` e não espera nada de volta. Serve para abrir um painel, atualizar o que ele mostra, fechar.
- "interface:pedido", da ferramenta para a interface, quando a ferramenta espera a resposta do usuário. Dados: `{ id, painel, acao, dados }`. O núcleo repassa como `pedido_interface` e guarda o pedido até alguém responder.
- "interface:resposta", do núcleo para a ferramenta. Dados: `{ id, dados }` com a resposta do usuário, ou `{ id, cancelado: true, motivo }` quando o pedido foi cancelado.
- "interface:acao", da interface para a extensão. Dados: `{ painel, acao, dados }`. É o sentido contrário: um botão de um painel, uma seleção de texto. A extensão do perfil escuta e reage (por exemplo, mandando uma mensagem para a sessão com `pi.sendUserMessage`).

`painel` e `acao` são textos não vazios. `painel` é o identificador que o perfil lista no profile.json (campo paineis) e que o front liga a um componente. `acao` e `dados` são combinados entre a ferramenta e o painel; o núcleo não olha dentro deles.

Um "interface:mostrar" sem painel ou sem ação é ignorado e vira um erro de extensão na janela. Um "interface:pedido" sem painel, sem ação ou com um `id` que já está esperando resposta recebe na hora `{ id, cancelado: true, motivo: "pedido_invalido", erro }`.


## Cancelamento

Um pedido nunca fica pendurado. O núcleo responde com `{ id, cancelado: true, motivo }` quando:

- motivo "abortado": o usuário interrompeu a resposta (JanelaPerfil.abortar);
- motivo "execucao_terminada": a execução do agente acabou e ninguém mais espera a resposta;
- motivo "sessao_encerrada": a janela trocou de sessão ou de agente, recarregou ou foi fechada;
- motivo "pedido_invalido": o pedido veio errado (ver acima).

A interface também recebe o evento `pedido_interface_cancelado` com o id e o motivo, para fechar o que estava perguntando.

A ferramenta deve tratar o cancelamento como "o usuário não respondeu": devolver um resultado curto dizendo isso ao modelo, sem lançar erro. Ela também pode escutar o `signal` do execute, que o pi aborta quando a execução é interrompida; o núcleo cancela os pedidos antes do abort, então o cancelamento chega primeiro.


## Regras para quem escreve a ferramenta

1. Assine "interface:resposta" ANTES de emitir "interface:pedido". O barramento entrega na hora (é síncrono), e um pedido inválido é recusado no mesmo instante; quem assina depois perde a resposta.
2. Use um id único por pedido, por exemplo `crypto.randomUUID()` ou o id da chamada da ferramenta (o primeiro argumento do execute).
3. Filtre as respostas pelo id e cancele a assinatura quando a sua chegar: a função `pi.events.on` devolve a função que cancela.
4. Use o pedido só quando a ferramenta fica esperando dentro do execute. Para algo que o usuário faz depois, sem a ferramenta esperar, use "interface:mostrar" e escute "interface:acao": um pedido é cancelado quando a execução termina.
5. Não ponha no `dados` nada que não vire JSON (funções, classes): eles vão para o front pelo WebSocket.


## Exemplo: ferramenta que mostra algo num painel

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "mostrar_resumo",
		label: "Mostrar resumo",
		description: "Show a short summary in the side panel.",
		parameters: Type.Object({ texto: Type.String({ description: "The summary text." }) }),
		async execute(_id, params) {
			pi.events.emit("interface:mostrar", { painel: "resumo", acao: "mostrar", dados: { texto: params.texto } });
			return { content: [{ type: "text", text: "Resumo mostrado no painel." }], details: undefined };
		},
	});
}
```


## Exemplo: ferramenta que pergunta e espera

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Resposta = { id: string; dados?: unknown; cancelado?: true; motivo?: string };

/** Emite o pedido e espera a resposta (ou o cancelamento) com o mesmo id. */
function perguntar(pi: ExtensionAPI, id: string, painel: string, acao: string, dados: unknown): Promise<Resposta> {
	return new Promise((resolver) => {
		// 1. Assina antes de emitir.
		const parar = pi.events.on("interface:resposta", (recebido) => {
			const resposta = recebido as Resposta;
			if (resposta.id !== id) return;
			parar();
			resolver(resposta);
		});
		// 2. Só então emite o pedido.
		pi.events.emit("interface:pedido", { id, painel, acao, dados });
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "confirmar",
		label: "Confirmar",
		description: "Ask the user a yes/no question in the app and wait for the answer.",
		parameters: Type.Object({ pergunta: Type.String({ description: "The question." }) }),
		async execute(idChamada, params) {
			const resposta = await perguntar(pi, idChamada, "confirmacao", "perguntar", { pergunta: params.pergunta });
			if (resposta.cancelado) {
				return { content: [{ type: "text", text: `O usuário não respondeu (${resposta.motivo}).` }], details: undefined };
			}
			return { content: [{ type: "text", text: `Resposta do usuário: ${JSON.stringify(resposta.dados)}` }], details: undefined };
		},
	});
}
```


## Lado do núcleo (para o servidor e o front)

- A JanelaPerfil emite `acao_interface`, `pedido_interface` e `pedido_interface_cancelado` junto com os outros eventos (EventoNucleo, packages/core/src/eventos.ts).
- `janela.responder(id, dados)` entrega a resposta do usuário. Devolve false se o pedido não existe mais (já respondido ou cancelado); nesse caso o front só fecha o que estava mostrando.
- `janela.acaoDaInterface(painel, acao, dados)` emite "interface:acao" na sessão aberta.
- As sessões filhas dos subagentes não têm a ponte: um subagente não fala com a interface. Quem fala é a sessão principal da janela.
