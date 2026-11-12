import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no layout, so scrolling is a no-op.
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
