import { useEffect, useRef, useState } from 'react';

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Whether the browser has a network connection, kept up to date as it drops
 * and comes back. Outside a browser it is always true.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(browserOnline);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setOnline(browserOnline());
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}

/**
 * Calls `onReconnect` each time the connection comes back after dropping.
 * Live updates sent while offline are lost, so a screen uses this to read its
 * data again instead of showing what it had before the drop.
 */
export function useOnReconnect(onReconnect: () => void): boolean {
  const online = useOnline();
  const wasOnline = useRef(online);
  const callback = useRef(onReconnect);
  callback.current = onReconnect;

  useEffect(() => {
    if (online && !wasOnline.current) callback.current();
    wasOnline.current = online;
  }, [online]);

  return online;
}
