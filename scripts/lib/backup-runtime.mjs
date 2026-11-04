import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
/** @param {{localAppData?: string, override?: string|null, commandPath?: string|null}} [options] */
export function resolveBackupCodex({
  localAppData = process.env.LOCALAPPDATA,
  override,
  commandPath,
} = {}) {
  const roots = localAppData
    ? [
        path.join(localAppData, "OpenAI", "Codex", "bin"),
        path.join(
          localAppData,
          "Packages",
          "OpenAI.Codex_2p2nqsd0c76g0",
          "LocalCache",
          "Local",
          "OpenAI",
          "Codex",
          "bin",
        ),
      ]
    : [];
  if (commandPath === undefined) {
    const found = spawnSync("where.exe", ["codex.exe"], {
      encoding: "utf8",
      windowsHide: true,
    });
    commandPath =
      found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0] : null;
  }
  let installed = [];
  for (const root of roots)
    if (fs.existsSync(root))
      installed.push(
        ...fs
          .readdirSync(root, { withFileTypes: true })
          .filter((x) => x.isDirectory() && !x.isSymbolicLink())
          .map((x) => path.join(root, x.name, "codex.exe"))
          .filter((x) => fs.existsSync(x))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs),
      );
  for (const candidate of [commandPath, ...installed, override])
    if (
      candidate &&
      path.isAbsolute(candidate) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    )
      return candidate;
  throw Error("BACKUP_CODEX_UNAVAILABLE");
}
