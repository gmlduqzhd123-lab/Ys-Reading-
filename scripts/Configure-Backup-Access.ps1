Add-Type -AssemblyName System.Windows.Forms
$form = New-Object Windows.Forms.Form
$form.Text = 'Bookforest scheduled backup access'
$form.Size = New-Object Drawing.Size(600,290)
$form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Text = "Project: rbtqtkjnqtcnljvabisa`nProject Settings: Read; Database: Read-write. Scope to this project only.`nChoose an expiry within 90 days. No token is printed or sent to chat."
$label.Location = New-Object Drawing.Point(20,15)
$label.Size = New-Object Drawing.Size(550,65)
$token = New-Object Windows.Forms.TextBox
$token.Location = New-Object Drawing.Point(20,85)
$token.Width = 540
$token.UseSystemPasswordChar = $true
$expiry = New-Object Windows.Forms.DateTimePicker
$expiry.Location = New-Object Drawing.Point(20,120)
$expiry.MinDate = (Get-Date).AddDays(1)
$expiry.MaxDate = (Get-Date).AddDays(90)
$expiry.Value = (Get-Date).AddDays(90)
$button = New-Object Windows.Forms.Button
$button.Text = 'Check access and save encrypted'
$button.Location = New-Object Drawing.Point(20,160)
$button.Size = New-Object Drawing.Size(300,30)
$status = New-Object Windows.Forms.Label
$status.Location = New-Object Drawing.Point(20,200)
$status.Size = New-Object Drawing.Size(540,30)
$button.Add_Click({
 $button.Enabled=$false
 try{
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName='node.exe'
  $info.Arguments='"'+(Join-Path $PSScriptRoot 'operator-management.mjs')+'"'
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::Start($info)
  $process.StandardInput.Write((@{projectRef='rbtqtkjnqtcnljvabisa';token=$token.Text;expiresAt=$expiry.Value.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress))
  $process.StandardInput.Close()
  $reply=$process.StandardOutput.ReadToEnd()|ConvertFrom-Json
  $process.WaitForExit()
  if($process.ExitCode -eq 0 -and $reply.configured){$status.Text='Checked and saved encrypted. Scheduled backups will use this access.'}else{$status.Text='Not saved. Check project scope, expiry and database read/write permissions.'}
 }catch{$status.Text='Not saved. Check the entered credential and Node installation.'}
 finally{$token.Clear();$button.Enabled=$true}
})
$form.Controls.AddRange(@($label,$token,$expiry,$button,$status))
[void]$form.ShowDialog()
