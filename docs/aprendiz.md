# Memória do aprendiz (item 9): plano e contrato da parte A (versão 1, aguardando aprovação)

Decisão de origem: ESPECIFICACAO.md, 9.2 a 9.9 e o item 9 da seção 10. Regras que valem em tudo (AGENTS.md): toda hipótese cita ids de eventos; nada no perfil muda sem a aprovação do Breno (a exceção são os ajustes do método, 13.17); os eventos são só de acréscimo; índices e caches são derivados, ficam fora da pasta de dados (%LOCALAPPDATA%\estudos-app) e podem ser refeitos; dados do Breno nunca no repositório.

Decisões do Breno em 2026-11-11:
- O FSRS (estabilidade e próxima revisão) fica para a revisão espaçada (item 8). Nesta rodada a camada 2 tem BKT, acertos e erros com decaimento, calibração (Brier) e confusões.
- O agente de reflexão roda por um botão, ao concluir um módulo e ao concluir uma lição. Como o app não tem uma ação "concluir lição", este contrato lê "ao concluir uma lição" como o envio do questionário de fim de lição (o evento `avaliou_licao`). Se ele quis outro gatilho, é uma linha.
- A tela "Perfil do aprendiz" é uma tela própria, aberta pela tela de cadernos, com filtro por matéria.
- Score da sessão: "desenvolva". Este contrato entende que ele quer o score completo, o que exige construir o que falta (a parte D, abaixo). Confirmar na aprovação.


## 1. O que já existe e o que falta

Existe: `aprendiz/eventos.jsonl` (camada 1) com autoavaliou_conceito, respondeu_questao (diagnóstico e módulo), respondeu_verificacao, respondeu_dissertativa, nao_sabia_questao, avaliou_licao, avaliou_bloco, o ciclo e os experimentos do método (placar por módulo com Brier em lib/metodo-placar-tipos.ts) e os eventos de matéria. Cada evento de aprendizagem traz `objeto.conceitos` (ids do mapa da matéria), `objeto.materia`, `curso`, `modulo`, `licao` e `questao`, e `resultado` (correta, avaliacao certa/em_parte/errada, total/max, confianca, tempoMs).

Falta: indicadores por conceito (camada 2), hipóteses (camada 3), o resumo injetado (camada 4), o agente de reflexão, o score da sessão e a tela. Hoje são 108 eventos em 5 sessões (13 de uma matéria de teste que não existe mais): as primeiras hipóteses serão poucas, e a regra da especificação (evidência repetida em sessões diferentes) as segura de propósito.


## 2. Parte A: indicadores por conceito (camada 2)

Tudo puro e recalculável a partir dos eventos, sem modelo. Lógica em profiles/estudos/lib/aprendiz-indicadores-tipos.ts (sem Node, para a tela importar) e leitura do disco em lib/aprendiz.ts.

- Observações: cada evento vira zero ou mais observações (conceito, instante, sessão, acerto 0 a 1, peso, id do evento):
  - respondeu_questao: correta = 1, errada = 0; com `confianca`, guarda para a calibração.
  - respondeu_verificacao: certa 1, em_parte 0,5, errada 0.
  - respondeu_dissertativa: total / max; só vale para o BKT quando houver pontos nos critérios em que o corretor concorda (hoje, todos).
  - nao_sabia_questao: errada, peso 1.
  - autoavaliou_conceito: NÃO entra no BKT (a autoavaliação não é verdade, 9.3); fica como o "que ele disse" ao lado do que ele fez.
  - Eventos de matéria que não existe mais (sem materias/<id>/materia.json) são ignorados.
- Por conceito, o que a camada 2 calcula: probabilidade de domínio por BKT (início 0,3, chute 0,2, deslize 0,1, aprendizado 0,15; observações fracionárias atualizam como mistura ponderada; parâmetros em aprendiz/config.json, `bkt`); acertos e erros com decaimento exponencial (meia-vida inicial de 30 dias, configurável); número de sessões distintas; ganho normalizado entre a primeira e a última observação (quando houver pelo menos 2 sessões); calibração Brier (confiança 1 a 4 vira 0,25, 0,5, 0,75 e 0,95, como no placar); o que ele disse (autoavaliação) e o que fez; e as confusões observadas: a confusão da alternativa errada escolhida (o diagnóstico e as questões do módulo guardam a `confusao` de cada alternativa; o código a procura pela questão), com os ids dos eventos.
- Onde mora: nunca no repositório nem na pasta de dados. A derivação sai sob demanda e fica em cache em %LOCALAPPDATA%\estudos-app\aprendiz\indicadores.json, com a posição do último evento lido; um evento novo atualiza só o que mudou; se o cache sumir, refaz tudo.
- Interface (nesta parte, só leitura): a aba Indicadores da tela do aprendiz, com a lista de conceitos (nome do mapa, domínio, acertos e erros, sessões, calibração, o que disse e o que fez, e as confusões com a evidência). Sem hipóteses ainda.
- Testes: puros (BKT com sequências conhecidas, decaimento, Brier, evento de matéria apagada, cache refeito igual) e DOM da aba.


