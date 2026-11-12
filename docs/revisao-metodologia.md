# Revisão independente da metodologia de ensino e do laço de retroalimentação

Data: 2026-11-12. Escopo: ESPECIFICACAO.md (seções 8, 9 e 13), docs/ (modulos, escrita, metodo-ciclo, metodo-experimentos, aprendiz, cursos, termos), profiles/estudos (AGENTS.md, skill teach, metodo/, prompts/, lib/ e extensions/modulos.ts) e os dados reais em `G:\Meu Drive\estudos-dados` (só leitura). Nenhum código e nenhum dado foi alterado. Este é o único arquivo criado.

Como ler as notas de confiança: **forte** (várias meta-análises ou ECRs concordam), **moderada** (há evidência boa, mas com heterogeneidade ou poucos estudos no contexto certo), **fraca** (poucos estudos, ou contexto distante do seu), **especulativa** (raciocínio meu, sem estudo direto). Nas referências, "conferida" quer dizer que eu busquei a fonte nesta revisão e li o resumo ou uma descrição dela; não li o texto integral de nenhum artigo. "De memória" quer dizer que é uma fonte clássica que eu cito sem ter buscado agora.

## Índice

0. Resumo em uma página
1. O objetivo e os conflitos entre objetivos
2. A base científica, item por item
3. O laço de retroalimentação
4. O modo de falar do professor
5. O que os seus dados mostram até agora
6. Propostas: manter, cortar, mudar, acrescentar e medir
7. Veredito
8. Referências

---

## 0. Resumo em uma página

1. **A especificação é melhor do que o que foi construído.** A seção 9 da ESPECIFICACAO.md escolhe as técnicas certas (recuperação, espaçamento, exemplos resolvidos com retirada gradual, nada de estilos de aprendizagem) e define o critério certo de sucesso (acerto em revisão atrasada, nunca "não pediu reexplicação"). Mas a ordem de construção inverteu isso: o que existe hoje é o laço de satisfação (Feedback Ruim/Bom/Ótimo, questionário de sliders, relatório, experimentos automáticos), e o que mede aprendizado (revisão atrasada, avaliação do módulo no dia seguinte, revisão espaçada) não existe e foi empurrado para depois na decisão 13.19.
2. **O app hoje não mede aprendizado.** Toda questão é respondida minutos depois da explicação, com o texto na mesma tela. Isso mede compreensão imediata, que a literatura trata como desempenho, não como aprendizado (Soderstrom e Bjork, 2015). Confiança: forte.
3. **O laço de experimentos não tem validade estatística e não vai ter.** Um aluno, cerca de 10 questões por módulo, módulos de conteúdo diferente, até 2 experimentos juntos, a base mudando por baixo (os prompts do repositório mudam toda semana), e a decisão tomada por um LLM olhando médias com n de 3 a 10. Para detectar uma diferença de 60 % para 80 % de acerto seriam necessárias cerca de 80 questões por braço, ou seja, uns 16 módulos para um único experimento. O código exige 2 módulos para "manter". Confiança: forte (é aritmética).
4. **O risco real é otimizar para o que agrada.** O placar mistura acerto imediato com notas de satisfação, e o prompt da análise diz que o feedback do aluno "é o sinal mais forte". A literatura mostra que a sensação de aprender e o aprendizado medido andam soltos e às vezes em sentidos opostos (Deslauriers et al., 2019; Kornell e Bjork, 2008; Carpenter et al., 2013). Confiança: forte para o fenômeno, moderada para o tamanho dele no seu caso.
5. **A proporção explicação/prática está invertida.** `estrutura-da-licao.md` exige pelo menos 70 % dos caracteres em explicação e afirma que "Questão a mais não ensina: o que ensina é a explicação". Essa frase contradiz a parte mais sólida da ciência da aprendizagem. No m2, a primeira lição tem 13,5 mil caracteres de explicação e 4 questões.
6. **Os seus dados reais são um dia de estudo.** 108 eventos, dos quais 79 são autoavaliações do diagnóstico. Um módulo concluído (m1, 2 lições, 11 questões, em 2026-11-03). O m2 foi gerado e nunca respondido. Não há regras de escrita, notas por bloco nem hipóteses gravadas. Com isso não dá para dizer se o laço funciona. Dá para dizer que há muito mais máquina do que dado.
7. **O que fazer primeiro:** medir retenção atrasada (questões de lições antigas no começo de cada lição nova e um teste do módulo com 7 dias ou mais), inverter a proporção de prática, parar a decisão automática dos experimentos, e estudar. As propostas estão ordenadas na seção 6.

---

## 1. O objetivo e os conflitos entre objetivos

### 1.1 O objetivo, com as minhas palavras

O sistema quer que **um adulto, sozinho, aprenda Ciência de Dados com entendimento que dure**: saber de onde cada ideia vem, conseguir explicá-la e aplicá-la a um caso novo. O meio é um curso gerado sob demanda a partir dos materiais dele (ou de um tema), por um professor que (a) escreve do jeito que ele consegue ler, (b) ajusta o nível ao que ele já sabe e (c) melhora a própria forma de ensinar a partir do retorno dele.

O desenho é para um aprendiz só, sem turma, sem professor humano e, a partir de dezembro de 2026, sem prova nem prazo. Isso muda três coisas em relação à literatura, que é quase toda feita com turmas: não há comparação com outros alunos, a motivação vem só dele, e ninguém de fora confere se ele aprendeu.

### 1.2 Conflitos que eu encontrei

| # | Conflito | Onde aparece | Por que importa |
|---|---|---|---|
| 1 | **Agradar × ensinar.** | O placar (`docs/metodo-experimentos.md`, "O placar") soma acerto imediato com notas de questionário e de bloco. O `prompts/relatorio-metodo.md` diz que o Feedback do bloco "É o sinal mais forte, e o texto dele vale mais que qualquer outro". | A própria especificação (9.5) proíbe usar "não pediu reexplicação" como recompensa. O ciclo do método faz o equivalente com outro nome. |
| 2 | **"Entender, não decorar" × nenhuma retenção medida.** | A skill teach promete conhecimento que "não apodrece". Nada no app volta a um conceito depois da lição. | Entendimento sem recuperação posterior também se perde. Sem medir, a promessa não pode ser conferida. |
| 3 | **Curso para prova × estudo livre.** | O único curso real tem prazo (2026-11-05), escopo "só o material" e motivo "atividade presencial". A decisão 13.19 diz que o fluxo não gira mais em torno de provas. | O método foi calibrado num caso (estudar um notebook para uma atividade) que não é o caso de uso a partir de dezembro. |
| 4 | **Autonomia sem cobrança × espaçamento.** | 13.19 recusa a tela "Hoje" e deixa a revisão espaçada como "opção discreta, sem fila diária". | A decisão é legítima (cobrança afasta), mas a revisão espaçada é a técnica de maior retorno e ficou sem lugar. Há formas de fazê-la sem fila (seção 6). |
| 5 | **O que muda o ensino não pede aprovação; o que só descreve o aluno pede.** | 13.17: experimentos entram sozinhos. Camada 3: hipóteses pedem aprovação. | A proporção está invertida: o canal com mais poder (reescreve a metodologia de todas as lições futuras) tem a barra mais baixa. |
| 6 | **Construir o app × estudar com ele.** | 1.600 testes automatizados e 5 sessões de estudo, das quais uma era de uma matéria de teste. | Não é crítica moral. É uma restrição de medida: o laço só aprende com uso, e o uso ainda não existe. |
| 7 | **"Um sinal isolado é evidência fraca" × canais que aceitam um sinal.** | A regra vale para hipóteses (2 eventos em 2 sessões). Um aprendizado do método entra com 1 evento e já vai para as gerações (`metodo-aprendizados-tipos.ts`, os `observado` entram). Uma regra de escrita nasce de um comentário e vale para sempre, acima da metodologia. Um bloco é reescrito com um clique. | A salvaguarda existe só no canal que menos influencia o ensino. |

---

## 2. A base científica, item por item

A tabela resume. Os detalhes vêm depois.

