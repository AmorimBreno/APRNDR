' Encerra o app sem janela: roda "node launcher\parar.mjs" escondido. É o alvo
' do atalho "Parar Estudos" (criado por scripts\criar-atalho.ps1). Mesmo
' esquema do iniciar.vbs.

Option Explicit

Dim shell, fso, pasta
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = fso.GetParentFolderName(pasta)

' Acentos por ChrW: o wscript lê este arquivo como ANSI, e o repositório guarda
' texto em UTF-8 (nos comentários isso não importa).
If shell.Run("cmd.exe /d /c where node >NUL 2>&1", 0, True) <> 0 Then
	MsgBox "N" & ChrW(227) & "o encontrei o Node.js (node.exe) no PATH." & vbCrLf & vbCrLf & _
		"Instale o Node 24 ou confira o PATH do usu" & ChrW(225) & "rio e tente de novo.", vbExclamation, "Estudos"
	WScript.Quit 1
End If

' True = espera o parar.mjs terminar (ele avisa sozinho se algo ficou rodando).
shell.Run "node """ & pasta & "\parar.mjs""", 0, True
