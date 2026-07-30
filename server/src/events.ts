/* ============================================================
   Живые обновления. Планировщик открыт на ноутбуке и на телефоне
   одновременно — тот, кто не менял, должен узнать об изменении сам.
   SSE, потому что поток нужен в одну сторону и переподключение
   браузер делает без нашего кода.
   ============================================================ */

export interface PlannerEvent {
  kind: string;
  revision: number;
  days?: string[];
  opId?: string | null;
  /** Идентификатор клиента-инициатора: он уже применил ответ и эхо игнорирует. */
  origin?: string | null;
}

export interface EventSink {
  write: (chunk: string) => void;
}

export function createEvents() {
  let revision = 0;
  const clients = new Set<EventSink>();

  return {
    get revision(): number {
      return revision;
    },
    get clientCount(): number {
      return clients.size;
    },
    subscribe(sink: EventSink): () => void {
      clients.add(sink);
      return () => clients.delete(sink);
    },
    publish(payload: Omit<PlannerEvent, 'revision'>): number {
      revision += 1;
      const event: PlannerEvent = { ...payload, revision };
      const frame = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
      for (const client of [...clients]) {
        try {
          client.write(frame);
        } catch {
          clients.delete(client);
        }
      }
      return revision;
    },
  };
}

export type Events = ReturnType<typeof createEvents>;
