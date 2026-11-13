# Cria os atalhos do app, na área de trabalho e no Menu Iniciar:
#   Estudos.lnk (área de trabalho) e APRNDR.lnk (Menu Iniciar) -> wscript.exe launcher\iniciar.vbs
#       (sobe o app sem janela e abre a janela própria)
#   Parar Estudos.lnk (só na área de trabalho)                 -> wscript.exe launcher\parar.vbs
# O do Menu Iniciar (pasta Programas do usuário) é o que a pesquisa do Windows encontra:
# digitar "aprndr" abre o app. Não há "Parar" no Menu Iniciar: o app sempre abre e, para sair
# de verdade (janela e servidor), o botão "Sair do app" da tela de perfis faz o que o parar faz.
#
# Como rodar (não precisa mudar a política de execução do Windows):
#   powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
#
# Rode de novo se o repositório mudar de pasta: os caminhos gravados nos
# atalhos são absolutos, calculados a partir da pasta deste script.
#
# A área de trabalho vem de [Environment]::GetFolderPath("Desktop"), que acompanha
# o redirecionamento para o OneDrive quando ele existe.
#
# O ícone é o do professor (apps/desktop/assets/icone.ico). Se o arquivo faltar,
# usa o do Edge; se o Edge também não for encontrado, o atalho fica com o do wscript.

$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$areaDeTrabalho = [Environment]::GetFolderPath("Desktop")
$menuIniciar = [Environment]::GetFolderPath("Programs")

$icone = Join-Path $raiz "apps\desktop\assets\icone.ico"

$edge = @(
	(Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
	(Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

function Criar-Atalho($nome, $vbs, $descricao, $pasta = $areaDeTrabalho) {
	$caminhoVbs = Join-Path $raiz "launcher\$vbs"
	if (-not (Test-Path $caminhoVbs)) { throw "Não encontrei $caminhoVbs" }
	$destino = Join-Path $pasta "$nome.lnk"
	$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut($destino)
	$atalho.TargetPath = $wscript
	# Aspas no caminho do .vbs: a pasta do repositório pode ter espaços.
	$atalho.Arguments = "`"$caminhoVbs`""
	$atalho.WorkingDirectory = $raiz
	$atalho.Description = $descricao
	if (Test-Path $icone) { $atalho.IconLocation = "$icone,0" }
	elseif ($edge) { $atalho.IconLocation = "$edge,0" }
	$atalho.Save()
	Write-Host "Atalho criado: $destino"
	Write-Host "  alvo: $wscript `"$caminhoVbs`""
}

Criar-Atalho "Estudos" "iniciar.vbs" "Abre o app de estudos (sobe o servidor se preciso)"
Criar-Atalho "Parar Estudos" "parar.vbs" "Encerra o app de estudos (servidor e Vite)"
Criar-Atalho "APRNDR" "iniciar.vbs" "Abre o APRNDR (sobe o servidor se preciso)" $menuIniciar
