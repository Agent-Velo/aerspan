import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getWorkingEsbuildBinaryPath() {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/esbuild/bin/esbuild'),
    // Fallback for sandboxed environments where binaries under web-v2 may be blocked.
    path.resolve(process.cwd(), '../web/node_modules/esbuild/bin/esbuild'),
  ];

  for (const candidate of candidates) {
    if (!isExecutable(candidate)) continue;
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function getBin(name) {
  const file = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.resolve(process.cwd(), 'node_modules/.bin', file);
}

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
}

const env = { ...process.env };

const esbuildBinaryPath = getWorkingEsbuildBinaryPath();
if (esbuildBinaryPath) {
  env.ESBUILD_BINARY_PATH = esbuildBinaryPath;
}

const viteArgs = process.argv.slice(2);
run(getBin('vite'), viteArgs, env);

