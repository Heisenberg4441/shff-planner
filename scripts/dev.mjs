#!/usr/bin/env node
/* ============================================================
   Разработка: бекенд с перезапуском и vite рядом.
   API живёт на :8787, интерфейс на :5173 и проксирует /api туда.
   Ctrl+C гасит оба.
   ============================================================ */

import { spawn } from 'node:child_process';
import process from 'node:process';
import readline from 'node:readline';

const API_PORT = process.env.SHFF_PORT ?? '8787';

const parts = [
  {
    name: 'api',
    args: ['run', 'dev', '--workspace', 'server'],
    env: { SHFF_PORT: API_PORT, SHFF_LOG_LEVEL: process.env.SHFF_LOG_LEVEL ?? 'info' },
  },
  {
    name: 'web',
    args: ['run', 'dev', '--workspace', 'web'],
    env: { SHFF_DEV_API: `http://127.0.0.1:${API_PORT}` },
  },
];

const children = [];
let stopping = false;

function pipe(name, stream) {
  readline.createInterface({ input: stream }).on('line', (line) => {
    process.stdout.write(`[${name}] ${line}\n`);
  });
}

for (const part of parts) {
  const child = spawn('npm', part.args, {
    env: { ...process.env, ...part.env },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(part.name, child.stdout);
  pipe(part.name, child.stderr);
  child.on('exit', (code) => {
    if (stopping) return;
    process.stdout.write(`[${part.name}] упал с кодом ${code}\n`);
    stop(code ?? 1);
  });
  children.push(child);
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* уже мёртв */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

process.stdout.write(
  '\n$ shff-planner dev\n' +
    `  api  http://localhost:${API_PORT}\n` +
    '  web  http://localhost:5173   ← открывай это\n\n',
);
