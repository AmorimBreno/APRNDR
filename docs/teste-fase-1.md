# Teste da Fase 1 (Etapa 1 do checkpoint 1)

Objetivo: confirmar que o sistema do learn funciona na sua máquina como no original, em português e com o estilo que você pediu. Você faz uma aula curta de verdade sobre R² ajustado.

Tempo: uns 40 a 60 minutos. Custo esperado: entre US$ 0,50 e US$ 1,50 (o rodapé do pi mostra o gasto da sessão).

No fim, anote o resultado de cada item na seção "Resultado" e mande para o Claude Code. A Etapa 1 só está pronta quando você aprovar.


## Antes de começar

1. Abra o Obsidian no vault (pasta projeto-estudos\vault).
2. Opcional, mas recomendado: faça o Shift+Enter funcionar no Windows Terminal. Sem isso, Shift+Enter envia a mensagem em vez de quebrar a linha. No Windows Terminal, abra as configurações em JSON (Ctrl+Shift+,) e acrescente este objeto à lista "actions":

```json
{ "command": { "action": "sendInput", "input": "\u001b[13;2u" }, "keys": "shift+enter" }
```

   Feche e abra o Windows Terminal de novo.


## Comandos do tmux que você vai usar

O tmux divide o terminal em painéis. O pi fica no painel da esquerda; cada subagente (pesquisador, desenhista) abre um painel à direita e fecha sozinho quando termina.

- Trocar de painel: Ctrl+b e depois uma seta.
- Rolar o texto de um painel: Ctrl+b e depois [ ; role com as setas ou PageUp; saia com q.
- Sair do tmux sem fechar nada: Ctrl+b e depois d. Para voltar: o mesmo comando de abrir.


## Roteiro

### 1. Abrir o pi

No terminal do Ubuntu:

```bash
cd /mnt/c/Users/Pichau/Desktop/DEV/projeto-estudos/vault && tmux new -A -s estudo 'pi'
```

Se aparecer só [exited], o pi não foi encontrado: o terminal foi aberto antes de o ~/.bashrc ganhar as linhas do pi e das chaves. Rode source ~/.bashrc (ou abra um terminal novo) e tente de novo. Para conferir: type pi deve mostrar /home/breno/.pi/agent/bin/pi.

Na primeira vez o pi pergunta "Trust project folder?". Escolha "Trust" (a primeira opção). Isso deixa o pi carregar a pasta vault/.pi (skills, extensões, modelos) sempre que abrir nesta pasta. Sem isso os subagentes também perguntam e travam.

Confira:
- O rodapé mostra openai/gpt-6.1-sol • medium.
- Shift+Enter quebra a linha e Enter envia (se você fez o passo opcional).

### 2. Ligar o log no Obsidian

No pi, digite:

```
/md-log aulas/2026-10-teste-r2.md
```

No Obsidian, abra aulas/2026-10-teste-r2.md e deixe ao lado do terminal. Tudo o que for escrito na aula aparece ali, com LaTeX renderizado.

### 3. Pedir a aula

```
Quero aprender R² ajustado.
```

Responda com sinceridade. Nos quizzes, use "Não sei" quando não souber em vez de chutar. Tab abre um campo de nota opcional em qualquer resposta.

### 4. O que observar em cada fase

Sondagem:
- Vêm quizzes que ficam mais difíceis quando você acerta e mudam de rumo quando você erra.
- Vem pelo menos uma pergunta sem resposta certa (ask_user_question) sobre o seu objetivo.

Plano:
- Um painel do pesquisador abre à direita, trabalha e fecha. O resultado volta para o professor.
- O plano aparece em texto e como mapa em mermaid (no Obsidian ele vira um diagrama).
- O professor para e espera você aprovar antes de ensinar.

Ensino:
- Cada nó do mapa é motivado, explicado, ligado aos anteriores e checado com um quiz.
- Se nenhum diagrama aparecer sozinho, peça um: "faça um diagrama de como o R² e o R² ajustado mudam quando entra uma variável de ruído". Um painel do desenhista abre, e a imagem aparece em viz/ e embutida no log.

Estilo (as regras que você deu na prova cega):
- Palavras comuns, sem elogio, sem frases de transição e sem metáforas.
- Cada símbolo e cada passo explicado; nada aparece do nada.

### 5. Encerrar

1. No pi: /md-unlog
2. Anote o custo que aparece no rodapé (o valor com $).
3. Saia do pi com Ctrl+c duas vezes (ou Ctrl+d) e do tmux com exit.

Para continuar uma aula depois: abra com o mesmo comando do passo 1 e, dentro do pi, use /resume para escolher a sessão. Ou rode pi --continue no lugar de pi.


## Resultado

Marque cada item com ok ou com o problema que aconteceu.

1. O pi abriu com o professor GPT-6.1 Sol e a pergunta de confiança apareceu só uma vez:
2. Sondagem com quizzes que se adaptam, e pergunta de objetivo:
3. Plano em texto e mapa em mermaid, esperando a sua aprovação:
4. Ensino nó a nó, com quiz de checagem em cada nó:
5. /md-log mostrou a aula ao vivo no Obsidian, com LaTeX renderizado:
6. O pesquisador abriu num painel do tmux e devolveu fontes:
7. Um diagrama apareceu em viz/ e embutido na nota:
8. Tudo em português, inclusive "Não sei" e os textos do quiz:
9. O estilo seguiu as suas regras (anote os trechos que não seguiram):
10. Custo da aula:

Observações livres (onde se perdeu, o que gostou, o que mudaria):
