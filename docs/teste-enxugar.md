# Roteiro: os cursos fora da interface (Fase 1 do novo rumo)

Decisão 13.21 da especificação. O que mudou: o caderno não tem mais a faixa dos cursos, as rotas antigas de curso e de módulo abrem as Notas, a mesa só abre notas, a tela de cadernos perdeu a tecla Escrita e o professor não tem mais as ferramentas dos cursos e dos módulos. O código e os dados dos cursos continuam lá (a chave CURSOS_NA_INTERFACE, em profiles/estudos/paineis/src/painel-caderno.ts, e as duas extensões no profile.json trazem tudo de volta).

Antes: abra o app pelo atalho, como sempre.

1. Tela de cadernos: as teclas do pé são Materiais, Perfil do aprendiz e (se houver) Continuar de onde parei. A tecla Escrita não aparece.
2. Abra o caderno de Ciência de Dados. Embaixo da aba, o painel começa direto pela lista (Notas, Materiais, Mapa de conteúdo) e pela agenda; não há faixa de cursos nem "Novo curso".
3. Abrir o caderno não pisca: a lista entra pronta e não muda de tamanho.
4. "Continuar de onde parei", se você tinha parado numa lição: abre o caderno nas Notas, sem erro, e a lição não aparece entre as abas da mesa.
5. Abra uma nota: ela abre na mesa, com o professor ao lado, como antes.
6. Numa conversa nova da matéria, pergunte ao professor "o que você consegue fazer?". Ele não deve citar cursos, módulos ou aulas, nem executar comandos, criar ou editar arquivos, nem o painel de teste; na mesa, só notas.
7. Peça ao professor para abrir outra nota sua na mesa ("abre a nota Aula dia 20 de outubro"). Ela abre como aba.
8. No Explorador, confira que G:\Meu Drive\estudos-dados\materias\ciencia-de-dados\cursos continua com as pastas dos cursos (nada foi apagado).

Resultado esperado: tudo acima sem erro na tela.