| Elemento do desenho | O que a literatura diz | Força | O app faz de verdade? |
|---|---|---|---|
| Prática de recuperação (responder sem consultar) | Efeito médio e robusto, em laboratório e em sala (g ≈ 0,50). Maior com feedback e com mais repetições. | Forte | Em parte. Há questões, mas poucas, imediatas e com o texto na tela. |
| Espaçamento | Um dos efeitos mais replicados. O intervalo ótimo cresce com o prazo em que se quer lembrar. | Forte | Não. Nada volta. |
| Intercalação | Efeito médio (g ≈ 0,42), forte quando é preciso escolher entre categorias parecidas; fraco ou nulo em textos expositivos. | Moderada | Não. |
| Exemplos resolvidos para iniciantes | Efeito médio (g ≈ 0,48 em matemática). | Forte para iniciantes | Sim. |
| Reversão da expertise (retirar o apoio conforme sabe) | Confirmada em meta-análise recente; mais forte em adultos. | Moderada a forte | No papel. Na prática o nível vem só do diagnóstico e nunca muda: 100 % dos exemplos do m1 e do m2 são `exemplo_resolvido`. |
| Auto-explicação | Efeito médio (g ≈ 0,55), mas misturado com tempo de tarefa; em exemplos de matemática, os prompts de auto-explicação não ajudaram. | Moderada | Em parte (dissertativas e perguntas de "por quê"). |
| Feedback no nível da tarefa, sem elogio | Efeito médio (d ≈ 0,48), muito heterogêneo; um terço das intervenções piora o desempenho, sobretudo as que apontam para a pessoa. | Forte para "sem elogio"; moderada para o resto | Sim, e bem feito. |
| Dica antes da resposta | Coerente com os resultados de tutores de IA com e sem trava. | Moderada | Em parte. O quiz dá pista; "Não sei" entrega tudo de uma vez. |
| Dificuldades desejáveis | Conceito sólido, com limites: a dificuldade tem de ser superável. | Moderada | O laço de feedback trabalha contra (seção 3). |
| Confiança antes de responder | Útil para calibração e para corrigir erros de alta confiança. | Moderada | Sim. |
| Não adaptar a estilos de aprendizagem | Sem evidência a favor dos estilos. | Forte | Sim, e proibido no código. |
| Adaptar ao conhecimento prévio | É o tipo de adaptação com melhor apoio. | Forte | Só no diagnóstico inicial, baseado quase todo em autoavaliação. |
| Tutoria um a um vale "2 sigma" | Não. O efeito realista é de 0,3 a 0,8. | Forte (contra o mito) | A especificação cita VanLehn corretamente. |
| Tutor de LLM | Resultados nos dois sentidos: ganho grande com tutor bem desenhado; perda quando o aluno recebe a resposta. Quase nenhum estudo com retenção de longo prazo. | Fraca a moderada | O desenho segue o lado certo (dica, questão respondida de verdade). |
| "Verdades incondicionais primeiro" | Sem estudo direto. Parentes próximos têm apoio modesto. | Fraca | Sim. |
| "Como eu poderia ter descoberto isso?" | A versão em que o aluno tenta antes tem apoio; a versão narrada é só uma boa explicação. | Moderada / fraca | Só a versão narrada chegou aos módulos. |
| BKT com parâmetros fixos | Modelo clássico, mas fica atrás de alternativas simples e não modela esquecimento. | Moderada (contra o uso aqui) | Sim. |
| FSRS | Bom para cartões com muitas revisões. Sem evidência para questões conceituais geradas por LLM. | Fraca para este uso | Não (adiado). |
| Bandit de estratégias | Viável com milhares de alunos. Com um, não converge. | Forte (contra o uso aqui) | Não (planejado). |

### 2.1 Recuperação e teste

Responder de memória melhora a retenção mais do que reler. Meta-análises: Rowland (2014), g = 0,50, e maior quando o teste final vem depois de mais de um dia; Adesope et al. (2017), g ≈ 0,61 a 0,70; Yang et al. (2021), 222 estudos em sala de aula, g = 0,499, com efeito maior quando há feedback corretivo e mais repetições. Dunlosky et al. (2013) classificam teste prático e prática distribuída como as duas técnicas de "alta utilidade", e releitura, grifar e resumir como "baixa". O efeito também transfere para questões diferentes das praticadas (Pan e Rickard, 2018, d ≈ 0,40), mas só sob certas condições: feedback elaborado e questões que pedem aplicação, não só o fato. Confiança: forte.

Dois detalhes que tocam o seu desenho:
- **Texto na tela.** Agarwal et al. (2008) compararam teste com e sem consulta: com consulta o acerto imediato é maior, e no teste atrasado (1 semana) os dois empatam, ambos acima de reler. Então responder com a explicação visível não anula o benefício, desde que a resposta não seja cópia de uma frase. Confiança: moderada.
- **Quantidade.** O benefício cresce com o número de recuperações. Poucas questões, uma vez só, logo depois do texto, é a forma mais fraca de usar a técnica.

### 2.2 Espaçamento

Cepeda et al. (2006, 2008): repetir com intervalo é melhor do que repetir junto, e o intervalo ótimo é da ordem de 10 % a 20 % do prazo em que se quer lembrar (para lembrar em um mês, rever uns 11 dias depois; para uma semana, 1 dia). Rawson e Dunlosky (2022) juntam as duas coisas em "reaprendizado sucessivo" (recuperar até acertar, em sessões espaçadas): três sessões mantêm o conhecimento uma semana depois num nível que uma sessão única não chega perto; em procedimentos de matemática o ganho foi pequeno (d ≈ 0,28). Confiança: forte para o efeito, moderada para o tamanho em material conceitual complexo.

### 2.3 Intercalação

Brunmair e Richter (2019): g = 0,42 no geral, maior quando as categorias se parecem entre si (é preciso decidir qual é qual) e fraco ou negativo em textos expositivos e palavras. Rohrer et al. (2020), ECR em 54 turmas de matemática: 61 % contra 38 % num teste surpresa um mês depois (d = 0,83), com a ressalva de que as tarefas intercaladas levaram mais tempo. Para Ciência de Dados isso se aplica bem a decisões do tipo "qual métrica, qual modelo, qual validação para este caso", e mal à leitura de explicações. Confiança: moderada.

### 2.4 Exemplos resolvidos e reversão da expertise

Barbieri et al. (2023), 55 estudos: g = 0,48 a favor de exemplos resolvidos em matemática. Dois achados dessa meta-análise contrariam o senso comum: prompts de auto-explicação junto do exemplo **reduziram** o efeito, e exemplos corretos sozinhos foram melhores do que misturados com exemplos errados. Kalyuga et al. (2003) descrevem a reversão: o que ajuda o iniciante atrapalha quem já sabe. Tetzlaff et al. (2025) confirmam em 60 estudos e apontam que o efeito é mais forte em adultos. A recomendação prática da área é o "fading": exemplo completo, depois exemplo com passos a completar, depois problema (Renkl e Atkinson, 2003), e alternar exemplo e problema parecido, em vez de vários exemplos seguidos. Confiança: forte para iniciantes, moderada para a regra de três níveis.

O que isso diz do seu desenho: a regra iniciante/intermediário/domina é correta. O problema é a entrada dela. O nível vem do diagnóstico (79 autoavaliações, 60 e poucas com "nunca vi", e 7 questões para 73 conceitos) e não é atualizado pelo desempenho. Resultado: todo exemplo dos dois módulos gerados é `exemplo_resolvido`. A parte adaptativa do método está desligada na prática.

### 2.5 Auto-explicação

Bisra et al. (2018), 64 estudos: g = 0,55. Parte do efeito pode ser tempo de tarefa. E vale a ressalva de Barbieri acima. As suas dissertativas e as perguntas de "por quê" são uma forma razoável de auto-explicação. Confiança: moderada.

### 2.6 Feedback

Kluger e DeNisi (1996): em média o feedback ajuda (d ≈ 0,41), mas mais de um terço das intervenções piorou o desempenho, em especial quando o feedback desloca a atenção da tarefa para a pessoa (elogio, comparação). Hattie e Timperley (2007) distinguem feedback sobre a tarefa, o processo, a autorregulação e a pessoa, e o último é o menos útil. Wisniewski, Zierer e Hattie (2020) refizeram a conta em 435 estudos: d = 0,48, com heterogeneidade grande, e o que mais pesa é quanta informação o feedback traz. Confiança: forte para "não elogie a pessoa"; moderada para o resto.

As suas regras ("Não elogie", "Corrigir um erro dele é direto", o retorno do `verificacao.md` que diz o que está certo e o que falta sem entregar a resposta, a correção por rubrica com trechos antes dos pontos) estão alinhadas com isso. É a parte mais bem fundamentada do modo de falar.

### 2.7 Carga cognitiva e dificuldades desejáveis

A teoria da carga cognitiva sustenta exemplos resolvidos, um termo novo por vez, segmentar e explicar termos antes (o "pré-treino" de Mayer). Ela é criticada por ser difícil de medir e de refutar, mas as recomendações práticas se sustentam por estudos próprios. Confiança: moderada.

As "dificuldades desejáveis" (Bjork e Bjork, 2011) são o contrapeso: espaçar, intercalar, testar e gerar tornam o estudo mais lento e mais desconfortável agora e melhoram a retenção depois. Soderstrom e Bjork (2015) é a revisão central: **desempenho durante o estudo e aprendizado são coisas diferentes, e condições que melhoram um podem piorar o outro**. Limite importante: a dificuldade só é desejável se o aluno consegue superá-la; para um iniciante sem base, é só dificuldade. Confiança: moderada a forte.

### 2.8 Ilusão de aprendizado e calibração

- Deslauriers et al. (2019, PNAS): alunos de física, sorteados entre aula expositiva polida e aula ativa com o mesmo conteúdo, aprenderam mais na ativa e **acharam** que aprenderam menos. Os autores avisam que avaliar o ensino pela percepção do aluno pode favorecer o método pior.
- Kornell e Bjork (2008): mais de 80 % dos participantes julgaram o estudo em bloco igual ou melhor do que o espaçado, mesmo depois de irem melhor no espaçado.
- Carpenter et al. (2013): um professor fluente aumenta a percepção de aprendizado sem aumentar o aprendizado.
- Uttl et al. (2017): em 97 estudos com várias turmas da mesma disciplina, a correlação entre a avaliação que os alunos dão ao professor e o quanto aprendem é praticamente zero.

Confiança: forte para a direção (percepção e aprendizado se descolam), moderada para o tamanho. Uma ressalva honesta: esses estudos são de turmas e de aulas, não de um adulto que escolheu estudar e que desenhou a própria ferramenta. Você tem mais informação sobre si do que um calouro. Mas o mecanismo (esforço é lido como "não estou aprendendo"; fluência é lida como "entendi") é geral.

