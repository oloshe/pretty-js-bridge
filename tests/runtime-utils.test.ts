import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callAtPath,
  getAtPath,
  getGlobal,
  installAtPath,
  parseNativeMessage,
  serializeError,
} from '../src/runtime-utils';

const root = globalThis as Record<string, any>;

afterEach(() => {
  delete root.__runtimeUtilsTest;
});

describe('runtime utilities', () => {
  it('reads the global object and safely traverses paths', () => {
    root.__runtimeUtilsTest = {
      nested: { value: 42 },
      primitive: 1,
    };

    expect(getGlobal()).toBe(root);
    expect(getAtPath('__runtimeUtilsTest.nested.value')).toBe(42);
    expect(getAtPath('__runtimeUtilsTest.missing.value')).toBeUndefined();
    expect(getAtPath('__runtimeUtilsTest.primitive.value')).toBeUndefined();
    expect(getAtPath('')).toBe(root);
  });

  it('calls functions with optional owner context and rejects missing functions', () => {
    root.__runtimeUtilsTest = {
      value: 4,
      multiply(this: { value: number }, factor: number) {
        return this.value * factor;
      },
    };
    const standalone = vi.fn((value: number) => value + 1);
    root.__runtimeUtilsTest.standalone = standalone;

    expect(
      callAtPath(
        '__runtimeUtilsTest.multiply',
        [3],
        '__runtimeUtilsTest',
      ),
    ).toBe(12);
    expect(callAtPath('__runtimeUtilsTest.standalone', [2])).toBe(3);
    expect(standalone).toHaveBeenCalledWith(2);
    expect(() => callAtPath('__runtimeUtilsTest.missing', [])).toThrow(
      'Native bridge "__runtimeUtilsTest.missing" is not available.',
    );
  });

  it('installs, restores, and removes callback paths', () => {
    const previous = vi.fn();
    root.__runtimeUtilsTest = { callbacks: { existing: previous } };
    const replacement = vi.fn();
    const restore = installAtPath(
      '__runtimeUtilsTest.callbacks.existing',
      replacement,
    );

    expect(root.__runtimeUtilsTest.callbacks.existing).toBe(replacement);
    restore();
    expect(root.__runtimeUtilsTest.callbacks.existing).toBe(previous);

    const removeCreated = installAtPath(
      '__runtimeUtilsTest.created.callback',
      replacement,
    );
    expect(root.__runtimeUtilsTest.created.callback).toBe(replacement);
    removeCreated();
    expect(root.__runtimeUtilsTest.created).toBeUndefined();
  });

  it('preserves externally replaced callbacks and non-empty created containers', () => {
    root.__runtimeUtilsTest = {};
    const installed = vi.fn();
    const external = vi.fn();
    const cleanup = installAtPath(
      '__runtimeUtilsTest.created.callback',
      installed,
    );
    root.__runtimeUtilsTest.created.callback = external;
    root.__runtimeUtilsTest.created.other = true;

    cleanup();

    expect(root.__runtimeUtilsTest.created.callback).toBe(external);
    expect(root.__runtimeUtilsTest.created.other).toBe(true);
  });

  it('rejects invalid installation paths', () => {
    root.__runtimeUtilsTest = { primitive: 1 };

    expect(() => installAtPath('', vi.fn())).toThrow(
      'A native callback path cannot be empty.',
    );
    expect(() =>
      installAtPath('__runtimeUtilsTest.primitive.callback', vi.fn()),
    ).toThrow(
      'Cannot install callback below non-object path "primitive".',
    );
  });

  it('parses JSON strings and serializes errors', () => {
    expect(parseNativeMessage({ value: 1 })).toEqual({ value: 1 });
    expect(parseNativeMessage('{"value":1}')).toEqual({ value: 1 });
    expect(parseNativeMessage('not-json')).toBe('not-json');

    const error = new TypeError('broken');
    expect(serializeError(error)).toEqual({
      name: 'TypeError',
      message: 'broken',
    });
    expect(serializeError('broken')).toBe('broken');
  });
});
