#!/usr/bin/env node
/* ============================================================
   Проверка живого сервиса: API, статика, поток событий.
   Гоняется по «песочнице» — сутки декабря 2099 года, — и убирает
   за собой, поэтому безопасна на рабочем экземпляре.

   npm run smoke                 # http://localhost:8787
   npm run smoke -- http://дом:8787 --login=admin --password=секрет
   ============================================================ */

import process from 'node:process';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:8787').replace(/\/+$/, '');
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const password = flag('password');
const login = flag('login') ?? 'admin';

/** Песочница: реальные сутки пользователя не трогаем. */
const SANDBOX = ['2099-12-28', '2099-12-29', '2099-12-30', '2099-12-31', '2099-12-25'];
const DAY = SANDBOX[3]; // 2099-12-31, четверг
const CLIENT = 'smoke-' + Math.random().toString(36).slice(2, 8);

let cookie = '';
let passed = 0;
const failures = [];

function ok(name, detail = '') {
  passed++;
  process.stdout.write(`  ok    ${name}${detail ? ' — ' + detail : ''}\n`);
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
  process.stdout.write(`  ПЛОХО ${name} — ${detail}\n`);
}

function check(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else fail(name, detail || 'условие не выполнено');
}

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Client-Id': CLIENT,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

async function head(path) {
  const response = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  await response.arrayBuffer();
  return response;
}

const titles = (blocks) => blocks.map((b) => `${b.title} ${b.start}-${b.end}`);