### 2.9 Tutoria um a um

Bloom (1984) relatou 2 desvios-padrão. VanLehn (2011) revisou os estudos e encontrou d ≈ 0,79 para tutores humanos e 0,76 para sistemas que acompanham passo a passo. Von Hippel (2024) mostra que os 2 sigma vinham de tutoria combinada com mastery learning, em teses pequenas, e que revisões amplas dão cerca de 0,33. Confiança: forte. Conclusão prática: um bom tutor vale muito, mas o ganho vem de o aluno fazer e ser corrigido passo a passo, não de receber explicações melhores.

### 2.10 Tutores de IA e LLM

- Bastani et al. (2025, PNAS), cerca de mil alunos de matemática: com um ChatGPT comum, 48 % melhor na prática e **17 % pior** na prova sem a ferramenta; com um tutor com travas (dica, sem resposta), 127 % melhor na prática e empate com o controle na prova. A maioria dos alunos do ChatGPT comum só pedia a resposta. Atenção: mesmo o tutor bom **não** melhorou a prova; só não piorou.
- Kestin et al. (2025, Scientific Reports), 194 alunos de física em Harvard, desenho cruzado: o tutor de IA estruturado superou a aula ativa (0,63 DP, de 0,73 a 1,3 pela regressão quantílica). Limites: uma semana por condição, teste logo depois, sem retenção.
- Fan et al. (2024): com ChatGPT a redação melhorou e o ganho de conhecimento e a transferência não ("preguiça metacognitiva").
- Barcaui (2025): teste surpresa 45 dias depois, 57,5 % com ChatGPT livre contra 68,5 % sem (d = 0,68). Amostra pequena, 30 % de abandono.
- Meta-análises de 2025 relatam efeitos grandes do ChatGPT no desempenho (g perto de 0,87), mas são criticadas por juntar estudos curtos, com controles não comparáveis e medidas imediatas. Eu não daria peso a esse número.
- Sycophancy em contexto de ensino: Arvin (2025) mostra que modelos mudam a resposta certa quando o "aluno" sugere uma errada (até 15 pontos de queda nos modelos menores).

Confiança no conjunto: fraca a moderada. O que é sólido: receber a resposta pronta prejudica; tutor com dica e estrutura ajuda no curto prazo. O que ninguém sabe ainda: se um tutor de LLM melhora retenção de meses.

### 2.11 Estilos de aprendizagem × conhecimento prévio

Pashler et al. (2008): não há evidência aceitável de que ensinar conforme o "estilo" melhore o aprendizado. A seção 9.1 e a lista de rótulos proibidos em `hipoteses-tipos.ts` estão corretas. O tipo de hipótese `preferencia_de_forma` é a porta pela qual a mesma ideia pode voltar com outro nome ("vai melhor com exemplos de código"). O prompt da reflexão a mantém contextual, o que é o cuidado certo, mas eu não a deixaria influenciar a geração sem um resultado de retenção por trás. Confiança: forte.

### 2.12 Rastreamento de conhecimento (BKT, DKT, FSRS)

- BKT (Corbett e Anderson, 1994) é um modelo de dois estados por habilidade. Sem parâmetros ajustados, é uma média ponderada com nome bonito. Com os seus padrões (início 0,3, chute 0,2, deslize 0,1, aprendizado 0,15), **uma** resposta certa leva o domínio de 0,30 para 0,71 e uma errada para 0,19. E o BKT não esquece: um conceito acertado em novembro continua "dominado" em março.
- Khajah et al. (2016): o ganho do DKT sobre o BKT some quando o BKT ganha esquecimento e outros ajustes. Gervet et al. (2020): em 9 bases reais, regressão logística com boas variáveis ganha nas bases pequenas e médias, e o BKT fica atrás. Todos esses modelos são avaliados em milhares de alunos.
- FSRS: no benchmark aberto (cerca de 10 mil coleções do Anki) prevê a lembrança melhor do que o SM-2. A comparação é contestada pela SuperMemo. O ponto para você: o FSRS modela a memória de **um cartão idêntico** revisto muitas vezes. Uma questão conceitual nova a cada revisão, corrigida por LLM, não é esse objeto.

Confiança: moderada. Para um único aluno com 1 ou 2 observações por conceito, nenhum desses modelos acrescenta informação sobre "acertou as últimas vezes?" e "há quantos dias?".

---

## 3. O laço de retroalimentação

### 3.1 O que o laço mede: satisfação ou aprendizado?

Classifiquei cada sinal que entra no placar e na análise:

| Sinal | O que mede | Serve para decidir o método? |
|---|---|---|
| Feedback Ruim/Bom/Ótimo por bloco, motivos, texto | Percepção de qualidade do texto | Só para defeitos objetivos (erro, termo sem explicação, passo que falta) |
| Questionário: "sente que entendeu?", clareza, exemplos, "as questões ajudaram a fixar?", ritmo | Julgamento de aprendizado feito na hora, fluência e conforto | Não. O ritmo nem tem direção (rápido ou lento demais) |
| Quiz, pergunta e dissertativa na 1ª tentativa | Compreensão imediata, com o texto na tela | Fraco. É desempenho, não aprendizado |
| "Não sabia" | Desistência imediata | Sinal útil de desalinhamento entre explicação e questão |
| Pedidos de explicação, termos guardados | Atrito de leitura | Ambíguo: pedir explicação é comportamento bom (a especificação diz isso em 9.4) |
| Brier | Calibração imediata | Útil, mas com n pequeno |
| Retenção atrasada, transferência | Aprendizado | **Não existe no app** |

Então, hoje, o laço otimiza uma mistura de satisfação com acerto imediato. O risco de otimizar para o que agrada é concreto, por três caminhos que já estão no código:

1. **Reescrita de bloco por "difícil demais".** O `modulo-bloco.md` manda, para `nivel_errado`, "desça": trocar o problema por exemplo resolvido e, numa questão, "uma situação mais direta". É um botão que remove dificuldade a pedido de quem está sentindo a dificuldade.
2. **A resposta à reclamação de "questões repetitivas".** A reclamação era de qualidade (várias questões cobrando a mesma operação). A resposta estrutural, em 2026-10-28, foi cortar quantidade e fixar 70 % de explicação.
3. **Aprendizados.** "O que facilita para o Breno" é definido por notas de entendimento sentido. O exemplo do próprio documento é "Exemplos concretos antes da definição deixaram o entendimento mais alto". Isso mede o que parece fácil, e entra em toda geração seguinte.

Uma ressalva a seu favor: o que você escreveu nos dois questionários do m1 **não** é pedido de facilidade. Você pediu o porquê das coisas, transição entre ideias e uma dissertativa que juntasse o fluxo inteiro. São pedidos de coerência, que a literatura apoia. O problema não é o seu feedback. É o sistema tratar nota de satisfação como medida de resultado e agir sozinho sobre ela.

O feedback do aluno é bom para uma coisa: **achar defeitos** (erro de conteúdo, termo usado antes de explicado, salto de passo, questão que cobra o que não foi ensinado). Para isso, um único relato basta e a correção é local. Ele é ruim para outra: **escolher entre métodos de ensino**. Para isso, só o resultado atrasado serve. Confiança: forte.

### 3.2 A estatística do laço

Confundidores, do mais grave ao menos:

1. **Conteúdo e dificuldade diferentes a cada módulo.** O documento reconhece ("Um módulo só é evidência fraca"), mas a única defesa é pedir ao LLM que "lembre" disso.
2. **A base muda por baixo.** O m1 foi gerado em 2026-10-27, antes do esquema novo da lição (2026-10-28). O m2 foi gerado depois, com o esquema novo **e** com os 2 experimentos. Qualquer diferença entre m1 e m2 tem três causas possíveis misturadas, e a análise só enxerga os experimentos. Como o repositório muda os prompts e a metodologia toda semana, isso vai se repetir.
3. **Dois experimentos ao mesmo tempo**, nos mesmos módulos. O limite de 2 foi posto "para dar para saber o que causou uma melhora", mas com os dois valendo nas mesmas lições não dá para separar um do outro.
4. **Sem cegamento.** Você sabe o que mudou (aparece no relatório) e é você quem dá as notas.
5. **Tendência no tempo.** Você aprende a usar o app, o assunto encadeia, o humor do dia varia. Comparar "antes" com "depois" atribui tudo isso ao experimento.
6. **O juiz é parte.** O mesmo modelo que escreve as lições ("Você é o professor") decide se os próprios ajustes funcionaram, lendo uma tabela.
7. **Catraca.** `manter` torna o ajuste regra permanente; o prompt diz "Não contrarie um ajuste mantido". Não existe caminho de volta. `descartar` pode acontecer com 1 módulo. O conjunto de regras só cresce ou troca, nunca é reavaliado.
8. **Regressão à média.** Um experimento nasce depois de um módulo ruim. O módulo seguinte tende a ser melhor de qualquer jeito.

Ruído, em números:

