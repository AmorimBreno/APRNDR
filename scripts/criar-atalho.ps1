# Cria na área de trabalho os atalhos do app:
#   Estudos.lnk        -> wscript.exe launcher\iniciar.vbs (sobe o app sem janela e abre o Edge)
#   Parar Estudos.lnk  -> wscript.exe launcher\parar.vbs   (encerra o app)
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
# O ícone é o do Edge por enquanto (o app abre nele); um ícone próprio pode vir
# depois. Se o Edge não for encontrado, o atalho fica com o ícone do wscript.

$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$areaDeTrabalho = [Environment]::GetFolderPath("Desktop")

$edge = @(
	(Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
	(Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

function Criar-Atalho($nome, $vbs, $descricao) {
	$caminhoVbs = Join-Path $raiz "launcher\$vbs"
	if (-not (Test-Path $caminhoVbs)) { throw "Não encontrei $caminhoVbs" }
	$destino = Join-Path $areaDeTrabalho "$nome.lnk"
	$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut($destino)
	$atalho.TargetPath = $wscript
	# Aspas no caminho do .vbs: a pasta do repositório pode ter espaços.
	$atalho.Arguments = "`"$caminhoVbs`""
	$atalho.WorkingDirectory = $raiz
	$atalho.Description = $descricao
	if ($edge) { $atalho.IconLocation = "$edge,0" }
	$atalho.Save()
	Write-Host "Atalho criado: $destino"
	Write-Host "  alvo: $wscript `"$caminhoVbs`""
}

Criar-Atalho "Estudos" "iniciar.vbs" "Abre o app de estudos (sobe o servidor se preciso)"
Criar-Atalho "Parar Estudos" "parar.vbs" "Encerra o app de estudos (servidor e Vite)"
