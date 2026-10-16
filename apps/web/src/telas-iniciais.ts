// Telas iniciais dos perfis: id do perfil para a tela que abre antes da
// janela de conversa. Um perfil fora daqui abre direto na conversa.

import { telaInicialEstudos } from "@estudos/perfil-estudos";
import type { RegistroTelasIniciais } from "@estudos/ui";

export const telasIniciais: RegistroTelasIniciais = {
	estudos: telaInicialEstudos,
};