- Um módulo tem de 3 a 4 quizzes. 3 acertos em 4 dá um intervalo de 95 % de **30 % a 95 %** (Wilson).
- Para distinguir 60 % de 80 % de acerto com 80 % de poder são necessárias cerca de **81 questões por braço**. Com 10 questões por módulo, são uns 8 módulos com o experimento e 8 sem, **para um experimento**, supondo módulos de dificuldade igual, o que é falso.
- No questionário (escala de 1 a 5, desvio perto de 1), detectar 1 ponto inteiro de diferença pede umas 16 lições por braço.
- A regra do código para `manter`: o experimento valeu em **2 módulos**.

Conclusão: a análise automática vai decidir sobre ruído. Ela vai produzir justificativas com números ("2,0 de 5 antes, 3,5 depois") que parecem evidência e não são. Isso é pior do que não ter análise, porque dá aparência de método a uma caminhada aleatória guiada por satisfação. Confiança: forte.

#### O que seria um desenho N-de-1 válido aqui

Os padrões de pesquisa de caso único (What Works Clearinghouse) pedem pelo menos 3 demonstrações do efeito e de 3 a 5 medidas por fase num desenho ABAB; desenhos de tratamentos alternados aceitam 1 ou 2 medidas por alternância, desde que haja muitas alternâncias e sorteio. Traduzindo para o app:

| Desenho | Como seria | Viável? |
|---|---|---|
| ABAB por módulo | 2 módulos sem, 2 com, 2 sem, 2 com, cada fase com várias lições | Não. 8 módulos por experimento, e o conteúdo muda entre as fases. |
| Sorteio por lição dentro do módulo | O código sorteia, em cada módulo, quais lições recebem a variante. Compara-se dentro do módulo. | Fraco. 2 ou 3 lições por módulo; uma lição é uma unidade grande e desigual. |
| **Sorteio por conceito dentro da lição** | Para cada conceito, o código sorteia A ou B (por exemplo, com ou sem pergunta antes da explicação). Você não é avisado de qual é qual. O desfecho é o acerto na questão atrasada daquele conceito, 7 dias ou mais depois. A análise é um teste de aleatorização pareado por lição, feito pelo código. | **Sim, é o único que eu recomendo.** Uns 6 conceitos por módulo dão cerca de 70 em 12 módulos. Detecta só efeitos grandes (uns 25 pontos percentuais). |
| Cruzado app × sem app | Um módulo pelo app, o seguinte do seu jeito de sempre, mesmo tipo de teste atrasado | Vale uma vez, como teste de sanidade do app inteiro. |

Condições para qualquer um deles valer:
- **Um fator por vez**, e um fator que a literatura já sugere (não uma frase de estilo).
- **Pré-registro simples**: um arquivo `aprendiz/experimentos/<id>.md` escrito antes, com a hipótese, a unidade sorteada, o desfecho, o número de unidades e a regra de parada. A análise roda só quando o número for atingido.
- **Base congelada** durante o experimento: sem mexer nos prompts e na metodologia envolvidos.
- **Decisão do código**, por regra fixa, e não de um LLM.

Sendo franco: mesmo o desenho bom leva meses por resposta e só enxerga efeitos grandes. Para um único aluno, **a literatura é um prior muito melhor do que os seus próprios experimentos**. Eu aplicaria direto o que tem evidência forte e reservaria o experimento N-de-1 para uma ou duas perguntas em que você realmente tem dúvida.

### 3.3 Os desfechos

| Desfecho | O que é | O app mede hoje? |
|---|---|---|
| **Primário: retenção atrasada** | Acerto sem ajuda, em questões novas sobre o mesmo conceito, 7 dias ou mais depois | Não |
| Secundário: transferência | Resolver um problema que a lição não mostrou (outros dados, outra pergunta, um caso real) | Não. As questões usam "outros números", que é transferência bem próxima |
| Secundário: calibração | Diferença entre a confiança marcada e o acerto, nas questões atrasadas | Em parte: há Brier, só sobre questões imediatas |
| Processo: dose | Sessões por semana, minutos, questões respondidas | Dá para tirar dos eventos; ninguém olha |
| Guarda: satisfação | Notas e texto | Sim, e hoje ocupa o lugar do desfecho primário |

A especificação já tinha isso certo: 8.5 (avaliação do módulo a partir do dia seguinte, com variações), 9.4 (0,5 do score é recuperação atrasada) e 9.6 (acerto na primeira revisão atrasada). Nada disso foi construído, e a 13.19 decidiu que "nada novo é construído sobre" o intervalo de um dia. Essa é a decisão que eu mais questiono no projeto.

### 3.4 A memória do aprendiz em quatro camadas

Proporcional a um aluno? Não. É uma arquitetura de sistema de tutoria para milhares de alunos, aplicada a um.

| Peça | Melhora o ensino? | Meu juízo |
|---|---|---|
| Camada 1, eventos só de acréscimo com contexto (prompt, modelo, versão) | Sim, é a base de qualquer medida | **Manter.** É o melhor ativo do projeto. |
| Confusão marcada em cada alternativa errada | Sim: diz qual ideia errada apareceu | **Manter e usar mais** (voltar a ela na retomada). |
| Nível do conceito para escolher o formato | Sim, se for atualizado pelo desempenho | **Mudar**: hoje é fixo no diagnóstico. |
| BKT com parâmetros fixos | Não acrescenta nada sobre "últimos resultados e há quanto tempo" e não esquece | **Trocar** por uma tabela simples. |
| Decaimento com meia-vida de 30 dias, ganho normalizado, Brier por conceito | Não. Com 1 ou 2 observações por conceito são números sem sentido | **Cortar.** Brier só global. |
| Hipóteses com aprovação (camada 3) | Parte sim: misconceptions repetidas. O resto (ritmo, preferência de forma) é fraco | **Simplificar**: uma lista curta e editável. |
| Confiança baixa/média/alta, validade de 60 dias, conflito, versões, expiração | Não. É contabilidade | **Cortar** ou congelar. |
| Agente de reflexão por LLM | Marginal. A parte útil (achar confusão repetida) o código já faz contando as `confusao` | **Reduzir** a uma chamada ao concluir o módulo, ou cortar. |
| Resumo injetado (camada 4) | Sim, se levar 3 coisas: nível, confusões ativas, termos já explicados | **Construir pequeno**, direto dos indicadores, sem depender da camada 3. |
| Score 0,5/0,3/0,2 | Não. Um número composto com pesos arbitrários esconde o que importa | **Cortar.** Mostrar os componentes separados. |
| Pré e pós-teste por bloco para o ganho de Hake (parte D2) | Não. Ganho imediato é desempenho | **Cortar do plano.** |
| Bandit (9.5) | Não converge com um aluno e recompensa atrasada | **Cortar do plano.** |
| Coleta para DPO (9.8) | Sem perspectiva real de uso | **Cortar do plano.** Os eventos já guardam o necessário. |
| "Desligar o perfil e comparar" (9.6) | A intenção é certa, mas a comparação cai nos mesmos problemas da seção 3.2 | Só como experimento pré-registrado. |

Um fato do próprio projeto que confirma a fragilidade: `docs/aprendiz.md` registra que a primeira reflexão real deu confiança "alta" a uma hipótese de metacognição porque a autoavaliação entrava na conta, e foi preciso um conserto à mão. Regras de contagem sobre meia dúzia de eventos quebram assim.

O que de fato melhora o ensino nessa área, em ordem: (1) saber o que ele errou e qual confusão foi, (2) voltar a isso dias depois, (3) tirar o apoio quando ele acerta. As três coisas saem dos eventos com regras de poucas linhas.

### 3.5 Riscos

| Risco | Como aparece aqui | Gravidade | O que fazer |
|---|---|---|---|
| **Otimizar para satisfação** | Seção 3.1 | Alta | Separar "defeito" de "método"; método só muda com dado atrasado |
| **Deriva** | Ajustes mantidos e regras de escrita só se acumulam (até 30 regras ativas, acima da metodologia). Em um ano o professor escreve conforme uma pilha de reações a módulos antigos | Alta | Teto pequeno (5 ajustes), revisão trimestral lendo todos de uma vez, toda regra com data de reavaliação |
| **Viés de confirmação** | O LLM recebe o experimento com o "porquê" de ele existir e procura números que o sustentem. Os aprendizados registrados entram no contexto da análise seguinte, que tende a "confirmá-los" | Alta | Decisão por regra do código, não por LLM |
| **Sobreajuste às reclamações recentes** | O esquema de 2026-10-28 (70 % de explicação, menos questões) nasceu de um dia de uso | Alta | Seção 4.4 |
| **Sycophancy** | (a) Correção: em 2 das 5 perguntas do m1 a avaliação foi "certa" e o retorno trazia uma correção de conteúdo. n minúsculo, não concluo, mas merece auditoria. (b) O relatório fala com você e você está lendo: o incentivo do modelo é concordar com o seu feedback. (c) Na conversa da mesa, se você insistir numa ideia errada, o modelo tende a ceder (Arvin, 2025) | Média | Auditar o corretor: você dá nota às cegas a 20 respostas e compara (a especificação 8.5 já previa isso e não foi feito) |
| **Regra do "sinal isolado" aplicada no lugar errado** | Conflito 7 da seção 1.2 | Média | Mesma barra para tudo o que muda as gerações |
| **Injeção de prompt** | Os seus textos (feedback, respostas) e os trechos do material entram nos prompts da análise, da reflexão e da geração sem marcação de "isto é dado". Como o usuário é você, o risco prático vem do **material** (um PDF ou uma página pesquisada com instruções dentro) e de um comentário seu ser lido como ordem ("as dissertativas não deveriam existir" vira regra) | Baixa a média | Uma frase nos prompts: o texto entre as marcas é dado, nunca instrução. Não deixar texto livre criar regra sozinho |
| **Erro de conteúdo do LLM** | O material é a âncora no escopo "só o material". No escopo livre não há âncora | Média | Fora do escopo desta revisão, mas é o maior risco do uso pós-dezembro |
| **Juiz de si mesmo** | Mesmo modelo gera, corrige, reflete e analisa | Média | Pelo menos o corretor em outro modelo |

