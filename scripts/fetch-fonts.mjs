#!/usr/bin/env node
/* ============================================================
   Кладём веб-шрифты рядом с дизайн-системой и переписываем
   tokens/fonts.css на локальные @font-face.

   Дизайн-система сама просит это сделать: «Шрифты подключаются
   с Google Fonts, а не самохостятся — иронично для этого проекта.»
   Планировщик обещает «LOCAL · NO CLOUD» в шапке, значит ни одного
   запроса наружу при загрузке страницы быть не должно.

   Запуск: npm run fonts   (нужен интернет; результат коммитится)
   ============================================================ */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DS_DIR = 'shff-design-system-97e1cccc-d574-4ca0-8cca-082936ace282';
const ROOT = path.resolve(import.meta.dirname, '..');
const FONT_DIR = path.join(ROOT, '_ds', DS_DIR, 'assets', 'fonts');
const CSS_FILE = path.join(ROOT, '_ds', DS_DIR, 'tokens', 'fonts.css');

/** Интерфейс на русском, поэтому кириллица обязательна. */
const SUBSETS = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']);

const SOURCE =
  'https://fonts.googleapis.com/css2' +
  '?family=Inter:wght@400;500;600;700' +
  '&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400' +
  '&display=swap';

// без браузерного UA Google отдаёт ttf вместо woff2
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function field(block, name) {
  const match = block.match(new RegExp(name + ':\\s*([^;]+);'));
  return match ? match[1].trim() : null;
}

/**
 * Имя файла для одного @font-face. Inter и JetBrains Mono — переменные
 * шрифты: на все начертания одного подмножества приходится один файл,
 * поэтому вес в имя попадает только если файлы правда разные.
 */
function makeNamer() {
  const byUrl = new Map();
  const used = new Set();

  return (url, family, weight, style, subset) => {
    const known = byUrl.get(url);
    if (known) return { file: known, fresh: false };

    const base = family.replace(/[^A-Za-z0-9]+/g, '');
    const italic = style === 'italic';
    let file = `${base}-${subset}${italic ? '-italic' : ''}.woff2`;
    if (used.has(file)) file = `${base}-${weight}${italic ? 'i' : ''}-${subset}.woff2`;

    used.add(file);
    byUrl.set(url, file);
    return { file, fresh: true };
  };
}

async function main() {
  const response = await fetch(SOURCE, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`Google Fonts ответил ${response.status}`);
  const css = await response.text();

  // каталог целиком генерируемый: чистим, чтобы не оставлять сирот от прошлых запусков
  await rm(FONT_DIR, { recursive: true, force: true });
  await mkdir(FONT_DIR, { recursive: true });

  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
  if (!blocks.length) throw new Error('Не разобрал ответ Google Fonts: нет @font-face');

  const rules = [];
  const nameFor = makeNamer();
  let downloaded = 0;

  for (const [, subset, body] of blocks) {
    if (!SUBSETS.has(subset)) continue;

    const family = (field(body, 'font-family') ?? '').replace(/['"]/g, '');
    const weight = field(body, 'font-weight') ?? '400';
    const style = field(body, 'font-style') ?? 'normal';
    const range = field(body, 'unicode-range');
    const url = (field(body, 'src') ?? '').match(/url\((https:[^)]+)\)/)?.[1];
    if (!family || !url) continue;

    const { file, fresh } = nameFor(url, family, weight, style, subset);
    if (fresh) {
      const binary = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!binary.ok) throw new Error(`Не скачался ${url}: ${binary.status}`);
      await writeFile(path.join(FONT_DIR, file), Buffer.from(await binary.arrayBuffer()));
      downloaded++;
    }

    rules.push(
      [
        '@font-face {',
        `  font-family: '${family}';`,
        `  font-style: ${style};`,
        `  font-weight: ${weight};`,
        '  font-display: swap;',
        `  src: url('../assets/fonts/${file}') format('woff2');`,
        range ? `  unicode-range: ${range};` : null,
        '}',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const header = [
    '/* ============================================================',
    '   Webfonts — JetBrains Mono (интерфейс) + Inter (проза).',
    '   Самохостятся: файлы лежат в assets/fonts, наружу не ходим.',
    '   Файл сгенерирован scripts/fetch-fonts.mjs — правь скрипт, не файл.',
    `   Источник: ${SOURCE}`,
    '   ============================================================ */',
    '',
  ].join('\n');

  await writeFile(CSS_FILE, header + rules.join('\n\n') + '\n', 'utf8');

  const files = (await readdir(FONT_DIR)).filter((f) => f.endsWith('.woff2'));
  process.stdout.write(
    `Шрифты на месте: файлов ${files.length} (скачано ${downloaded}), правил @font-face ${rules.length}\n` +
      `  ${path.relative(ROOT, FONT_DIR)}\n  ${path.relative(ROOT, CSS_FILE)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Не получилось: ${error.message}\n`);
  process.exit(1);
});
