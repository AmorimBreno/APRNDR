# Teste: termos-chave e pedidos de explicação

Implementação e verificações automatizadas em 2026-10-29. Contrato: `docs/termos.md`.

## Antes de começar

- Abra pelo atalho habitual. Caderno Ciência de Dados → curso Estudo de Ciência de Dados para Atividade → módulo 1.
- As chamadas abaixo gastam no OpenRouter e gravam dados de verdade. Os testes de implementação foram feitos numa cópia temporária; o seu módulo original ainda não foi marcado por eles.
- Uma marcação custa aproximadamente US$ 0,01 a 0,03 por lição, variando com o tamanho. Nas rodadas realizadas, o módulo com duas lições custou de US$ 0,05 a US$ 0,06 para marcar; a explicação de um trecho custou de US$ 0,007 a US$ 0,014.
- Não gere o módulo de novo só para testar: isso substitui o conteúdo e reinicia as respostas.

## No app

1. No índice, confira **Marcar os termos** e a estimativa. Abra e cancele a confirmação: nada deve ser chamado ou gravado.
2. Abra outra vez e confirme. Confira **Marcando os termos da lição 1 de 2…**. No fim, o conteúdo reaparece com termos em âmbar, negrito e sublinhado. O botão some quando há pelo menos uma marca.
3. Na lição 2, passe o mouse sobre **radicais**. Confira o cartão com o termo, uma definição curta e o lugar. Neste módulo antigo, o modelo deve preferir **Não explicado no curso**, pois o bloco usa a palavra sem defini-la explicitamente. Clicar num termo sem lugar fixa o cartão; clicar fora ou Esc fecha.
4. Use Tab para focar um termo. O cartão abre também pelo teclado. Em um termo com lugar válido, Enter leva à lição/bloco indicado, com foco e um destaque curto. Se já estiver no próprio bloco que explica o termo, o clique não muda a página.
5. Selecione **radicais** ou uma frase de até 300 caracteres no texto. Confira as duas ações. Selecionar atravessando dois blocos, um campo de resposta ou a sua resposta escrita não deve abrir a barra.
6. Clique **Não sei o que é isso**. Confira o balão abaixo do bloco: trecho, tipo, **Explicando…** e depois a explicação. Quando o modelo sugerir um termo, clique **Guardar no glossário**. Confira **Guardado no glossário** e a marca no texto, se o trecho existir literalmente no markdown.
7. Peça **Explique melhor** em outra frase. Confira que a explicação muda o jeito de explicar, sem botão para guardar quando não há termo. O pedido anterior fica recolhido; deve poder ser aberto.
8. Clique no termo guardado a partir do pedido. O destino deve ser o balão dele, aberto, inclusive se estava entre os pedidos antigos recolhidos.
9. Nas alternativas do quiz, passe o mouse e use Tab nos termos. Consultar um termo ou selecionar o texto não pode escolher a alternativa. O botão com a letra e as setas do teclado continuam escolhendo quando a questão estiver liberada pela confiança.
10. Recarregue com F5 e reabra a lição: termos, explicações e termos guardados continuam. Reiniciar o app deve preservar os mesmos dados. A navegação pela definição não muda respostas, versões de blocos nem o progresso.
11. Em uma janela estreita (375 px), confira o cartão e a barra dentro da tela. Perto do topo, o cartão deve abrir para baixo. Com o Windows configurado para menos movimento, a entrada não deve saltar.
12. Se ocorrer erro de rede, confira **Tentar de novo** no pedido de explicação; para marcação, o erro fica no índice e dá para tentar novamente. Não é necessário desligar sua rede só para provocar esse erro.

## Arquivos esperados

- `<dados>/materias/ciencia-de-dados/cursos/estudo-de-ciencia-de-dados-para-atividade/glossario.json`: termos e onde foram explicados.
- `modulos/m1.json`: marcas `[texto](termo:t-id)` e `explicacoes`; conteúdo e versões anteriores à marcação preservados.
- Eventos só acrescentados: `marcou_termos` na matéria; `pediu_explicacao` e `guardou_termo` no aprendiz. Nunca apagar eventos para desfazer o teste.

## Testes técnicos já executados

- `pnpm typecheck` passou; `pnpm test`: 65 arquivos, 1167 testes passando. O script de teste real também passou pelo tsc com uma configuração temporária. Os testes de interação com happy-dom cobrem foco e cartão preservados após atualizar o provedor, Esc, teclado, seleção e consulta dos termos sem escolher alternativa.
- `pnpm exec tsx scripts/testar-termos.ts`: três rodadas reais, com cópias temporárias e custo total de US$ 0,19847. A última verificou o prompt conservador: radical e stemmer com `explicado: null`, nenhum descarte nem marca inaplicável. Origem intacta, conteúdo, versões e respostas preservados.
- Edge headless com uma tela temporária de dados sintéticos e ações simuladas: cartão, Esc, foco no destino, navegação entre lições e módulos, seleção em um bloco e rejeição entre blocos, balões, guardar, confirmação e progresso de marcação, 375 px e preferência de movimento reduzido. Sem erro de JavaScript ou botão aninhado. A tela temporária foi removida; essas ações não foram executadas na sessão nem nos dados reais do Breno.

A aprovação do fluxo completo e do visual pelo Breno fica pendente deste roteiro.
