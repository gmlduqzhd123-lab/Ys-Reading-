$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework
$bookWindow=New-Object Windows.Window
$bookWindow.Title='Bookforest - Private Book Provider Setup'
$bookWindow.Width=540;$bookWindow.Height=300;$bookWindow.ResizeMode='NoResize';$bookWindow.WindowStartupLocation='CenterScreen'
$bookPanel=New-Object Windows.Controls.StackPanel;$bookPanel.Margin='20'
$bookText=New-Object Windows.Controls.TextBlock;$bookText.Text='Choose provider and enter its private API key. Never send it in chat.';$bookText.TextWrapping='Wrap';$bookPanel.Children.Add($bookText)|Out-Null
$bookProvider=New-Object Windows.Controls.ComboBox;$bookProvider.Items.Add('aladin')|Out-Null;$bookProvider.Items.Add('kakao')|Out-Null;$bookProvider.SelectedIndex=0;$bookProvider.Margin='0,15,0,10';$bookPanel.Children.Add($bookProvider)|Out-Null
$bookKey=New-Object Windows.Controls.PasswordBox;$bookKey.Margin='0,0,0,15';$bookPanel.Children.Add($bookKey)|Out-Null
$bookButton=New-Object Windows.Controls.Button;$bookButton.Content='Verify and save privately';$bookButton.Height=34;$bookPanel.Children.Add($bookButton)|Out-Null
$bookStatus=New-Object Windows.Controls.TextBlock;$bookStatus.Margin='0,12,0,0';$bookStatus.TextWrapping='Wrap';$bookPanel.Children.Add($bookStatus)|Out-Null
$bookButton.Add_Click({
 $bookButton.IsEnabled=$false
 try{
  $bookStart=New-Object Diagnostics.ProcessStartInfo;$bookStart.FileName=(Get-Command node.exe).Source;$bookStart.Arguments='"'+(Join-Path $PSScriptRoot 'operator-import-book-key.mjs')+'"';$bookStart.UseShellExecute=$false;$bookStart.CreateNoWindow=$true;$bookStart.RedirectStandardInput=$true;$bookStart.RedirectStandardOutput=$true;$bookStart.RedirectStandardError=$true
  $bookProcess=[Diagnostics.Process]::Start($bookStart)
  $bookProcess.StandardInput.WriteLine((@{provider=$bookProvider.SelectedItem;key=$bookKey.Password}|ConvertTo-Json -Compress));$bookProcess.StandardInput.Close();$bookKey.Clear()
  $bookOutput=$bookProcess.StandardOutput.ReadToEnd();$null=$bookProcess.StandardError.ReadToEnd();$bookProcess.WaitForExit()
  if($bookProcess.ExitCode -ne 0){throw 'not verified'}
  $bookStatus.Text='Verified and saved locally. Ask to register the key in Vercel before public use.'
 }catch{$bookStatus.Text='Not saved. Check provider, key and network. No key was displayed.'}
 finally{$bookButton.IsEnabled=$true}
})
$bookWindow.Content=$bookPanel;$null=$bookWindow.ShowDialog()
