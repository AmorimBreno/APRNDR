# Roteiro de teste: memória do aprendiz, parte B (hipóteses e reflexão)

Contrato: docs/aprendiz.md (seções 3 e 8). Você roda este roteiro no app (atalho "Estudos"). Reinicie o app antes: a extensão `aprendiz.ts` mudou e o prompt `reflexao.md` é novo (`wscript launcher\parar.vbs` e abra de novo).

Cuidado com os dados e o custo: ao contrário da parte A, esta parte GRAVA na sua pasta de dados (aprendiz/hipoteses.json e eventos no aprendiz/eventos.jsonl) e CHAMA o modelo (GPT-6.1 Sol), a uns US$ 0,02 por reflexão, só quando há eventos novos. Os eventos de hipótese são só de acréscimo e não podem ser apagados; as decisões você pode mudar depois (editar status).


## A. Refletir

1. No Perfil do aprendiz, abra a aba "Hipóteses". Sem reflexão ainda: uma frase explica que o professor propõe hipóteses a partir dos seus eventos e que nada entra no perfil sem a sua aprovação.
2. Clique em "Refletir". Esperado: o botão fica desligado, "Refletindo…" só aparece se passar de 1 s, e ao fim a linha mostra "Última reflexão agora: leu N eventos, X propostas aceitas, Y descartadas · US$ 0,0X". Os eventos lidos são os de aprendizagem (respostas, verificações, dissertativas, autoavaliações), nunca os eventos de hipótese.
3. Em "Esperando a sua decisão" aparecem as hipóteses propostas. Cada uma tem: enunciado curto e concreto, tipo, escopo (global, matéria ou conceito, com os nomes), confiança, validade, versão e as evidências ("N a favor · M contra"). Nenhuma deve ser um rótulo ("aprendiz visual") nem um elogio. Com os seus dados atuais (poucos eventos, 5 sessões), é normal vir pouco ou nada: o professor só propõe com 2 eventos de sessões diferentes.
4. Clique numa ficha de evidência. Esperado: vai para o Histórico com o evento destacado e rolado até ficar à vista; o destaque some no próximo clique. A lâmpada no evento leva de volta às hipóteses que o citam.
5. Clique em "Refletir" de novo logo em seguida. Esperado: "Sem eventos novos desde a última reflexão"; nada é chamado nem gravado.


## B. Decidir

6. Numa proposta, clique em Aprovar. Esperado: o botão desliga ("Salvando…" só depois de 1 s), a hipótese passa para "Aprovadas", sem o cartão mudar de tamanho. A confiança é a mesma que a do código calculou (você não a escolhe).
7. Numa proposta, clique em Editar, mude o enunciado (12 a 300 caracteres) e salve. Esperado: aprova com o texto novo; o cartão mostra a versão 2. Um enunciado curto demais ou longo demais não deixa salvar.
8. Numa proposta, clique em Rejeitar. Esperado: vai para "Rejeitadas" (recolhida). Numa reflexão futura o professor não repete essa hipótese.
9. Numa aprovada: Editar o enunciado e Rejeitar funcionam; numa rejeitada ou expirada, "Aprovar de novo" a traz de volta.
10. Confira no arquivo aprendiz/hipoteses.json: legível, uma versão por mudança (em `anteriores`), `aprovadaPeloUsuario` só nas aprovadas. E no aprendiz/eventos.jsonl: `refletiu`, `propos_hipotese`, `aprovou_hipotese`, `rejeitou_hipotese`, `editou_hipotese`, cada um com o id da hipótese e as evidências.


## C. Mudanças propostas e conflito

11. Depois de mais algumas respostas (por exemplo, errar de novo uma questão do mesmo conceito), peça outra reflexão. Esperado: pode aparecer uma "mudança" numa hipótese que já existe ("Reforçar: +2 eventos a favor", "Enfraquecer…" ou "Expirar"), como cartão com o motivo, Aprovar e Rejeitar. Aprovar reforçar renova a validade da hipótese.
12. Se evidências contra recentes passarem as a favor numa hipótese aprovada, ela volta para "Esperando a sua decisão" com o aviso "Voltou para a sua revisão: as evidências contra recentes superam as a favor". Nada é sobrescrito em silêncio.


## D. Gatilhos automáticos

13. Envie o questionário de fim de lição de um módulo. Esperado: uma reflexão roda em segundo plano (sem nada na tela do módulo); se houver propostas, a aba Hipóteses (se estiver aberta) se atualiza sozinha. Sem eventos novos ou com falha, nada aparece.
14. Conclua um módulo: o mesmo acontece, junto do relatório do método.
15. O professor (conversa de uma matéria): peça "o que você sabe sobre como eu estudo?". Esperado: ele usa a ferramenta de leitura do perfil e responde só com as hipóteses APROVADAS (ou diz que ainda não há nenhuma aprovada). Ele não altera o perfil.


## E. Como conferir (docs/padroes-de-interface.md)

Com as ferramentas do navegador gravando o estado da tela a cada 15 ms:

16. Ao aprovar, rejeitar e trocar de aba, o cabeçalho e os outros cartões não somem nem piscam, e a altura dos cartões não muda entre os estados (repouso, salvando, erro).
17. "Refletindo…", "Salvando…" e "Carregando…" só aparecem depois de 1 s.
18. Tela estreita (375 px): sem rolagem lateral; o modal de editar cabe; as seções e as fichas quebram sem cortar texto.
19. Movimento reduzido: sem fades.


## Resultado esperado

Passos 1 a 19 sem erro. Ficam para as próximas partes: o resumo injetado e desligar o perfil (C) e o score da sessão (D).
