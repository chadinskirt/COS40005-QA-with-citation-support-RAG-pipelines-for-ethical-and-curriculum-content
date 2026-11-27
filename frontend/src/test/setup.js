import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no layout, so scrolling is a no-op.
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

// Node 22+ has its own localStorage global, which is undefined without --localstorage-file and hides jsdom's.
if (!globalThis.localStorage) {
  const data = new Map();
  const storage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
