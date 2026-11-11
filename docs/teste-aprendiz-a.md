# Roteiro de teste: memória do aprendiz, parte A (indicadores por conceito)

Contrato: docs/aprendiz.md (seções 2 e 7). Você roda este roteiro no app (atalho "Estudos"). A extensão nova `aprendiz.ts` só entra depois que o servidor reinicia: `wscript launcher\parar.vbs` e abra de novo.

Esta parte só LÊ: ela não grava nada na sua pasta de dados (o único arquivo novo é um cache em %LOCALAPPDATA%\estudos-app\aprendiz\indicadores.json, que pode ser apagado a qualquer hora e é refeito).


## A. A tela

1. Na tela de cadernos, clique em "Perfil do aprendiz" (no rodapé, junto de Materiais e Escrita). Esperado: abre a tela com a barra tijolo, o título, a aba "Indicadores" e o filtro de matéria. "Cadernos" volta para a tela de cadernos.
2. No topo, as cinco fichas: Conceitos, Domínio alto, médio e baixo e "Só autoavaliados". A legenda diz os cortes (alto 75% ou mais, médio de 40% a 75%, baixo abaixo de 40%). Os eventos da matéria de teste que não existe mais aparecem como "N eventos ignorados no cálculo". (Nos seus dados: 13.)
3. A lista começa pelos conceitos de MENOR domínio e termina nos de maior; os que só têm autoavaliação (sem respostas) ficam no fim, com "Sem respostas ainda", sem barra e sem percentual.
4. Cada linha mostra: nome do conceito, a matéria, "há N dias", a barra de domínio com a faixa escrita, Acertos, Erros, Sessões, Ganho, Calibração e "Você disse" × "Você fez". Confira alguns números contra o que você lembra de ter respondido (por exemplo, um conceito em que você errou o quiz do diagnóstico deve ter erros e domínio baixo).
5. Clique numa linha. Esperado: abre os detalhes (as confusões observadas, com o número de eventos; a autoavaliação marcada como "só informação"; os eventos que entraram, em forma curta). As outras linhas não mudam de altura nem de lugar. Clique de novo para fechar.
6. Troque o filtro de matéria. Esperado: a lista muda sem a tela piscar; "Todas" volta tudo. F5 na tela volta para a mesma rota (`#/perfil/estudos/aprendiz/indicadores[/<matéria>]`).
7. Responda uma questão de um módulo (ou envie uma verificação) e volte para esta tela. Esperado: os números do conceito mudam (acertos, domínio, sessões); isso pode demorar até a próxima abertura da tela.


## B. Como conferir (docs/padroes-de-interface.md)

Com as ferramentas do navegador gravando o estado da tela a cada 15 ms:

8. Ao trocar o filtro de matéria e ao abrir um detalhe, a barra tijolo, as fichas e as outras linhas não somem nem piscam por um quadro, e a altura das linhas fechadas não muda.
9. "Carregando" só aparece se a resposta passar de 1 s. (Para ver: pare o servidor um instante e abra a tela; o erro aparece com "Tentar de novo".)
10. Tela estreita (375 px): sem rolagem lateral; as fichas passam a duas colunas (a última na largura toda); as linhas se reorganizam sem cortar texto.
11. Movimento reduzido ligado no sistema: sem fade ao trocar de carregando para os dados.


## Resultado esperado

Passos 1 a 11 sem erro. Ficam para as próximas partes: a aba Hipóteses e o agente de reflexão (B), o resumo injetado e desligar o perfil (C) e o score da sessão (D).
