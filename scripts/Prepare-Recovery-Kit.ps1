param([ValidateSet('prepare','verify')][string]$Mode='prepare')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object Windows.Forms.FolderBrowserDialog
$dialog.Description=if($Mode -eq 'prepare'){'Choose a recovery destination. Copy the encrypted kit off this PC.'}else{'Choose a Bookforest-Recovery folder to verify.'}
if($dialog.ShowDialog() -ne 'OK'){exit 0}
$secret=Read-Host 'Recovery passphrase (20+ characters, keep separately)' -AsSecureString
$confirmation=Read-Host 'Repeat recovery passphrase' -AsSecureString
$first=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$second=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
try {
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($first)
 if($plain.Length -lt 20 -or $plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($second)){throw 'Passphrases do not match or are too short.'}
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=(Get-Command node.exe -ErrorAction Stop).Source
 $start.Arguments='"'+(Join-Path $PSScriptRoot 'operator-recovery-kit.mjs')+'" '+$Mode
 $start.WorkingDirectory=Split-Path -Parent $PSScriptRoot
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true
 $child=[Diagnostics.Process]::Start($start)
 $payloadBytes=[Text.Encoding]::UTF8.GetBytes((@{passphrase=$plain;directory=$dialog.SelectedPath}|ConvertTo-Json -Compress))
 $child.StandardInput.BaseStream.Write($payloadBytes,0,$payloadBytes.Length)
 $child.StandardInput.BaseStream.Flush()
 $child.StandardInput.Close()
 $plain=$null
 $child.WaitForExit()
 if($child.ExitCode -ne 0){throw 'Recovery kit could not be verified.'}
} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($first);[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($second);$secret.Dispose();$confirmation.Dispose()}
