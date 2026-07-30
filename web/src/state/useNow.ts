import { useEffect, useState } from 'react';

/**
 * Настоящее время. Прототип рисовал 14:20 навсегда — здесь линия
 * «сейчас» и карточка текущего блока живут по часам браузера,
 * а не по часам сервера: сутки принадлежат тому, кто их проживает.
 */
export function useNow(intervalMs = 20000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs]);

  return now;
}
