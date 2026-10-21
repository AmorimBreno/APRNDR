# Formato das notas do caderno

Cada nota é o arquivo `materias/<matéria>/notas/<Título>.md` da pasta de dados. O título é o nome do arquivo. O texto é markdown comum, e os blocos especiais e as decorações são um conjunto pequeno de HTML com markdown dentro (ESPECIFICACAO 8.1). Assim o arquivo continua legível no Bloco de Notas, no GitHub e no Obsidian, e o professor lê a nota como ela está.

O editor do app (profiles/estudos/paineis) lê e escreve exatamente estes formatos. Uma nota com outro HTML abre no app só para leitura, para nada se perder ao salvar (temHtmlDesconhecido, em profiles/estudos/lib/nota-tipos.ts).


## Markdown comum

- Títulos `#` a `####`, parágrafos, **negrito**, *itálico*, ~~tachado~~ e `código`.
- Listas com `-`, numeradas com `1.`, e tarefas com `- [ ]` e `- [x]`.
- Citação com `>`, bloco de código com três crases, linha divisória com `---`, links `[texto](endereço)` (a barra da seleção põe `https://` num endereço sem protocolo).
- Sublinhado: o markdown não tem, então é HTML, `<u>trecho</u>` (Ctrl+U ou o U da barra da seleção).


## Menção a outra nota

```
Ver [[Limites laterais]].
```

O nome entre colchetes duplos é o título de outra nota da mesma matéria. Ao renomear uma nota no app, as menções a ela nas outras notas da matéria são atualizadas (e o evento renomeou_nota diz quais notas mudaram).


## Menção a um arquivo de material

```
Ver [[materiais/aula-04.pdf]].
```

O caminho começa com `materiais/` e é relativo à pasta da matéria (o arquivo materias/<matéria>/materiais/aula-04.pdf). No app, a menção aparece com um clipe e o nome do arquivo, e o clique abre a seção Materiais do caderno com o arquivo em destaque. O professor lê o arquivo com ler_material.


## Fórmulas (LaTeX)

Na linha, entre cifrões:

```
A área é $\pi r^2$.
```

Em bloco, com `$$` sozinhos na linha:

```
$$
\lim_{x \to a^+} f(x) = L
$$
```

É o mesmo LaTeX que o professor usa na conversa (KaTeX). Regra do cifrão na linha: o `$` que abre não tem espaço depois, e o que fecha não tem espaço antes nem número logo depois. Por isso "R$ 10 e R$ 20" e "R$10 e R$20" continuam texto. Um cifrão que, sem barra, abriria uma fórmula é escrito `\$`.


## Caixa de destaque

```
<div class="caixa atencao">

Texto em **markdown**, com listas, fórmulas e outros blocos.

</div>
```

Os tons são `ideia` (Ideia central), `atencao` (Atenção), `exemplo` (Exemplo) e `resumo` (Resumo). As linhas em branco depois da abertura e antes do fechamento são o que faz o markdown de dentro valer.


## Definição

```
<div class="definicao">
<dfn>Receita bruta</dfn>

Preço de venda com impostos vezes a quantidade vendida.

</div>
```

A primeira linha é o termo, em `<dfn>`; depois de uma linha em branco vem a explicação, em markdown.


## Recolhível

```
<details>
<summary>Título que abre e fecha</summary>

O conteúdo, em markdown.

</details>
```

O GitHub e o Obsidian mostram o bloco fechado com a seta. O arquivo não guarda se ele está aberto.


## Pergunta e resposta

```
<details class="pergunta">
<summary>Qual a fórmula da receita bruta?</summary>

Preço de venda com impostos vezes a quantidade vendida.

</details>
```

A pergunta fica no `<summary>` e a resposta, escondida até clicar, depois dela.


## Marca-texto (cor de fundo) e cor do texto

```
Um <mark>trecho destacado</mark>, um <mark class="fundo-salvia">destaque verde</mark> e um <span class="cor-tijolo">trecho colorido</span>.
```

As cores são `tijolo`, `ambar`, `musgo`, `aco` e `salvia`. A cor do texto é `<span class="cor-…">`. A cor de fundo é o marca-texto: `<mark>` sem classe é o âmbar, o de sempre, e as outras são `<mark class="fundo-…">` (o app escreve o âmbar sem classe). As duas decorações podem ir juntas: `<mark class="fundo-tijolo"><span class="cor-tijolo">…</span></mark>`.


## Regras para quem escreve uma nota fora do app

- Cada bloco abre sozinho no começo de uma linha e fecha sozinho numa linha.
- Use as linhas em branco dentro dos blocos como nos exemplos.
- Blocos podem ficar uns dentro dos outros (uma caixa com uma fórmula, um recolhível dentro de uma caixa).
- Fora desta lista, não use HTML: a nota passa a abrir só para leitura no app.
