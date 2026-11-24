# Teste de foco do professor flutuante (docs/professor-flutuante.md, R1 e R4): a bolinha
# nunca pode roubar o foco de quem está escrevendo (o Samsung Notes com a S Pen).
#
# Com o app no ar e a bolinha ligada, rode na raiz do repositório (com a tela desbloqueada):
#   powershell -ExecutionPolicy Bypass -File scripts\testar-foco.ps1
#
# O que ele faz: abre o Bloco de Notas (no lugar do Samsung Notes, para não mexer nas suas notas),
# registra a janela em primeiro plano a cada 50 ms e, no meio, abre o chat com Ctrl+Alt+P e recolhe
# com Ctrl+Alt+P de novo. No fim, diz se o foco
# saiu do Bloco de Notas sem ser pelo chat aberto, e se voltou para ele depois de recolher.

param([int]$Espera = 3)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class JanelaAtiva {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@

function Processo-Ativo {
  $h = [JanelaAtiva]::GetForegroundWindow()
  $procId = 0
  [void][JanelaAtiva]::GetWindowThreadProcessId($h, [ref]$procId)
  try { (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { "?" }
}

function Atalho-CtrlAlt([byte]$tecla) {
  # Ctrl (0x11), Alt (0x12) e a tecla, apertando e soltando (KEYEVENTF_KEYUP = 2).
  [JanelaAtiva]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); [JanelaAtiva]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [JanelaAtiva]::keybd_event($tecla, 0, 0, [UIntPtr]::Zero); [JanelaAtiva]::keybd_event($tecla, 0, 2, [UIntPtr]::Zero)
  [JanelaAtiva]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); [JanelaAtiva]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
}

$registro = New-Object System.Collections.Generic.List[object]
function Observar([string]$fase, [int]$segundos) {
  $fim = (Get-Date).AddSeconds($segundos)
  while ((Get-Date) -lt $fim) {
    $registro.Add([pscustomobject]@{ Hora = (Get-Date).ToString("HH:mm:ss.fff"); Fase = $fase; Ativo = (Processo-Ativo) })
    Start-Sleep -Milliseconds 50
  }
}

Start-Process notepad
Start-Sleep -Seconds 2
$nomeBloco = Processo-Ativo
Write-Host "Janela de escrita: $nomeBloco"

Observar "parado (a bolinha à vista)" $Espera
Atalho-CtrlAlt 0x50   # P: abre o chat
Observar "chat aberto (pode ter foco)" $Espera
Atalho-CtrlAlt 0x50   # P: recolhe
Observar "depois de recolher" $Espera

$fora = $registro | Where-Object { $_.Fase -ne "chat aberto (pode ter foco)" -and $_.Ativo -ne $nomeBloco }
$voltou = ($registro | Where-Object { $_.Fase -eq "depois de recolher" } | Select-Object -Last 1).Ativo -eq $nomeBloco
$mudancas = $registro | Group-Object Fase, Ativo | ForEach-Object { "{0,-32} {1,-14} {2} amostras" -f $_.Group[0].Fase, $_.Group[0].Ativo, $_.Count }
$mudancas | ForEach-Object { Write-Host $_ }
if ($fora) { Write-Host "FALHOU: o foco saiu da janela de escrita fora do chat ($($fora.Count) amostras)." } else { Write-Host "OK: a bolinha não roubou o foco." }
if ($voltou) { Write-Host "OK: o foco voltou para a janela de escrita ao recolher." } else { Write-Host "ATENÇÃO: depois de recolher, o foco não voltou para a janela de escrita." }
Write-Host "Pode fechar o Bloco de Notas que o teste abriu (sem salvar)."
