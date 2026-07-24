type AnyFunction = (...args: any[]) => unknown;

export const getGlobal = (): Record<string, unknown> =>
  globalThis as unknown as Record<string, unknown>;

export const getAtPath = (path: string): unknown => {
  let current: unknown = getGlobal();
  for (const part of path.split('.').filter(Boolean)) {
    if (
      current === null ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const callAtPath = (
  path: string,
  args: readonly unknown[],
  contextPath?: string,
): unknown => {
  const callable = getAtPath(path);
  if (typeof callable !== 'function') {
    throw new Error(`Native bridge "${path}" is not available.`);
  }
  return (callable as AnyFunction).apply(
    contextPath ? getAtPath(contextPath) : undefined,
    [...args],
  );
};

export const installAtPath = (
  path: string,
  callback: AnyFunction,
): (() => void) => {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('A native callback path cannot be empty.');
  }

  const created: Array<[Record<string, unknown>, string]> = [];
  let parent = getGlobal();
  for (const part of parts.slice(0, -1)) {
    const existing = parent[part];
    if (existing === undefined || existing === null) {
      const container: Record<string, unknown> = {};
      parent[part] = container;
      created.push([parent, part]);
      parent = container;
    } else {
      if (typeof existing !== 'object' && typeof existing !== 'function') {
        throw new Error(`Cannot install callback below non-object path "${part}".`);
      }
      parent = existing as Record<string, unknown>;
    }
  }

  const key = parts[parts.length - 1]!;
  const previous = parent[key];
  parent[key] = callback;
  return () => {
    if (parent[key] === callback) {
      if (previous === undefined) delete parent[key];
      else parent[key] = previous;
    }
    for (const [owner, createdKey] of created.reverse()) {
      const value = owner[createdKey];
      if (
        value &&
        typeof value === 'object' &&
        Object.keys(value as object).length === 0
      ) {
        delete owner[createdKey];
      }
    }
  };
};

export const parseNativeMessage = (input: unknown): unknown => {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
};

export const serializeError = (error: unknown): unknown =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : error;