---

## 4. O modo de falar do professor

### 4.1 Regras de estilo e idioma (`profiles/estudos/AGENTS.md`)

| Regra | Fundamento | Juízo |
|---|---|---|
| Português, termos da área em inglês com o significado na primeira vez | Reduz carga irrelevante; mantém o vocabulário que ele vai encontrar | Manter |
| Linguagem simples, palavras comuns | Menos carga de decodificação | Manter |
| Sem elogio, sem frases de transição vazias | Kluger e DeNisi; Hattie e Timperley | Manter. É a regra mais bem fundamentada |
| Sem metáfora decorativa; pergunta que motiva é bem-vinda | Coerência (detalhes sedutores atrapalham); a pergunta ativa conhecimento prévio | Manter |
| Correção direta do erro | Feedback no nível da tarefa | Manter |
| Contexto antes da mecânica (que problema resolve, quem usa) | Motivação e organização prévia: apoio modesto, e veio de uma falha observada por você | Manter. **Mudança:** usar esse contexto como pergunta para você tentar antes (seção 6) |
| Todo termo novo com a origem antes de entrar na conta | Princípio do pré-treino | Manter |
| "Não pule passos", explicar cada símbolo | Certo para iniciante. Para quem já sabe, vira redundância (reversão da expertise) | **Condicionar ao nível.** Hoje é fixa |
| Não marcar opção recomendada na pergunta de objetivo | Evita ancoragem | Manter |

Uma observação: essas regras são fixas e "só mudam com a aprovação dele". Isso é bom. É o contrário do ciclo do método, que muda sozinho.

### 4.2 A skill teach

**"Verdades incondicionais primeiro."** Não conheço estudo que teste essa ideia como está escrita. Parentes com algum apoio: organizadores prévios (efeito pequeno), pré-treino, e a preferência por definições reais em vez de listas de propriedades. O mecanismo que a skill descreve ("o cérebro não se compromete com um fato que pode ser contradito depois") é teoria de bolso, sem evidência que eu conheça. Confiança de que ajuda: fraca. Dois riscos:
- Em Estatística e aprendizado de máquina quase tudo é condicional ("em geral", "depende da métrica", "sob tais hipóteses"). A regra do `conceito.md` ("Se a frase precisa de 'em geral' ou 'quase sempre', ela ainda não é o ponto de partida") pode empurrar o modelo a fabricar universais falsos ou a esconder a condição. Eu trocaria por: comece pelo que é verdade por definição e diga a condição quando ela existir.
- A skill afirma "No other teaching methods come close" e que os princípios foram "personally verified to work for years". Ela veio de outro repositório (ORIGEM.md): quem verificou foi o autor original, não você. É uma afirmação forte demais para ficar no prompt de um sistema que você quer avaliar com honestidade.

**"Como eu poderia ter descoberto isso?"** Tem duas versões, e a evidência é diferente para cada uma:
- *Socrática* (o aluno tenta antes da revelação): é geração antes da instrução. Sinha e Kapur (2021), 53 estudos: g = 0,36 a favor de resolver antes de receber a explicação, até 0,58 quando o desenho é fiel; o efeito inverte para crianças pequenas. Pan e Carpenter (2023): perguntas antes do conteúdo costumam ajudar, mesmo quando a resposta sai errada. Confiança: moderada.
- *Expositiva* (o professor narra o caminho): é uma explicação bem motivada. É melhor do que fórmula jogada, mas "sentir que poderia ter chegado lá sozinho" é uma sensação, e é a mesma sensação de fluência da seção 2.8. Rozenblit e Keil (2002) mostram que as pessoas superestimam o quanto entendem explicações causais até serem obrigadas a produzi-las.

O ponto central desta seção: **a skill original é mais ativa do que os módulos.** Ela manda sondar o nível com quiz até achar o limite (com escalada quando ele acerta tudo), preferir a versão socrática, e conferir **cada nó** com um quiz antes de construir em cima. Na passagem para módulos gerados (13.5 e `metodo/conceito.md`), ficou a metade narrativa: "O aluno deve sentir que poderia ter chegado lá sozinho". A metade com melhor evidência (tentar antes, conferir a cada passo) foi a que saiu.

### 4.3 Formatos por nível e estrutura da lição

- A sequência introdução, conceito, exemplo, pergunta é sensata para iniciante.
- **Falta o par exemplo-problema.** Depois do exemplo resolvido vem uma pergunta de uma ou duas frases. A recomendação da literatura é: exemplo resolvido, depois um problema parecido para ele resolver inteiro. Uma pergunta curta não substitui isso.
- **Não há retirada do apoio dentro do módulo.** Mesmo para um conceito em que ele acertou tudo, o próximo exemplo é resolvido.
- **A ideia central vem pronta logo antes do quiz final.** Isso entrega um resumo segundos antes do teste e infla o acerto. É melhor pedir que ele escreva a ideia central primeiro e só então mostrar a do professor.
- **Tamanhos mínimos conferidos pelo código** (introdução 600, conceito 900, exemplo 900 caracteres; mira de 1.200 a 2.500). Um piso de tamanho é um incentivo a encher. O que você pediu no m1 foi o porquê e a transição, não mais caracteres. Eu trocaria o piso por uma lista do que o bloco precisa conter e poria um teto.

### 4.4 A proporção explicação/prática

Este é o ponto em que eu mais discordo do desenho atual.

O que está escrito em `metodo/estrutura-da-licao.md`: "Pelo menos 70 % dos caracteres da lição estão nas explicações", "Uma lição típica tem de 2 a 4 questões ao todo", "Questão a mais não ensina: o que ensina é a explicação", "umas 3 a 6 explicações longas e poucas questões".

O que a literatura diz: reler e receber explicação estão entre as técnicas de menor retorno; responder está entre as de maior (seção 2.1). Em cursos online, quem faz as atividades aprende bem mais do que quem lê ou assiste (o "doer effect": Koedinger et al., 2015, com replicações causais do mesmo grupo de pesquisa; o número "6 vezes" circula em material de divulgação e eu não o conferi no artigo). Bloom e VanLehn apontam que o valor da tutoria está no aluno fazer e ser corrigido. Confiança de que 70/30 em favor da explicação é a proporção errada para retenção: moderada a forte.

O que aconteceu, pela ordem dos documentos: o m1 tinha lições com cerca de 5,5 mil caracteres e 5 a 6 questões, sem introdução nem bloco de conceito (só exemplos resolvidos). Você achou raso e repetitivo. O esquema novo triplicou a explicação e cortou as questões. As duas reclamações eram verdadeiras, mas os remédios certos eram **explicação com porquê e transição** (feito) e **questões melhores e variadas** (não feito: foram cortadas).

O que eu faria:
- Apagar a frase "Questão a mais não ensina".
- Trocar "pelo menos 70 % em explicação" por um teto de leitura contínua: nenhuma sequência de mais de uns 2.500 caracteres sem algo para ele fazer.
- Medir por tempo e não por caracteres: a meta é ele passar pelo menos metade do tempo da lição produzindo (respondendo, completando, explicando).
- Regra de variedade no lugar da regra de quantidade: cada questão cobra uma operação diferente (prever, calcular, escolher o método, achar o erro, explicar o porquê, aplicar a outro caso). O ajuste `estrutura-da-licao.md#a-20261103-1` vai nessa direção e é bom; só não pode servir para cortar ainda mais.

### 4.5 Questões, dica e retorno

O que está bem desenhado:
- **Quiz com a confusão em cada alternativa errada** e construção "escreva a correta e mute para cada errada". Distratores diagnósticos são boa prática, e a pista na primeira tentativa errada (a confusão, sem a resposta) é exatamente "dica antes da resposta". Confiança: moderada.
- **Duas tentativas no quiz, uma reescrita na dissertativa.** Dar chance de usar o feedback é o que faz o feedback funcionar.
- **"Nunca os mesmos dados do exemplo."** Evita copiar e cobra uma transferência próxima.
- **Confiança de 1 a 4 antes de responder.** Custa um clique, permite medir calibração e marca os erros de alta confiança, que são os que mais se corrigem quando o feedback chama atenção (Butterfield e Metcalfe, 2001).
- **Rubrica com trechos antes dos pontos e "avalie só o que ele escreveu".** É o desenho certo contra a correção generosa.

O que pode prejudicar:
- **"Não sei" entrega tudo.** Nas duas dissertativas da lição 2 do m1, o "Não sei" veio em cerca de um minuto. Não há degrau entre tentar sozinho e ver a resposta-modelo. Falta uma escada: dica 1 (por onde começar), dica 2 (a estrutura da resposta), resposta. E registrar quanta ajuda foi usada.
- **A pergunta rápida tem uma tentativa só e mostra a resposta esperada.** Aceitável, mas uma segunda tentativa depois do retorno custa pouco.
- **Perguntas cuja resposta está na frase anterior.** No m2, lição 1, a primeira pergunta pede para corrigir uma leitura errada de um número, e o exemplo logo acima já diz, quase com as mesmas palavras, que aquela leitura é errada. Isso viola a regra do próprio `pergunta.md` ("A resposta não pode ser copiada de uma frase do texto") e o código não tem como conferir. É um caso só; cito porque é verificável.
- **Todas as questões vêm depois da explicação.** Nenhuma antes (geração) e nenhuma sobre lições anteriores (espaçamento).

