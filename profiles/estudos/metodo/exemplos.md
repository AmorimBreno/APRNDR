# Exemplos

A explicação em formato de exemplo (`exemplo_resolvido`, `exemplo_incompleto` ou `problema_aberto`): o conceito aplicado a um caso concreto, depois retomado para explicar melhor.

## O formato pelo nível do aluno

O nível do aluno no conceito escolhe o formato (exemplos resolvidos demais atrapalham quem já sabe):

- **Iniciante, `exemplo_resolvido`**: um caso resolvido por inteiro, passo a passo, cada passo com o porquê, sem pular conta nem raciocínio.
- **Intermediário, `exemplo_incompleto`**: o caso com a ideia e os primeiros passos resolvidos e alguns passos deixados para o aluno, cada um marcado como "Complete:" com uma dica curta do que fazer. As respostas desses passos não vão no texto.
- **Domina, `problema_aberto`**: um problema numa situação nova ou menos óbvia, com o contexto e os dados necessários, uma dica de por onde começar e o que se espera da solução, sem resolver.

## O que fazer

- **Dados concretos.** Números pequenos, um documento curto, uma tabela de poucas linhas, um trecho de código que roda. Quando o curso usa material, parta dos exemplos e exercícios dele.
- **Cada passo explicado.** Um subtítulo `###` por passo ("### Contar os documentos"). Diga o que se faz, por que se faz e de qual parte do conceito o passo sai. A conta ou o código sozinhos não explicam.
- **Código explicado.** Num exemplo com código, explique as linhas que importam, uma a uma ou em grupos pequenos, citando cada parte exatamente como aparece no bloco.
- **Vetores e matrizes** vão nos blocos `vetor` e `matriz`, para o app desenhar.
- **Retomar depois do exemplo.** Feche com uma parte própria ("### O que o exemplo mostra") que volta ao conceito: o que o resultado diz, qual passo carregou a ideia, o que mudaria se um dado mudasse. É aqui que o exemplo explica melhor o conceito.
- Pelo menos 900 caracteres; mire de 1.200 a 2.500 (o problema aberto pode ficar mais perto do mínimo, com a retomada dizendo o que observar na solução).

## O que evitar

- Exemplo que é só código ou só conta, sem texto entre os passos.
- Pular passos "óbvios": o aluno iniciante tropeça exatamente neles.
- Dar as respostas dos passos "Complete:" ou a solução do problema aberto.
- Trocar de caso no meio do exemplo.

## Exemplo pequeno (exemplo resolvido)

> Coleção com $N = 4$ documentos; o termo "rato" aparece 3 vezes em $d_2$ e está em 2 documentos.
>
> ### Calcular o idf
>
> O idf mede a raridade do termo na coleção: $idf = \log(4/2) = \log 2 \approx 0{,}301$. O termo está em metade dos documentos, então é só um pouco raro.
>
> ### Multiplicar pelo tf
>
> O peso junta as duas ideias: aparecer muito no documento e em poucos documentos. $w = 3 \times 0{,}301 \approx 0{,}903$.
>
> ### O que o exemplo mostra
>
> O tf alto (3) só virou um peso alto porque o idf não era zero. Se "rato" estivesse nos 4 documentos, o idf seria $\log 1 = 0$ e o peso cairia a 0, por mais vezes que o termo aparecesse em $d_2$.
