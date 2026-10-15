' Lançador sem janela: roda "node launcher\iniciar.mjs" escondido. É o alvo do
' atalho "Estudos" da área de trabalho (criado por scripts\criar-atalho.ps1).
'
' Por que um .vbs: o wscript.exe não tem console, e o Run com estilo 0 cria o
' console do node já escondido. Um atalho direto para o node.exe abriria uma
' janela de terminal.

Option Explicit

Dim shell, fso, pasta, raiz
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Caminhos a partir da pasta deste .vbs, para funcionar de onde for chamado.
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(pasta)
shell.CurrentDirectory = raiz

' Sem o node no PATH, o Run abaixo falharia calado; melhor dizer o que houve.
' Acentos por ChrW: o wscript lê este arquivo como ANSI, e o repositório guarda
' texto em UTF-8 (nos comentários isso não importa).
If shell.Run("cmd.exe /d /c where node >NUL 2>&1", 0, True) <> 0 Then
	MsgBox "N" & ChrW(227) & "o encontrei o Node.js (node.exe) no PATH." & vbCrLf & vbCrLf & _
		"Instale o Node 24 ou confira o PATH do usu" & ChrW(225) & "rio e tente de novo.", vbExclamation, "Estudos"
	WScript.Quit 1
End If

' Estilo 0 = janela escondida; False = não espera (o iniciar.mjs avisa sozinho se falhar).
shell.Run "node """ & pasta & "\iniciar.mjs""", 0, False
