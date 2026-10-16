import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom lacks ResizeObserver/DOMMatrix, which React Flow needs
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
// @ts-expect-error minimal stub
globalThis.DOMMatrixReadOnly ??= class { m22 = 1; constructor() {} };
