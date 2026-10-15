# Regras do projeto

Leia ESPECIFICACAO.md antes de qualquer tarefa. Ela é a referência do que o app deve ser e da ordem de construção.

O app é pessoal, roda localmente no Windows e é usado só pelo Breno.

Stack: TypeScript, monorepo com pnpm workspaces, servidor Node usando o SDK do pi, front React com Vite.

O núcleo (packages/core e packages/ui) nunca conhece conceitos de um perfil específico, como caderno, curso ou questão. Antes de colocar algo no núcleo, pergunte se faria sentido também para um futuro perfil de programação. Se não, coloque no perfil.

Ferramentas de um perfil falam com a interface só pela ponte de eventos genérica (identificador do painel, ação e dados), nunca diretamente com componentes.

Os dados de estudo ficam numa pasta fora do repositório, em markdown e JSON legíveis. Nunca guarde dados do usuário dentro do repositório. Índices e bancos são derivados dos arquivos, ficam fora da pasta de dados (ela é sincronizada com o Google Drive) e precisam poder ser reconstruídos.

Os eventos de aprendizagem são só de acréscimo. Nunca edite ou apague eventos já gravados.

Toda hipótese do perfil do aprendiz precisa citar ids de eventos. Nada no perfil é alterado sem aprovação do usuário.

O app deve continuar abrindo pelo atalho único e recarregando ao vivo depois de qualquer mudança.

Siga as fases da especificação em ordem. Antes de tarefas grandes, explique o plano e peça aprovação.