## 3. Parte B: hipóteses (camada 3) e o agente de reflexão

- Arquivo: aprendiz/hipoteses.json, gravado inteiro e legível. Cada hipótese: id, tipo (conhecimento, misconception, vocabulário, preferência de forma, ritmo, metacognição), escopo (global, matéria ou conceito, com os ids), enunciado, evidências a favor e contra (ids de eventos), confiança (baixa, média, alta, calculada pelo código: baixa com menos de 3 eventos a favor ou 1 sessão; média com 3 ou mais eventos em 2 ou mais sessões; alta com 5 ou mais eventos em 3 ou mais sessões), criada em, última confirmação, validade, status (proposta, aprovada, rejeitada, expirada), aprovada pelo usuário e versão. Exemplo bom: "Em tokenização, confunde remover pontuação com remover ruído; 3 eventos em 2 sessões". Proibido: "é um aprendiz visual" e elogios genéricos.
- Regras de manutenção, do código: evidência contra que passa a favor nas ocorrências recentes volta a hipótese para "proposta" e leva à revisão; evidências de preferência perdem peso com meia-vida de 30 dias; sem confirmação recente a hipótese expira; nada é sobrescrito em silêncio (cada mudança é um evento e uma versão nova da hipótese).
- O agente de reflexão: uma chamada ao modelo (GPT-6.1 Sol, prompts/reflexao.md, temperatura 0, prompt e chamada separados do professor e do corretor). Entrada: os eventos novos desde a última reflexão (sem `autoavaliou_conceito` como verdade: ele vem rotulado "o que o aluno disse"), as hipóteses atuais e os indicadores. Saída em JSON: propostas de criar, reforçar, enfraquecer ou expirar, cada uma com os ids de eventos. O código descarta a proposta sem evidência citada, com id que não existe, com enunciado genérico (lista de elogios e rótulos proibidos) ou sem 2 eventos de sessões diferentes (um sinal isolado é evidência fraca). O LLM não decide a confiança.
- Gatilhos (decisão do Breno): o botão "Refletir" na tela do aprendiz, ao concluir um módulo (junto do relatório do método) e ao enviar o questionário de fim de lição. Uma reflexão por vez, com a mesma trava da extensão. Sem eventos novos desde a última, não chama o modelo.
- A tela do aprendiz (rota aprendiz/<aba>[/<matéria>], aberta por um botão na tela de cadernos): abas Hipóteses (as propostas primeiro, cada uma com Aprovar, Editar e Rejeitar, a evidência a favor e contra com link para o evento, e o diff do que a reflexão mudou), Indicadores (parte A) e Histórico (a linha do tempo dos eventos do aprendiz). O perfil é aberto: o Breno edita o enunciado e o status de qualquer hipótese (cada edição é um evento).
- Eventos (aprendiz/eventos.jsonl): `refletiu` (quantos eventos leu, quantas propostas, custo), `propos_hipotese`, `reforcou_hipotese`, `enfraqueceu_hipotese`, `aprovou_hipotese`, `rejeitou_hipotese`, `editou_hipotese`, `expirou_hipotese`, todos com a sessão e os ids de evidência.
- A extensão: extensions/aprendiz.ts (ponte "aprendiz", a única que grava o hipoteses.json, numa trava só, como a das regras de escrita) e as ferramentas só de leitura `ler_perfil_aprendiz` (hipóteses aprovadas) para o professor.


## 4. Parte C: o resumo injetado (camada 4) e desligar o perfil

- O resumo é montado pelo código (não por modelo) a partir das hipóteses APROVADAS e relevantes para o conceito ou a matéria em foco, ponderadas por recência e confiança, mais o domínio do conceito (parte A): o nível, as confusões ativas, os termos que domina e os que não. Algumas centenas de tokens, com prioridades explícitas. O texto de cada versão fica em aprendiz/perfil/v<N>.md (e perfil-atual.md aponta para a última); todo evento novo registra `contexto.versaoPerfil`.
- Onde entra: nas chamadas que geram lição e plano (junto da metodologia, hoje em lib/metodo-ciclo) e na conversa do professor, quando há uma aba em foco com conceitos. O hash do prompt passa a incluir a versão do perfil.
- Desligar o perfil por um período (9.6): um botão na tela do aprendiz grava em aprendiz/config.json `perfilDesligadoAte`; enquanto vale, nada é injetado e os eventos marcam `contexto.perfil: "desligado"`, para comparar depois.


