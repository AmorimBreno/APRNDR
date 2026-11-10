# Regras do projeto

Leia ESPECIFICACAO.md antes de qualquer tarefa. Ela é a referência do que o app deve ser e da ordem de construção.

O app é pessoal, roda localmente no Windows e é usado só pelo Breno.

Stack: TypeScript, monorepo com pnpm workspaces, servidor Node usando o SDK do pi, front React com Vite.

O núcleo (packages/core e packages/ui) nunca conhece conceitos de um perfil específico, como caderno, curso ou questão. Antes de colocar algo no núcleo, pergunte se faria sentido também para um futuro perfil de programação. Se não, coloque no perfil.

Ferramentas de um perfil falam com a interface só pela ponte de eventos genérica (identificador do painel, ação e dados), nunca diretamente com componentes.

Os dados de estudo ficam numa pasta fora do repositório, em markdown e JSON legíveis. Nunca guarde dados do usuário dentro do repositório. Índices e bancos são derivados dos arquivos, ficam fora da pasta de dados (ela é sincronizada com o Google Drive) e precisam poder ser reconstruídos.

Os eventos de aprendizagem são só de acréscimo. Nunca edite ou apague eventos já gravados.

Toda hipótese do perfil do aprendiz precisa citar ids de eventos. Nada no perfil é alterado sem aprovação do usuário. A exceção são os ajustes do método, que entram sozinhos como experimentos (ESPECIFICACAO.md, 13.17).

O app deve continuar abrindo pelo atalho único e recarregando ao vivo depois de qualquer mudança.

Toda tela segue docs/padroes-de-interface.md: estado passageiro só aparece se durar mais de 1 segundo, o que está na tela não some durante uma troca (só se a troca falhar ou passar do prazo), conteúdo novo só aparece pronto, dado de um item não vaza para outro, elementos não mudam de tamanho ao mudar de estado, medidas acompanham a largura e transições são curtas. Toda revisão de mudança de interface (a revisão por diff, o /code-review e os roteiros de teste) passa pela lista "Como conferir" daquele arquivo, e os briefs de pacotes de interface a citam nos critérios de aceite.

Siga as fases da especificação em ordem. Antes de tarefas grandes, explique o plano e peça aprovação.
