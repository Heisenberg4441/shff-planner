import { defineConfig } from 'vitest/config';

/**
 * Два набора тестов: домен и API в node, интерфейс — в jsdom
 * (его конфиг лежит в web/, там же плагин react).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
        },
      },
      './web',
    ],
  },
});