## 5. Parte D: o score da sessão e as métricas (e o que falta para ele existir)

O score (9.4) é 0,5 x recuperação atrasada + 0,3 x ganho normalizado imediato + 0,2 x qualidade dissertativa, com os pesos e a meia-vida configuráveis, e reporta à parte a calibração (Brier) e o número de reexplicações por bloco, sem misturar no score.

Dois dos três componentes não têm de onde sair hoje, e "desenvolva" quer dizer construí-los:
- Ganho normalizado imediato: pede um mini pré-teste antes do bloco e um pós-teste depois. Muda a lição (docs/modulos.md, a metodologia de estrutura-da-lição e a tela do módulo): 1 a 2 perguntas rápidas antes de cada conceito novo, as mesmas variações depois. Grande.
- Recuperação atrasada: pede questões de revisão de conceitos de sessões anteriores. É a revisão espaçada (item 8), sem o FSRS no começo: uma sessão "Revisar" que sorteia questões de conceitos já vistos, em datas simples (por exemplo 2, 7 e 21 dias depois), e registra o resultado como evento de revisão. O FSRS entra depois por cima.
- Qualidade dissertativa: já existe (nota por rubrica; hoje só o corretor, sem a concordância do Breno).
Por isso a parte D se divide: D1, o motor do score (fórmula, pesos, componentes ausentes marcados e fora da média) e as métricas de tendência que já dá para calcular, com a tela; D2, as duas fontes novas (pré e pós-teste por bloco, e a sessão Revisar). A D2 é o maior pedaço e puxa o item 8; ela precisa de plano e aprovação próprios.


## 6. Pacotes e ordem

Cada parte tem plano e aprovação do Breno no app antes da próxima (como o item 5 e o 6). Dentro de cada uma, pacotes de arquivos disjuntos, Sonnet para implementar, Haiku para o mecânico e Opus só no que for mais arriscado e com o ok dele:
- A: lib/aprendiz-indicadores-tipos.ts, lib/aprendiz.ts (Sonnet), a tela da aba Indicadores e a rota (Sonnet).
- B: lib/hipoteses-tipos.ts e lib/hipoteses.ts, prompts/reflexao.md e a validação (Sonnet; o Opus revisa o prompt e a validação), extensions/aprendiz.ts (Sonnet), a tela de hipóteses (Sonnet).
- C: lib/perfil-injetado.ts, a injeção nas chamadas e a config (Sonnet).
- D1 e D2: planos próprios depois da C.


## 7. Parte A: contrato entre os pacotes (2026-11-11, aprovada pelo Breno)

Os tipos estão em profiles/estudos/lib/aprendiz-indicadores-tipos.ts (WP0). Dois pacotes de arquivos disjuntos, em paralelo, ambos Sonnet:
- WP1, o cálculo e a extensão: no mesmo arquivo de tipos, as funções puras (observações dos eventos, BKT, decaimento, Brier, ganho normalizado de Hake, confusões); lib/aprendiz.ts (leitura de aprendiz/eventos.jsonl e de aprendiz/config.json, matérias que existem, nomes do mapa, as confusões lidas do curso e do módulo, e o cache em %LOCALAPPDATA%\estudos-app\aprendiz\indicadores.json, com a pasta do cache como parâmetro); extensions/aprendiz.ts (a ponte) e os testes. A extensão não grava nada na pasta de dados nesta parte.
- WP2, a tela: a rota aprendiz/indicadores[/<matéria>], o botão na tela de cadernos (como o da Agenda), a aba Indicadores, o cliente da ponte (aprendiz-ponte.ts) e o registro do painel "aprendiz" (foraDaArea) no index do perfil.
- A ponte (painel "aprendiz", constante PAINEL_APRENDIZ): a tela manda `indicadores` ({}), a extensão responde com `interface:mostrar` (gravar: false) `indicadores` ({ indicadores: IndicadoresAprendiz }) ou `erro` ({ mensagem }). A extensão devolve todas as matérias; o filtro por matéria é da tela. A extensão só fala depois de session_start (regra de docs/ponte-de-eventos.md), como as outras.
- Sem aba Hipóteses nem Histórico nesta parte: a tela mostra só Indicadores (as outras abas entram na parte B, sem botão desligado no lugar).