### 4.6 Há recuperação espaçada de verdade?

Não. Cada conceito é cobrado uma vez, minutos depois de explicado, e nunca mais. Um conceito do módulo 1 não reaparece no módulo 2, a não ser por acaso. É a maior lacuna do método, e é a técnica com a melhor relação entre evidência e custo.

---

## 5. O que os seus dados mostram até agora

Li `aprendiz/eventos.jsonl`, `aprendiz/metodo/`, o curso, os módulos m1 e m2 e o relatório do m1. Fatos:

| Item | Valor |
|---|---|
| Eventos do aprendiz | 108, em 5 sessões, em 2 dias (2026-10-26 e 2026-11-03) |
| Autoavaliações do diagnóstico | 79 (73 % dos eventos); a grande maioria no nível 0 |
| Questões do diagnóstico (matéria real) | 6 de alternativa (3 certas) e 1 dissertativa (4 de 8) |
| Módulos concluídos | 1 (m1, 2 lições), num dia só |
| Questões respondidas em módulo | 11: 5 perguntas (4 certas, 1 em parte), 3 quizzes (3 certos na 1ª), 1 dissertativa (6 de 8), 2 "Não sabia" |
| Questionários de fim de lição | 2 |
| Notas por bloco (Ruim/Bom/Ótimo) | 0 |
| Regras de escrita | 0 (não existe `escrita.json`) |
| Hipóteses | 0 (não existe `hipoteses.json`) |
| Ajustes do método | 2, aprovados por você em 2026-11-03, hoje "em teste" |
| m2 | Gerado em 2026-11-03 com os 2 ajustes; nenhuma resposta até hoje |
| Prazo do curso | 2026-11-05 (já passou) |

O que dá para dizer:

1. **O relatório do m1 foi sensato.** Ele separou o que tinha padrão (ritmo com nota 1 nas duas lições; duas dissertativas sem tentativa) do que era relato único (a falta de transição) e se recusou a propor regra geral sobre este último. Escreveu que não dava para saber por que você travou nas dissertativas. É o comportamento certo.
2. **Os dois ajustes são pedagogia razoável.** O de `dissertativa.md` (conferir que cada critério da rubrica foi praticado antes) é alinhamento entre o que se ensina e o que se cobra, princípio aceito. O de `estrutura-da-licao.md` (não repetir a mesma operação) é bom se virar variedade. Nenhum dos dois precisa de experimento para ser adotado: são correções de defeito.
3. **Eles nasceram de 2 questionários e 2 "Não sei".** Como correção de defeito, basta. Como "experimento", não há como avaliar: o m2, onde eles valem, também mudou de esquema inteiro (seção 3.2, item 2).
4. **O seu feedback em texto foi mais útil do que as notas.** As notas (entendimento 3 e 2, clareza 2 e 3, exemplos 4 e 4, ritmo 1 e 1) não dizem o que fazer. O texto diz: faltou o porquê, faltou transição, as questões repetiam a operação. Isso sugere trocar os sliders por uma ou duas perguntas abertas.
5. **Sinais de aprendizado: nenhum.** 8 acertos em 9 questões curtas, minutos depois de ler, com o texto na tela, não dizem se você sabe tokenização hoje, 9 dias depois. Isso pode ser medido esta semana (proposta 0 da seção 6).
6. **Calibração:** no diagnóstico você errou com confiança 1 e acertou com 3, o que é boa calibração. No m1 houve um "em parte" com confiança 4. Com 10 pontos não se conclui nada.
7. **Correção:** 2 "certa" com ressalva de conteúdo no retorno, em 5. Não concluo que o corretor é generoso. Concluo que ninguém conferiu.
8. **O laço funciona ou é ruído?** Não dá para saber, e não vai dar pelo caminho atual. O que os dados mostram com clareza é outra coisa: a quantidade de mecanismo (placar, experimentos, aprendizados, indicadores, hipóteses, reflexão) é muito maior do que a quantidade de estudo que o alimenta.

---

## 6. Propostas

Esforço: **P** (até 1 dia), **M** (2 a 4 dias), **G** (uma semana ou mais), contando o seu processo com agentes. Impacto: sobre retenção e transferência, não sobre conforto.

### 6.1 O que manter, e por quê

| Manter | Razão |
|---|---|
| Eventos só de acréscimo, com contexto (prompt, hash, modelo, versão do bloco) | É o que torna qualquer medida futura possível |
| Números calculados pelo código, não pelo LLM; toda afirmação com ids de evento | Higiene rara e correta |
| Quiz com confusão por alternativa, duas tentativas e pista | Bem fundamentado |
| Dissertativa com rubrica, trechos antes dos pontos e uma reescrita | Bem fundamentado |
| Confiança de 1 a 4 | Barata e útil |
| Regras de estilo do AGENTS.md do perfil (sem elogio, direto, contexto antes, termo com origem) | Seção 4.1 |
| Introdução por problema; glossário com "explicar antes de usar" | Pré-treino e coerência |
| Proibição de estilos de aprendizagem; autoavaliação nunca como verdade | Correto |
| Feedback em texto por bloco e "Reescrever este bloco" para **defeitos** (erro, passo que falta, termo sem explicação, confuso) | Correção local, sem generalizar |
| Os dois ajustes atuais, como regras simples | São correções de defeito |
| O relatório do módulo como **leitura qualitativa** (o que funcionou, problemas, com evidências) | A parte útil do ciclo |
| A recusa da tela "Hoje" | Autonomia importa para um adulto; dá para espaçar sem fila |

### 6.2 O que cortar ou simplificar

| # | Cortar | Por quê | Como |
|---|---|---|---|
| C1 | **A decisão automática dos experimentos** (manter, descartar, reescrever pelo placar) e a entrada automática de propostas e de aprendizados nas gerações | Decide sobre ruído, sem controle, com catraca (seção 3.2) | O relatório continua propondo. A proposta só vira ajuste com um clique seu, como era antes de 13.17, com teto de 5 ajustes ativos. `aprendizados.md` deixa de ser injetado. O placar continua na tela, como informação. |
| C2 | **Bandit (9.5), score composto (9.4), pré e pós-teste por bloco para o ganho de Hake (parte D2), coleta para DPO (9.8)** | Não funcionam com um aluno, ou medem desempenho imediato | Tirar do plano. Nada a apagar: não foram construídos. |
| C3 | **A contabilidade das hipóteses**: classes de confiança, validade, expiração, conflito, versões, mudanças pendentes, decaimento, ganho normalizado, Brier por conceito, BKT | Engenharia de sistema de larga escala para meia dúzia de eventos por conceito | Já está construído (partes A e B): congelar, não construir a parte C como especificada. No lugar, o resumo injetado sai direto dos eventos (proposta 6). Reavaliar depois de 10 semanas de uso real. |
| C4 | O questionário de 5 sliders como entrada do método | Mede satisfação, e o ritmo não tem direção | Trocar por 3 itens (proposta 8). O visual pode ficar. |
| C5 | Reescrita de questão por "difícil demais" | Remove dificuldade a pedido | Em questões, `nivel_errado` para baixo vira "acrescente uma dica", não "situação mais direta". |
| C6 | FSRS | Objeto errado (cartão idêntico) | Intervalos fixos (proposta 1). Reconsiderar só se um dia houver cartões de fato. |
| C7 | Pisos de tamanho por bloco e a regra dos 70 % | Seções 4.3 e 4.4 | Teto de leitura contínua e lista de conteúdo obrigatório. |

### 6.3 O que mudar e o que acrescentar, por impacto sobre esforço

