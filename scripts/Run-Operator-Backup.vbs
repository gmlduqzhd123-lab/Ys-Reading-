Option Explicit
Dim shell, files, runner, node, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
node = WScript.Arguments(0)
runner = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "operator-scheduled.mjs")
If Not files.FileExists(node) Or Not files.FileExists(runner) Then WScript.Quit 1
shell.CurrentDirectory = files.GetParentFolderName(files.GetParentFolderName(runner))
' Hide the console so closing an unrelated terminal cannot interrupt the backup.
result = shell.Run(Chr(34) & node & Chr(34) & " " & Chr(34) & runner & Chr(34), 0, True)
WScript.Quit result
