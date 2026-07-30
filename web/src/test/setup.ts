import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/** jsdom не знает про SSE — в тестах поток событий просто не подключается. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

vi.stubGlobal('EventSource', FakeEventSource);

afterEach(() => {
  cleanup();
});
