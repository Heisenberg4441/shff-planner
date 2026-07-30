/* Точка входа: поднять, доложить, аккуратно погаснуть. */

import { buildApp } from './app';
import { loadConfig } from './config';

function banner(lines: Array<[string, string]>): string {
  const width = Math.max(...lines.map(([k]) => k.length));
  return lines.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`).join('\n');
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { app, seed } = buildApp(cfg);

  await app.listen({ port: cfg.port, host: cfg.host });

  const shown = cfg.host === '0.0.0.0' || cfg.host === '::' ? 'localhost' : cfg.host;
  process.stdout.write(
    '\n$ shff-planner up\n' +
      banner([
        ['версия', cfg.version],
        ['адрес', `http://${shown}:${cfg.port}`],
        ['база', cfg.dbPath],
        ['интерфейс', cfg.staticDir ?? '— (не собран, для разработки поднимай vite)'],
        ['вход', cfg.authPassword ? 'по паролю' : 'свободный (доверенная сеть)'],
        ['данные', seed.freshDatabase ? 'база создана' : 'база на месте'],
        ...(seed.demoDays ? ([['демо', `засеяно суток: ${seed.demoDays}`]] as Array<[string, string]>) : []),
      ]) +
      '\n\n// Freedom can only live at home.\n\n',
  );

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'останавливаюсь');
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, 'ошибка при остановке');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'необработанный reject');
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(`Не удалось запустить сервис: ${String(error)}\n`);
  process.exit(1);
});