async function main() {
  process.stdout.write(`\n$ shff-plan smoke ${base}\n\n`);

  /* ---------- вход ---------- */
  const health = await call('GET', '/api/health');
  check('health отвечает', health.status === 200 && health.data?.status === 'ok', `версия ${health.data?.version}`);

  if (health.data?.auth === 'unconfigured') {
    throw new Error(
      'Доступ ещё не настроен: открой планировщик в браузере и пройди первый запуск ' +
        '(администратор или свободный вход).',
    );
  }

  if (health.data?.auth === 'account') {
    if (!password) throw new Error('Планировщик под паролем: добавь --login=… --password=…');
    const session = await call('POST', '/api/auth/login', { login, password });
    cookie = (session.headers.get('set-cookie') ?? '').split(';')[0];
    check('вход по логину и паролю', session.status === 200 && cookie.startsWith('shff_session='), login);
  } else {
    ok('вход свободный');
  }

  const boot = await call('GET', `/api/bootstrap?view=day&date=${DAY}`);
  check(
    'bootstrap отдаёт настройки и категории',
    boot.status === 200 && boot.data.categories.length > 0 && boot.data.templates.length > 0,
    `${boot.data?.categories?.length} категорий, ${boot.data?.templates?.length} шаблонов`,
  );
  const category = boot.data.categories[0].id;

  /* ---------- блоки ---------- */
  await call('PUT', `/api/days/${DAY}`, { blocks: [] });

  const created = await call('POST', '/api/blocks', {
    date: DAY,
    start: 480,
    end: 720,
    title: 'Deep: проверка API',
    category,
    note: 'кириллица и пробелы',
  });
  check('блок поставлен', created.status === 201 && created.data.blocks.length === 1, created.data?.op?.kind);

  const pause = await call('POST', '/api/blocks', {
    date: DAY,
    start: 585,
    end: 600,
    title: 'Пауза',
    category,
  });
  check(
    'блок внутри длинного окна делит его на два',
    pause.status === 201 && pause.data.blocks.length === 3,
    titles(pause.data.blocks ?? []).join(' | '),
  );

  const undone = await call('POST', '/api/undo', {});
  const afterUndo = await call('GET', `/api/days/${DAY}`);
  check(
    'undo возвращает разметку как было',
    undone.status === 200 && afterUndo.data.blocks.length === 1 && afterUndo.data.blocks[0].end === 720,
    undone.data?.undone?.summary,
  );

  const rejected = await call('POST', '/api/blocks', {
    date: DAY,
    start: 500,
    end: 600,
    title: 'Спорный',
    category,
    overlap: 'reject',
  });
  check('overlap=reject возвращает конфликт', rejected.status === 409, `конфликтов: ${rejected.data?.conflicts?.length}`);

  /* ---------- шаблоны и раскатка ---------- */
  const template = boot.data.templates.find((t) => t.rows.length > 0);
  const applied = await call('PUT', `/api/days/${DAY}`, { templateId: template.id });
  check(
    'шаблон применяется к суткам',
    applied.status === 200 && applied.data.blocks.length === template.rows.length,
    `${template.name} → блоков: ${applied.data?.blocks?.length}`,
  );

  const duplicated = await call('POST', '/api/duplicate', {
    sourceDate: DAY,
    scope: 'workweek',
    mode: 'replace',
    weekdays: [1, 2, 3, 4, 5],
  });
  check(
    'сутки раскатываются на будни недели',
    duplicated.status === 200 && duplicated.data.targets.length === 4,
    `дней: ${duplicated.data?.targets?.length}`,
  );

  const dupUndo = await call('POST', '/api/undo', {});
  const target = await call('GET', '/api/days/2099-12-29');
  check('undo снимает раскатку', dupUndo.status === 200 && target.data.blocks.length === 0);

  /* ---------- валидация ---------- */
  const bad = [
    ['конец не позже начала', { date: DAY, start: 600, end: 600, title: 'x', category }],
    ['несуществующая дата', { date: '2099-02-31', start: 600, end: 660, title: 'x', category }],
    ['неизвестная категория', { date: DAY, start: 600, end: 660, title: 'x', category: 'нет-такой' }],
    ['минуты за границей суток', { date: DAY, start: 600, end: 2000, title: 'x', category }],
  ];
  for (const [name, payload] of bad) {
    const response = await call('POST', '/api/blocks', payload);
    check(`отказ: ${name}`, response.status === 400, `код ${response.status}`);
  }
  const missing = await call('GET', '/api/nope');
  check('нет маршрута — 404 json', missing.status === 404 && missing.data?.error === 'not_found');

  /* ---------- бекап ---------- */
  const dump = await call('GET', '/api/export');
  check(
    'экспорт собирается',
    dump.status === 200 && Array.isArray(dump.data.blocks) && dump.data.app === 'shff-planner',
    `блоков ${dump.data?.blocks?.length}, файл ${(dump.headers.get('content-disposition') ?? '').slice(0, 60)}`,
  );

  /* ---------- статика ---------- */
  const index = await head('/');
  const html = await (await fetch(base + '/', { headers: cookie ? { Cookie: cookie } : {} })).text();
  check('/ отдаёт интерфейс', index.status === 200 && html.includes('<div id="root">'));

  const deep = await head('/week/2099-12-31');
  check('любой путь отдаёт SPA', deep.status === 200 && deep.headers.get('content-type')?.includes('text/html'));

  const cssPath = html.match(/\/assets\/index-[^"']+\.css/)?.[0];
  if (cssPath) {
    const css = await head(cssPath);
    check(
      'css отдаётся с бессрочным кешем',
      css.status === 200 && (css.headers.get('cache-control') ?? '').includes('immutable'),
    );
    const cssText = await (await fetch(base + cssPath)).text();
    const fontPath = cssText.match(/\/assets\/[^)"']+\.woff2/)?.[0];
    const font = fontPath ? await head(fontPath) : null;
    check(
      'шрифты лежат локально, наружу не ходим',
      !!font && font.status === 200 && !/fonts\.(googleapis|gstatic)\.com/.test(cssText),
      fontPath ?? 'шрифт не найден в css',
    );
  } else {
    fail('css найден в index.html', 'ссылки на сборку нет');
  }

  /* ---------- поток событий ---------- */
  await new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      fail('поток событий', 'событие не пришло за 6 секунд');
      resolve();
    }, 6000);

    fetch(base + '/api/events', {
      headers: { Accept: 'text/event-stream', ...(cookie ? { Cookie: cookie } : {}) },
      signal: controller.signal,
    })
      .then(async (response) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // толкаем изменение из «другого клиента»
        setTimeout(() => {
          void fetch(base + '/api/blocks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Id': 'smoke-other',
              ...(cookie ? { Cookie: cookie } : {}),
            },
            body: JSON.stringify({
              date: SANDBOX[4],
              start: 1380,
              end: 1440,
              title: 'Событие',
              category,
            }),
          });
        }, 300);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (!buffer.includes('event: change')) continue;
          const payload = buffer.split('event: change')[1]?.match(/data: (.+)/)?.[1];
          const event = payload ? JSON.parse(payload) : null;
          clearTimeout(timer);
          controller.abort();
          check(
            'поток событий доносит изменения',
            !!event && event.days?.includes(SANDBOX[4]),
            `revision ${event?.revision}, дни ${event?.days?.join(',')}`,
          );
          resolve();
          return;
        }
      })
      .catch(() => {
        /* abort — это наш собственный выход */
      });
  });

  /* ---------- уборка ---------- */
  for (const day of SANDBOX) await call('PUT', `/api/days/${day}`, { blocks: [] });
  const left = await Promise.all(SANDBOX.map((day) => call('GET', `/api/days/${day}`)));
  check(
    'песочница убрана',
    left.every((response) => response.data.blocks.length === 0),
  );
}

main()
  .then(() => {
    process.stdout.write(`\n// проверок пройдено: ${passed}, провалено: ${failures.length}\n\n`);
    process.exit(failures.length ? 1 : 0);
  })
  .catch((error) => {
    process.stderr.write(`\nСмоук упал: ${error.message}\n`);
    process.exit(1);
  });