| # | Proposta | Evidência (confiança) | Onde mexe | Esforço | Impacto |
|---|---|---|---|---|---|
| 0 | **Teste atrasado do m1, esta semana.** 10 questões novas sobre os conceitos do m1, sem consultar, 9 ou mais dias depois. É o primeiro dado real de aprendizado do app. | Seção 3.3 (forte) | Nenhum código: pedir ao professor na mesa, "Me teste nisso", e anotar o resultado | P | Alto (informação) |
| 1 | **Retomada no começo de cada lição.** De 2 a 4 questões sobre lições e módulos anteriores, antes da introdução, sem o texto na tela. Escolha por regra: conceitos vistos há 2, 7, 21 e 60 dias, com prioridade para os errados e para os de confusão registrada. Questões novas (variações), geradas na hora. Sem fila, sem tela "Hoje": a revisão vem embutida no que ele já ia fazer. | Recuperação, espaçamento, reaprendizado sucessivo (forte) | `extensions/modulos.ts` (seleção e evento novo `respondeu_retomada` com `diasDesde`), prompt novo `modulo-retomada.md`, um bloco no topo da tela da lição | M | **Muito alto.** É também o desfecho primário, de graça |
| 2 | **Inverter a proporção de prática.** Apagar "Questão a mais não ensina"; teto de leitura contínua; depois de cada exemplo resolvido, um problema parecido para resolver inteiro ("agora você"); regra de variedade de operações. | Teste, doer effect, par exemplo-problema (moderada a forte) | `metodo/estrutura-da-licao.md`, `metodo/exemplos.md`, `validarPlano`/`validarLicao` em `lib/modulo-tipos.ts` | P a M | Alto |
| 3 | **Parar a decisão automática (C1)** e separar dois canais: *defeito* (corrige já, local) e *método* (só muda na revisão de 4 semanas, com dado atrasado). | Seção 3 (forte) | `lib/metodo-ciclo.ts` (aplicar deixa de ser automático), `prompts/relatorio-metodo.md`, tela do relatório | P a M | Alto (evita dano) |
| 4 | **Teste do módulo com 7 dias ou mais** (a "avaliação do módulo" de 8.5): de 8 a 12 questões novas, intercaladas, sem consulta, com pelo menos 2 de "qual método para este caso". Disponível no card do módulo, sem bloquear nada. | Retenção atrasada, intercalação (forte, moderada) | `extensions/modulos.ts`, prompt novo, uma tela simples | M | Alto |
| 5 | **Pergunta antes do conceito** (geração). Antes de cada bloco de conceito, uma pergunta curta com o problema da introdução: "como você resolveria?". Não vale nota e não entra no placar; o conceito seguinte começa da resposta dele. Realiza a metade socrática da skill teach. | Sinha e Kapur; Pan e Carpenter (moderada) | Tipo de bloco novo (`tentativa`) em `modulo-tipos.ts`, `metodo/` e `modulo-licao.md`; tela | M | Médio a alto |
| 6 | **Nível por desempenho e retirada do apoio.** Regra simples: 2 acertos seguidos em dias diferentes sobem o nível do conceito; 1 erro atrasado desce. O formato do próximo exemplo segue. O resumo injetado leva só: nível, confusões ativas (contadas das `confusao`), termos do glossário. | Reversão da expertise (moderada a forte) | `lib/aprendiz-indicadores-tipos.ts` (regra nova no lugar do BKT), `modulos.ts` (onde hoje lê o nível do plano) | M | Médio a alto, crescente com o tempo |
| 7 | **Escada de dicas no "Não sei"**: dica 1, dica 2, resposta; registrar o degrau. Segunda tentativa na pergunta rápida. | Bastani; assistência graduada (moderada) | Campo `dicas` nas questões (`modulo-licao.md`, `quiz.md`, `dissertativa.md`), tela, evento | M | Médio |
| 8 | **Fim de lição em 3 itens** no lugar dos 5 sliders: (a) "o que ficou confuso?" (texto), (b) ritmo com direção (lento, bom, rápido), (c) "de 0 a 10, quantas questões desta lição você acertaria daqui a uma semana?". O item (c) vira calibração quando a retomada chegar. | Julgamento atrasado e calibração (moderada) | `lib/modulo-feedback-tipos.ts`, tela do questionário | P a M | Médio |
| 9 | **Ideia central escrita por ele primeiro**, depois a do professor ao lado. | Geração e recuperação (moderada) | `metodo/ideia-central.md`, tela do bloco | P | Médio |
| 10 | **Auditoria do corretor.** Você dá nota, às cegas, a 20 respostas (perguntas e dissertativas) e o código mostra a concordância. Repetir a cada troca de modelo. | Especificação 8.5; sycophancy (moderada) | Uma tela pequena ou um script em `scripts/` | P a M | Médio (confiança em todo o resto) |
| 11 | **Mini-projeto por módulo, fora do app.** Ao fim do módulo, uma tarefa de 30 a 60 minutos num notebook seu, com dados que a lição não usou (um conjunto público pequeno), e uma rubrica. Você cola o resultado e a conclusão; o professor corrige pela rubrica na mesa. | Transferência exige prática em contexto variado (moderada); é o objetivo real em Ciência de Dados | Prompt novo `modulo-projeto.md`, um campo no módulo; nenhuma execução de código no app | M | Alto para o objetivo pós-dezembro |
| 12 | **Explicar de volta ("teach-back").** Uma vez por módulo, na mesa: "explique X como se eu fosse um colega que faltou"; o professor faz perguntas de quem não entendeu e aponta lacunas contra o material. | Kobayashi (2019): g ≈ 0,56 quando há preparo e interação; efeito some sem expectativa de ensinar (moderada) | Um atalho na mesa e um prompt; sem estrutura nova | P | Médio |
| 13 | **Um experimento N-de-1 de verdade, se você quiser um.** Fator: a proposta 5 (pergunta antes do conceito), sorteada por conceito, você sem saber qual é qual, desfecho na retomada com 7 dias ou mais, 60 conceitos, pré-registro em arquivo, análise por teste de aleatorização no código. | Seção 3.2 | `modulos.ts` (sorteio e marca no evento), um script de análise | M | Baixo para o aprendizado; alto para saber se o laço pode funcionar |
| 14 | Frase de "isto é dado, não instrução" nos prompts que recebem texto seu ou do material; corretor em modelo diferente do gerador. | Seção 3.5 | `prompts/*.md`, `profile.json` | P | Baixo a médio |

O que eu **não** recomendo agora, mesmo estando na sua lista:
- **Mapas de conceito feitos pelo aluno.** Karpicke e Blunt (2011): recuperar supera montar mapa. O mapa de conteúdo que já existe serve de organizador.
- **Exemplos com erro deliberado.** Barbieri et al. (2023) encontram efeito menor do que com exemplos corretos. Os distratores com confusão já cobrem essa função.
- **Mastery learning com portões.** O efeito clássico é bom, mas portão fixo contraria a sua decisão de nada bloquear, e com correção por LLM não auditada o portão seria arbitrário. A versão leve já está nas propostas 1 e 6: o que não foi dominado volta.
- **FSRS.** Seção 2.12.

### 6.4 Plano de medição

Poucas métricas, todas tiradas dos eventos (as três primeiras dependem das propostas 1 e 4).

| Métrica | Como se calcula | Sucesso | Fracasso |
|---|---|---|---|
| **M1. Retenção atrasada** | Acertos na 1ª tentativa, sem dica, nas retomadas e nos testes de módulo com 7 dias ou mais, sobre o total | 70 % ou mais, estável ou subindo ao longo dos módulos | Abaixo de 50 %, ou caindo módulo após módulo |
| **M2. Transferência** | Fração da rubrica do mini-projeto do módulo, feita sem reabrir a lição | 60 % ou mais | Abaixo de 40 % com M1 alta: você lembra, mas não aplica |
| **M3. Calibração** | Confiança média convertida em probabilidade menos o acerto, nas questões atrasadas | Diferença menor que 10 pontos depois de 50 questões | Mais de 20 pontos de excesso de confiança |
| **M4. Dose** | Sessões por semana e questões respondidas por semana | 3 sessões ou mais por semana | Menos de 1 por semana em 4 semanas seguidas |
| **M5. Guarda** | O texto de "o que ficou confuso" e o ritmo | Serve para achar defeitos e para perceber risco de abandono | Não é meta |

Regras de uso, que valem como pré-registro:
1. Uma nota de revisão a cada 4 semanas, com as cinco métricas e o n de cada uma. Formato fixo.
2. Nada do método muda sozinho. Mudanças de método acontecem só nessa revisão.
3. Defeitos (erro, termo sem explicação, questão desalinhada) são corrigidos na hora, sem esperar.
4. Menos de 30 questões atrasadas no período: a nota diz "sem dados" e nada muda.
5. Teste de sanidade do app, uma vez: estudar um módulo do seu jeito de sempre (material e conversa livre) e fazer o mesmo tipo de teste com 7 dias. Se o app não ganhar por margem visível em 2 ou 3 comparações, o problema é maior do que qualquer ajuste de prompt.

O que contaria como "o app não está funcionando para você", em 8 a 10 semanas: M4 abaixo de 1 sessão por semana (o app não é usado, e aí nada mais importa), ou M1 abaixo de 50 % com dose boa.

---

## 7. Veredito

**A metodologia tem base?** Em parte.

- **Tem base forte:** o que a especificação escolheu adaptar (conhecimento prévio e confusões, nunca estilos), exemplos resolvidos para iniciante, o desenho das questões (distratores com confusão, pista antes da resposta, rubrica, reescrita, confiança), o feedback direto e sem elogio, a introdução por problema, e a disciplina de eventos e evidência.
- **Tem base fraca ou nenhuma:** "verdades incondicionais primeiro" como princípio central; a proporção de 70 % de explicação e a frase de que questão não ensina (contra a evidência); o BKT de parâmetros fixos, o score composto, o bandit e o FSRS para este uso.
- **Falta, apesar de ter a base mais forte de todas:** recuperação espaçada e qualquer medida de retenção. O app hoje ensina e pergunta "gostou?", mas nunca pergunta "ainda sabe?".

**A maior aposta arriscada** é a decisão 13.17: deixar um LLM mudar sozinho a metodologia de todas as lições futuras com base num placar de satisfação e acerto imediato, com n minúsculo, sem controle e sem volta. Não é que vá dar errado de forma visível. É que vai derivar devagar para o que é agradável de ler, com relatórios que parecem ciência, e você não terá como perceber, porque a única medida que mostraria isso não existe.

**O que eu faria nas próximas 3 semanas:**

