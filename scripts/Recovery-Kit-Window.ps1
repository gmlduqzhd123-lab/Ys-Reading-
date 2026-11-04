param([ValidateSet('prepare','verify')][string]$Mode='prepare',[string]$InitialDirectory='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='Bookforest - Encrypted Recovery Kit'
$form.Size=New-Object Drawing.Size(650,390)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$label=New-Object Windows.Forms.Label
$label.Text='Choose an external folder. Enter a new 20-200 character passphrase twice. Keep it separately.'
$label.Location=New-Object Drawing.Point(20,20)
$label.Size=New-Object Drawing.Size(600,45)
$form.Controls.Add($label)
$folder=New-Object Windows.Forms.TextBox
$folder.Location=New-Object Drawing.Point(20,75)
$folder.Size=New-Object Drawing.Size(470,25)
$folder.ReadOnly=$true
if($InitialDirectory -and (Test-Path -LiteralPath $InitialDirectory -PathType Container)){$folder.Text=$InitialDirectory}
$form.Controls.Add($folder)
$browse=New-Object Windows.Forms.Button
$browse.Text='Choose folder'
$browse.Location=New-Object Drawing.Point(500,72)
$browse.Size=New-Object Drawing.Size(120,30)
$browse.Add_Click({$d=New-Object Windows.Forms.FolderBrowserDialog;if($d.ShowDialog($form) -eq 'OK'){$folder.Text=$d.SelectedPath}})
$form.Controls.Add($browse)
$passLabel=New-Object Windows.Forms.Label
$passLabel.Text='Recovery passphrase'
$passLabel.Location=New-Object Drawing.Point(20,125)
$passLabel.Size=New-Object Drawing.Size(190,25)
$form.Controls.Add($passLabel)
$pass=New-Object Windows.Forms.TextBox
$pass.UseSystemPasswordChar=$true
$pass.Location=New-Object Drawing.Point(210,120)
$pass.Size=New-Object Drawing.Size(410,25)
$pass.MaxLength=200
$form.Controls.Add($pass)
$repeatLabel=New-Object Windows.Forms.Label
$repeatLabel.Text='Repeat passphrase'
$repeatLabel.Location=New-Object Drawing.Point(20,170)
$repeatLabel.Size=New-Object Drawing.Size(190,25)
$form.Controls.Add($repeatLabel)
$repeat=New-Object Windows.Forms.TextBox
$repeat.UseSystemPasswordChar=$true
$repeat.Location=New-Object Drawing.Point(210,165)
$repeat.Size=New-Object Drawing.Size(410,25)
$repeat.MaxLength=200
$form.Controls.Add($repeat)
$status=New-Object Windows.Forms.Label
$status.Location=New-Object Drawing.Point(20,260)
$status.Size=New-Object Drawing.Size(600,70)
$status.Text='No password is sent to chat or saved in plain text.'
$form.Controls.Add($status)
$prepare=New-Object Windows.Forms.Button
$prepare.Text=if($Mode -eq 'prepare'){'Prepare encrypted kit'}else{'Verify recovery kit'}
$prepare.Location=New-Object Drawing.Point(210,210)
$prepare.Size=New-Object Drawing.Size(250,35)
$prepare.Add_Click({
 if(!$folder.Text -or $pass.Text.Length -lt 20 -or $pass.Text -cne $repeat.Text){$status.Text='Choose a folder and enter matching 20+ character passphrases.';return}
 $prepare.Enabled=$false;$browse.Enabled=$false;$status.Text='Verifying encrypted backup and recovery key. Please wait.';$form.Refresh()
 try{
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=(Get-Command node.exe -ErrorAction Stop).Source
  $start.Arguments='"'+(Join-Path $PSScriptRoot 'operator-recovery-kit.mjs')+'" '+$Mode
  $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $child=[Diagnostics.Process]::Start($start)
  $payloadBytes=[Text.Encoding]::UTF8.GetBytes((@{passphrase=$pass.Text;directory=$folder.Text}|ConvertTo-Json -Compress))
  $child.StandardInput.BaseStream.Write($payloadBytes,0,$payloadBytes.Length)
  $child.StandardInput.BaseStream.Flush()
  $child.StandardInput.Close()
  $pass.Clear();$repeat.Clear()
  $output=$child.StandardOutput.ReadToEnd();$safeError=$child.StandardError.ReadToEnd()
  $child.WaitForExit()
  if($child.ExitCode -ne 0){$status.Text='Preparation failed. Check destination, passphrase or recent backup. No plaintext key was saved.'}
  else{$status.Text=if($Mode -eq 'prepare'){'Encrypted recovery kit prepared. Keep the passphrase separately. Verify on another PC.'}else{'Portable recovery key and isolated database restore verified.'}}
 }catch{$status.Text='The recovery tool could not run. Ask to check the Bookforest recovery setup.'}
 finally{$prepare.Enabled=$true;$browse.Enabled=$true}
})
$form.Controls.Add($prepare)
$form.AcceptButton=$prepare
$null=$form.ShowDialog()
