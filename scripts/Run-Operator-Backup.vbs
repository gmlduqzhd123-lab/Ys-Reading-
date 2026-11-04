Option Explicit
Dim shell, files, runner, node, result, tracePath, trace
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
node = WScript.Arguments(0)
runner = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "operator-scheduled.mjs")
If Not files.FileExists(node) Or Not files.FileExists(runner) Then WScript.Quit 1
shell.CurrentDirectory = files.GetParentFolderName(files.GetParentFolderName(runner))
tracePath = files.BuildPath(shell.CurrentDirectory, "work")
If files.FolderExists(tracePath) Then
  On Error Resume Next
  Set trace = files.CreateTextFile(files.BuildPath(tracePath, "scheduled-launch.json"), True)
  trace.Write "{""launcher"":""wscript"",""invoked"":true}"
  trace.Close
  On Error GoTo 0
End If
' Hide the console so closing an unrelated terminal cannot interrupt the backup.
result = shell.Run(Chr(34) & node & Chr(34) & " " & Chr(34) & runner & Chr(34), 0, True)
WScript.Quit result