- **Semana 1.** Fazer o teste atrasado do m1 (proposta 0) e anotar. Parar a aplicação automática dos experimentos e a injeção dos aprendizados (proposta 3). Editar `estrutura-da-licao.md` e `exemplos.md` (proposta 2). Não construir as partes C e D da memória do aprendiz.
- **Semana 2.** Construir a retomada no começo da lição com o evento novo (proposta 1) e o fim de lição em 3 itens (proposta 8).
- **Semana 3.** Construir o teste do módulo com 7 dias (proposta 4) e fazer a auditoria do corretor (proposta 10). E, mais importante do que tudo acima: **estudar pelo menos 3 sessões por semana nas três semanas**, num curso do que você quer aprender depois de dezembro. Sem isso, nenhuma destas propostas produz dado, e a próxima revisão vai dizer a mesma coisa que esta.

---

## 8. Referências

Conferidas nesta revisão (busquei e li o resumo ou uma descrição; não li o texto integral):

- Agarwal, Karpicke, Kang, Roediger e McDermott (2008). Examining the testing effect with open- and closed-book tests. *Applied Cognitive Psychology*. https://pcllab.github.io/downloads/2008/2008_Agarwal_etal_ACP.pdf
- Arvin (2025). "Check My Work?": Measuring Sycophancy in a Simulated Educational Context. https://arxiv.org/abs/2506.10297
- Barbieri, Miller-Cotto, Clerjuste e Chawla (2023). A meta-analysis of the worked examples effect on mathematics performance. *Educational Psychology Review*. https://doi.org/10.1007/s10648-023-09745-1
- Barcaui (2025). ChatGPT as a cognitive crutch: evidence from a randomized controlled trial on knowledge retention. *Social Sciences & Humanities Open*. Resumo em https://scale.stanford.edu/ai/repository/chatgpt-cognitive-crutch-evidence-randomized-controlled-trial-knowledge-retention
- Bastani et al. (2025). Generative AI without guardrails can harm learning. *PNAS*. https://doi.org/10.1073/pnas.2422633122 (o número de 17 % eu vi no resumo do preprint e em descrições do artigo, não no texto final)
- Bisra, Liu, Nesbit, Salimi e Winne (2018). Inducing self-explanation: a meta-analysis. *Educational Psychology Review*. https://doi.org/10.1007/s10648-018-9434-x
- Brunmair e Richter (2019). Similarity matters: a meta-analysis of interleaved learning and its moderators. *Psychological Bulletin*. https://pubmed.ncbi.nlm.nih.gov/31556629/
- Carpenter, Wilford, Kornell e Mullaney (2013). Appearances can be deceiving: instructor fluency increases perceptions of learning without increasing actual learning. *Psychonomic Bulletin & Review*. https://doi.org/10.3758/s13423-013-0442-z
- Cepeda, Vul, Rohrer, Wixted e Pashler (2008). Spacing effects in learning: a temporal ridgeline of optimal retention. *Psychological Science*. https://pubmed.ncbi.nlm.nih.gov/19076480/
- Deslauriers, McCarty, Miller, Callaghan e Kestin (2019). Measuring actual learning versus feeling of learning. *PNAS*. https://doi.org/10.1073/pnas.1821936116
- Fan et al. (2024). Beware of metacognitive laziness. *British Journal of Educational Technology*. https://doi.org/10.1111/bjet.13544
- FSRS, benchmark aberto de algoritmos de repetição espaçada. https://expertium.github.io/Benchmark.html
- Gervet, Koedinger, Schneider e Mitchell (2020). When is deep learning the best approach to knowledge tracing? *JEDM*. https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451
- Kestin, Miller, Klales, Milbourne e Ponti (2025). AI tutoring outperforms in-class active learning. *Scientific Reports*. https://doi.org/10.1038/s41598-025-97652-6
- Khajah, Lindsey e Mozer (2016). How deep is knowledge tracing? https://arxiv.org/abs/1604.02416
- Kluger e DeNisi (1996). The effects of feedback interventions on performance. *Psychological Bulletin*. https://doi.org/10.1037/0033-2909.119.2.254
- Kobayashi (2019). Learning by preparing-to-teach and teaching: a meta-analysis. *Japanese Psychological Research*. https://doi.org/10.1111/jpr.12221
- Koedinger, Kim, Jia, McLaughlin e Bier (2015). Learning is not a spectator sport: doing is better than watching for learning from a MOOC. *Learning at Scale*. https://doi.org/10.1145/2724660.2724681 (confirmei a existência e as replicações; não confirmei o "6 vezes" no artigo)
- Kornell e Bjork (2008). Learning concepts and categories: is spacing the "enemy of induction"? *Psychological Science*. https://pubmed.ncbi.nlm.nih.gov/18578849/
- Pan e Carpenter (2023). Prequestioning and pretesting effects. *Educational Psychology Review*. https://doi.org/10.1007/s10648-023-09814-5
- Pan e Rickard (2018). Transfer of test-enhanced learning. *Psychological Bulletin*. https://doi.org/10.1037/bul0000151
- Rawson e Dunlosky (2022). Successive relearning. *Current Directions in Psychological Science*. https://doi.org/10.1177/09637214221100484
- Rohrer, Dedrick, Hartwig e Cheung (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology*. https://doi.org/10.1037/edu0000367
- Rowland (2014). The effect of testing versus restudy on retention. *Psychological Bulletin*. https://doi.org/10.1037/a0037559
- Sinha e Kapur (2021). When problem solving followed by instruction works. *Review of Educational Research*. https://doi.org/10.3102/00346543211019105
- Tetzlaff, Simonsmeier, Peters e Brod (2025). A cornerstone of adaptivity: a meta-analysis of the expertise reversal effect. *Learning and Instruction*, 98, 102142. (confirmei a citação e o escopo; os tamanhos de efeito eu não vi)
- Uttl, White e Gonzalez (2017). Meta-analysis of faculty's teaching effectiveness. *Studies in Educational Evaluation*. https://doi.org/10.1016/j.stueduc.2016.08.007
- VanLehn (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*. https://doi.org/10.1080/00461520.2011.611369
- Von Hippel (2024). Two-sigma tutoring: separating science fiction from science fact. *Education Next*. https://www.educationnext.org/two-sigma-tutoring-separating-science-fiction-from-science-fact/
- What Works Clearinghouse. Single-case design technical documentation. https://ies.ed.gov/ncee/WWC/Docs/ReferenceResources/wwc_scd.pdf
- Wisniewski, Zierer e Hattie (2020). The power of feedback revisited. *Frontiers in Psychology*. https://doi.org/10.3389/fpsyg.2019.03087
- Yang, Luo, Vadillo, Yu e Shanks (2021). Testing (quizzing) boosts classroom learning. *Psychological Bulletin*. https://doi.org/10.1037/bul0000309

Citadas de memória (clássicas; não busquei nesta revisão, confira o link antes de citar adiante):

- Adesope, Trevisan e Sundararajan (2017). Rethinking the use of tests. *Review of Educational Research*. https://doi.org/10.3102/0034654316689306
- Bjork e Bjork (2011). Making things hard on yourself, but in a good way. Capítulo em *Psychology and the Real World*.
- Bloom (1984). The 2 sigma problem. *Educational Researcher*. https://doi.org/10.3102/0013189X013006004
- Butterfield e Metcalfe (2001). Errors committed with high confidence are hypercorrected. *JEP: LMC*. https://doi.org/10.1037/0278-7393.27.6.1491
- Cepeda, Pashler, Vul, Wixted e Rohrer (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin*. https://doi.org/10.1037/0033-2909.132.3.354
- Corbett e Anderson (1994). Knowledge tracing. *User Modeling and User-Adapted Interaction*. https://doi.org/10.1007/BF01099821
- Dunlosky, Rawson, Marsh, Nathan e Willingham (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*. https://doi.org/10.1177/1529100612453266
- Hattie e Timperley (2007). The power of feedback. *Review of Educational Research*. https://doi.org/10.3102/003465430298487
- Kalyuga, Ayres, Chandler e Sweller (2003). The expertise reversal effect. *Educational Psychologist*. https://doi.org/10.1207/S15326985EP3801_4
- Karpicke e Blunt (2011). Retrieval practice produces more learning than elaborative studying with concept mapping. *Science*. https://doi.org/10.1126/science.1199327
- Pashler, McDaniel, Rohrer e Bjork (2008). Learning styles: concepts and evidence. *Psychological Science in the Public Interest*. https://doi.org/10.1111/j.1539-6053.2009.01038.x
- Renkl e Atkinson (2003). Structuring the transition from example study to problem solving. *Educational Psychologist*. https://doi.org/10.1207/S15326985EP3801_3
- Rozenblit e Keil (2002). The misunderstood limits of folk science: an illusion of explanatory depth. *Cognitive Science*. https://doi.org/10.1207/s15516709cog2605_1
- Soderstrom e Bjork (2015). Learning versus performance: an integrative review. *Perspectives on Psychological Science*. https://doi.org/10.1177/1745691615569000

Contas feitas por mim nesta revisão: o intervalo de Wilson para 3 acertos em 4; o tamanho de amostra para comparar 60 % com 80 % (duas proporções, 5 % bilateral, 80 % de poder); a atualização do BKT com os parâmetros de `aprendiz-indicadores-tipos.ts`; as contagens da seção 5, tiradas de `aprendiz/eventos.jsonl` e dos arquivos de módulo.
