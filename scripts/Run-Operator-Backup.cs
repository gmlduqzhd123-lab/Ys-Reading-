using System;
using System.Diagnostics;
using System.IO;

// Compiled as a Windows application: no console to close or inherit Ctrl+C.
// No credentials or backup contents are passed in arguments or written to logs.
internal static class BookforestBackupLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length != 2 || !Path.IsPathRooted(args[0]) || !Path.IsPathRooted(args[1])) return 1;
            string node = Path.GetFullPath(args[0]);
            string runner = Path.GetFullPath(args[1]);
            if (!File.Exists(node) || !File.Exists(runner) ||
                !String.Equals(Path.GetFileName(node), "node.exe", StringComparison.OrdinalIgnoreCase) ||
                !(String.Equals(Path.GetFileName(runner), "operator-scheduled.mjs", StringComparison.OrdinalIgnoreCase) ||
                  String.Equals(Path.GetFileName(runner), "operator-watchdog.mjs", StringComparison.OrdinalIgnoreCase))) return 1;
            ProcessStartInfo start = new ProcessStartInfo(node, "\"" + runner + "\"");
            start.WorkingDirectory = Directory.GetParent(Path.GetDirectoryName(runner)).FullName;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            using (Process child = new Process())
            {
                child.StartInfo = start;
                // Drain both streams without retaining confidential provider output.
                child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { };
                child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { };
                if (!child.Start()) return 1;
                child.StandardInput.Close();
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch { return 1; }
    }
}
