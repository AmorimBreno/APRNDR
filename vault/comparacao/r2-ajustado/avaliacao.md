# Prova cega: r2-ajustado

Leia as respostas [[resposta-A|A]], [[resposta-B|B]], [[resposta-C|C]]. Todas receberam o mesmo pedido: o plano da aula e o primeiro nó, para um aluno simulado (você) aprendendo R² ajustado.

Perguntas para guiar a leitura:

- Em algum momento você se perdeu? Onde?
- Algum passo foi pulado ou apareceu do nada?
- O mapa em mermaid faz sentido como ordem de ensino?
- A pergunta de checagem testa o que foi ensinado?

## Sua ordem (da melhor para a pior)

1. C
2. B
3. A

## Comentários

Escritos pelo Breno no chat em 2026-10-05, copiados sem mudança de sentido.

Resposta A:
- Usa muitas palavras "esquisitas", como "revelou uma coisa muito bonita" ou "vindicar a sua intuição". Seria melhor usar palavras mais simples e parar de puxar tanto o saco. Algo como: "a sua intuição estava certa, mas não é assim, o R² não se comporta dessa forma, que parece intuitiva. Ele nunca cai, vou te explicar o porquê:".
- "Destilar a frase": entendo o que é, mas não é um vocabulário a que estou acostumado. Eu teria que ficar relembrando o conceito de destilar para entender a explicação, e isso leva o meu foco de um lado para o outro. Linguagem mais simples e direta, mas explicando o raciocínio.

Resposta B:
- Está melhor nesse sentido, mas usa palavras desnecessárias no meio da frase, com metáforas como "premia honestidade".
- Fica falando coisas como "Boa notícia: você já tem quase tudo que precisamos". Não precisava dessa frase antes do que interessa, que é "Você sabe que a reta minimiza a soma dos quadrados dos resíduos, e sabe variância"; aí explica o que falta.
- "Ele vira a resposta natural a uma pergunta que você mesmo vai formular" poderia ser "O R² ajustado responde a pergunta: como eu comparo dois modelos que gastam quantidades diferentes de graus de liberdade?". Gostei da pergunta: traz o raciocínio que estamos tentando responder.
- Na fase 3, "porque ele é o ponto de partida perfeito" não adiciona nada. Poderia ser só: "Vamos começar pelo seu erro. Você disse que adicionar uma variável de puro ruído faz o R² cair, e isso não é possível, e é muito importante." Sem "sinta o peso do motivo pelo qual essa resposta é impossível". Sejamos engenheiros, não escritores de livros de literatura.

Resposta C:
- A que mais gostei em ir direto ao ponto, sem inventar moda e sem criar confusão. Mas é direta demais, e falta explicação do raciocínio.
- Por exemplo, na fase 3, item 2, poderia ser: "Considere a equação de um modelo linear com uma variável X a seguir: ... Ela diz o seguinte: o y é a previsão, o b0 é o intercepto, o valor base caso o b1 seja zero, e ele representa ..., e b1 é o coeficiente de X." Ou seja, explicar o que cada coisa significa em vez de só jogar fatos. Podemos nos referir a conceitos explicados antes e mostrar como chegam e se comportam ali na equação. Mostrar o caminho até certo ponto, sem cortar caminho.

## Revelação

- A: DeepSeek V4 Pro (deepseek/deepseek-v4-pro-0813). US$ 0,019; 8.790 tokens de saída, dos quais 7.041 de raciocínio interno.
- B: GLM 5.3 (z-ai/glm-5.3). US$ 0,016; 2.260 tokens de saída.
- C: GPT-6.1 Sol (openai/gpt-6.1-sol). US$ 0,028; 1.595 tokens de saída.

Decisão: o professor é o GPT-6.1 Sol. As regras de estilo tiradas destes comentários foram para vault/.pi/APPEND_SYSTEM.md e, na Etapa 2, passam para o perfil.
