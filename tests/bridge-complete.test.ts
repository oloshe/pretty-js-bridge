import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import UmdPrettyJsBridge from '../src/umd';
import {
  PrettyJsBridge,
  UnsupportedBridgeMethodError,
  customTransport,
  type BridgeEnvelope,
  type BridgeEvent,
  type BridgeHandler,
  type BridgeMethod,
  type HandlerResultEnvelope,
} from '../src/public';

const root = globalThis as Record<string, any>;
const globalKeys = [
  '__prettyJsBridgeCallbacks',
  '__completeCallbacks',
  'same',
  'directEvent',
  'directHandler',
  'callJsBridge',
  'customEntry',
] as const;

let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleLog.mockRestore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of globalKeys) delete root[key];
});

const callbackFrom = (request: BridgeEnvelope): ((value: unknown) => void) =>
  request.$callbackName
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown>)[key],
      globalThis,
    ) as (value: unknown) => void;

describe('registration and logging', () => {
  it('uses console.log by default and exposes the UMD factories', () => {
    const bridge = PrettyJsBridge.register({
      methods: { ping: true },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });

    expect(consoleLog).toHaveBeenCalledWith(
      '[PrettyJsBridge] Bridge registered.',
      { methods: ['ping'], transports: ['test'] },
    );
    expect(UmdPrettyJsBridge).toBe(PrettyJsBridge);
    expect(UmdPrettyJsBridge.customTransport).toBe(customTransport);
    bridge.$destroy();
  });

  it('uses a custom logger for registration, calls, callbacks, and settlement', async () => {
    const logger = vi.fn();
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register({
      logger,
      methods: { ping: true },
      transports: [
        customTransport({
          name: 'logged',
          send: (message) => {
            request = message as BridgeEnvelope;
          },
        }),
      ],
    });

    const result = bridge.ping('value');
    callbackFrom(request!)({ data: 'done' });
    await expect(result).resolves.toBe('done');

    expect(logger.mock.calls.map(([message]) => message)).toEqual(
      expect.arrayContaining([
        '[PrettyJsBridge] Bridge registered.',
        '[PrettyJsBridge] Calling native method.',
        '[PrettyJsBridge] Sending bridge message.',
        '[PrettyJsBridge] Native callback received.',
        '[PrettyJsBridge] Bridge call resolved.',
      ]),
    );
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('supports the curried registrar and rejects reserved or unknown methods', async () => {
    const logger = vi.fn();
    const register = PrettyJsBridge.register<{
      ping: () => string;
    }>();
    const bridge = register({
      logger,
      methods: { ping: true },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });

    await expect(
      (bridge.$invoke as (name: string) => Promise<unknown>)('missing'),
    ).rejects.toThrow('Unknown bridge method "missing".');

    expect(() =>
      PrettyJsBridge.register({
        logger,
        methods: { $on: true },
        transports: [customTransport({ name: 'test', send: vi.fn() })],
      }),
    ).toThrow('Bridge method "$on" is reserved.');
    expect(logger).toHaveBeenCalledWith(
      '[PrettyJsBridge] Bridge registration failed.',
      expect.objectContaining({ method: '$on' }),
    );
  });
});

describe('method support and callback lifecycle', () => {
  it('rejects supportedFrom without an environment and a throwing fallback', async () => {
    const logger = vi.fn();
    const noEnvironment = PrettyJsBridge.register({
      logger,
      methods: {
        ping: { supportedFrom: { ios: true } },
      },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });
    await expect(noEnvironment.ping()).rejects.toThrow(
      'register() has no environment',
    );

    const failure = new Error('fallback failed');
    const withFallback = PrettyJsBridge.register({
      logger,
      environment: { platform: 'ios', version: '1.0.0' },
      methods: {
        ping: {
          supportedFrom: { android: true },
          fallback: () => {
            throw failure;
          },
        },
      },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });
    await expect(withFallback.ping()).rejects.toBe(failure);
    expect(logger).toHaveBeenCalledWith(
      '[PrettyJsBridge] Method fallback failed.',
      expect.objectContaining({ method: 'ping', error: failure }),
    );
  });

  it('supports true, equal, suffix, and lower numeric version comparisons', async () => {
    const sent: BridgeEnvelope[] = [];
    const transport = customTransport({
      name: 'test',
      send: (message) => sent.push(message as BridgeEnvelope),
    });
    const allVersions = PrettyJsBridge.register({
      environment: { platform: 'ios', version: '1.0.0' },
      methods: { ping: { supportedFrom: { ios: true } } },
      transports: [transport],
    });
    const allResult = allVersions.ping();
    callbackFrom(sent.shift()!)('all');
    await expect(allResult).resolves.toBe('all');

    const equalVersion = PrettyJsBridge.register({
      environment: { platform: 'ios', version: '1.0' },
      methods: { ping: { supportedFrom: { ios: '1.0.0' } } },
      transports: [transport],
    });
    const equalResult = equalVersion.ping();
    callbackFrom(sent.shift()!)('equal');
    await expect(equalResult).resolves.toBe('equal');

    const longerVersion = PrettyJsBridge.register({
      environment: { platform: 'ios', version: '1.0.1' },
      methods: { ping: { supportedFrom: { ios: '1.0' } } },
      transports: [transport],
    });
    const longerResult = longerVersion.ping();
    callbackFrom(sent.shift()!)('longer');
    await expect(longerResult).resolves.toBe('longer');

    const suffixVersion = PrettyJsBridge.register({
      environment: { platform: 'ios', version: 'beta' },
      methods: { ping: { supportedFrom: { ios: '0' } } },
      transports: [transport],
    });
    const suffixResult = suffixVersion.ping();
    callbackFrom(sent.shift()!)('suffix');
    await expect(suffixResult).resolves.toBe('suffix');

    const unsupported = PrettyJsBridge.register({
      environment: { platform: 'ios', version: '1.0' },
      methods: { ping: { supportedFrom: { ios: '1.0.1' } } },
      transports: [transport],
    });
    await expect(unsupported.ping()).rejects.toMatchObject({
      name: 'UnsupportedBridgeMethodError',
      message:
        'Bridge method "ping" is unavailable: version "1.0" is lower than "1.0.1".',
    });
  });

  it('handles callback errors, raw values, data wrappers, and missing callbacks', async () => {
    const requests: BridgeEnvelope[] = [];
    const bridge = PrettyJsBridge.register({
      callbackNamespace: '__completeCallbacks',
      methods: { ping: true },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => requests.push(message as BridgeEnvelope),
        }),
      ],
    });

    const failed = bridge.ping();
    callbackFrom(requests.shift()!)({ error: 'native failed' });
    await expect(failed).rejects.toBe('native failed');

    const raw = bridge.ping();
    callbackFrom(requests.shift()!)(7);
    await expect(raw).resolves.toBe(7);

    const wrapped = bridge.ping();
    callbackFrom(requests.shift()!)({ data: undefined });
    await expect(wrapped).resolves.toBeUndefined();

    const object = bridge.ping();
    callbackFrom(requests.shift()!)({ value: true });
    await expect(object).resolves.toEqual({ value: true });

    const orphaned = bridge.ping.withCallback('directEvent');
    const orphanedRequest = requests.shift()!;
    const internalParts = orphanedRequest.$callbackName.split('.');
    const internalOwner = internalParts
      .slice(0, -1)
      .reduce<Record<string, any>>((owner, key) => owner[key], root);
    delete internalOwner[internalParts[internalParts.length - 1]!];
    root.directEvent('ignored');
    bridge.$destroy();
    await expect(orphaned).rejects.toThrow('instance was destroyed');
  });

  it('avoids installing a duplicate native callback path', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register({
      callbackNamespace: 'same',
      methods: { ping: true },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            request = message as BridgeEnvelope;
          },
        }),
      ],
    });

    const result = bridge.ping.withCallback('same.0_1');
    expect(request?.$callbackName).toBe('same.0_1');
    callbackFrom(request!)('done');
    await expect(result).resolves.toBe('done');
  });

  it('rejects timed-out calls and clears active timers on success', async () => {
    vi.useFakeTimers();
    const requests: BridgeEnvelope[] = [];
    const bridge = PrettyJsBridge.register({
      timeout: 5,
      methods: {
        slow: true,
        fast: { timeout: 10 },
        untimed: { timeout: -1 },
      },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => requests.push(message as BridgeEnvelope),
        }),
      ],
    });

    const slow = bridge.slow();
    const slowRejection = expect(slow).rejects.toThrow(
      'timed out after 5ms',
    );
    await vi.advanceTimersByTimeAsync(5);
    await slowRejection;

    const fast = bridge.fast();
    callbackFrom(requests[requests.length - 1]!)('fast');
    await expect(fast).resolves.toBe('fast');

    const untimed = bridge.untimed();
    await vi.advanceTimersByTimeAsync(100);
    bridge.$destroy();
    await expect(untimed).rejects.toThrow('instance was destroyed');
  });
});

describe('events, handlers, transports, and destruction', () => {
  type Protocol = {
    methods: { ping: BridgeMethod<void, string> };
    events: { notice: BridgeEvent<number> };
    handlers: { work: BridgeHandler<number, number> };
  };

  it('manages persistent and one-time event listeners', async () => {
    const bridge = PrettyJsBridge.register<Protocol>({
      methods: { ping: true },
      events: { notice: true },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });
    const first = vi.fn();
    const second = vi.fn();
    const once = vi.fn();
    const offFirst = bridge.$on('notice', first);
    const offSecond = bridge.$on('notice', second);
    bridge.$once('notice', once);

    await bridge.$dispatch({ type: 'event', name: 'notice', data: '1' });
    offFirst();
    await bridge.$dispatch({ type: 'event', name: 'notice', data: 2 });
    offSecond();
    await bridge.$dispatch({ type: 'event', name: 'notice', data: 3 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);

    const onceOnly = PrettyJsBridge.register<Protocol>({
      methods: { ping: true },
      events: { notice: true },
      transports: [customTransport({ name: 'test', send: vi.fn() })],
    });
    const onceOnlyListener = vi.fn();
    onceOnly.$once('notice', onceOnlyListener);
    await onceOnly.$dispatch({ type: 'event', name: 'notice', data: 4 });
    await onceOnly.$dispatch({ type: 'event', name: 'notice', data: 5 });
    expect(onceOnlyListener).toHaveBeenCalledTimes(1);
  });

  it('covers default direct event and handler paths', async () => {
    const sent: HandlerResultEnvelope[] = [];
    const bridge = PrettyJsBridge.register({
      methods: { ping: true },
      events: { directEvent: {} },
      handlers: { directHandler: {} },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            if (message.type === 'handler-result') sent.push(message);
          },
        }),
      ],
    });
    const event = vi.fn();
    bridge.$on('directEvent', event);
    bridge.$handle('directHandler', (value) => Number(value) + 1);

    await root.directEvent('5');
    await root.directHandler(5, 'direct-result');

    expect(event).toHaveBeenCalledWith(5);
    expect(sent).toEqual([
      {
        type: 'handler-result',
        handler: 'directHandler',
        callbackId: 'direct-result',
        data: 6,
      },
    ]);
  });

  it('handles replacement, missing, successful, and failing H5 handlers', async () => {
    const sent: HandlerResultEnvelope[] = [];
    const onError = vi.fn();
    const bridge = PrettyJsBridge.register<Protocol>({
      methods: { ping: true },
      handlers: { work: { path: 'directHandler' } },
      nativeEntrypoints: [{}, { path: 'customEntry' }],
      onError,
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            if (message.type === 'handler-result') sent.push(message);
          },
        }),
      ],
    });

    const first = vi.fn(() => 1);
    const second = vi.fn((value: number) => value * 2);
    const offFirst = bridge.$handle('work', first);
    const offSecond = bridge.$handle('work', second);
    offFirst();
    await root.callJsBridge({
      type: 'handler',
      name: 'work',
      data: 3,
      callbackId: 'success',
    });
    expect(sent[sent.length - 1]).toMatchObject({ data: 6 });

    await root.directHandler(4, 123);
    expect(second).toHaveBeenLastCalledWith(4);

    offSecond();
    await root.customEntry({ type: 'handler', name: 'work', data: 1 });
    await bridge.$dispatch({
      type: 'handler',
      name: 'work',
      data: 1,
      callbackId: 'missing',
    });
    expect(sent[sent.length - 1]).toMatchObject({
      callbackId: 'missing',
      error: {
        name: 'Error',
        message: 'No H5 handler registered for "work".',
      },
    });

    bridge.$handle('work', () => {
      throw new TypeError('handler failed');
    });
    await bridge.$dispatch({
      type: 'handler',
      name: 'work',
      data: 1,
      callbackId: 'failure',
    });
    expect(sent[sent.length - 1]).toMatchObject({
      callbackId: 'failure',
      error: { name: 'TypeError', message: 'handler failed' },
    });
    expect(onError).toHaveBeenCalled();
  });

  it('reports handler-result transport failures and supports fire-and-forget errors', async () => {
    const onError = vi.fn();
    const bridge = PrettyJsBridge.register<Protocol>({
      methods: { ping: true },
      handlers: { work: true },
      onError,
      transports: [
        customTransport({
          name: 'broken',
          send: () => {
            throw new Error('send failed');
          },
        }),
      ],
    });

    bridge.$handle('work', () => {
      throw 'plain failure';
    });
    await bridge.$dispatch({ type: 'handler', name: 'work', data: 1 });
    expect(onError).toHaveBeenCalledWith('plain failure');

    bridge.$handle('work', (value) => value);
    await bridge.$dispatch({
      type: 'handler',
      name: 'work',
      data: 1,
      callbackId: 'result',
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'send failed' }),
    );
  });

  it('selects named transports, detects unavailable names, and broadcasts', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const bridge = PrettyJsBridge.register({
      methods: {
        named: { transport: 'second', target: 'nativeNamed' },
        missing: { transport: 'missing' },
        offline: { transport: 'offline' },
      },
      transportMode: 'broadcast',
      transports: [
        customTransport({ name: 'first', send: first }),
        customTransport({ name: 'second', send: second }),
        customTransport({
          name: 'offline',
          isAvailable: () => false,
          send: vi.fn(),
        }),
      ],
    });

    const named = bridge.named();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'named' }),
      'nativeNamed',
    );
    const namedRequest = second.mock.calls[0]![0] as BridgeEnvelope;
    await bridge.$dispatch({
      type: 'response',
      $callbackId: namedRequest.$callbackId,
      data: 'done',
    });
    await expect(named).resolves.toBe('done');

    await expect(bridge.missing()).rejects.toThrow(
      'Unknown transport "missing".',
    );
    await expect(bridge.offline()).rejects.toThrow(
      'No native bridge transport is available.',
    );

    const broadcast = PrettyJsBridge.register({
      methods: { ping: true },
      transportMode: 'broadcast',
      transports: [
        customTransport({ name: 'first', send: first }),
        customTransport({ name: 'second', send: second }),
      ],
    });
    const pending = broadcast.ping();
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    broadcast.$destroy();
    await expect(pending).rejects.toThrow('instance was destroyed');
  });

  it('rejects send errors, invalid messages, unknown responses, and post-destroy operations', async () => {
    const bridge = PrettyJsBridge.register({
      methods: { ping: true },
      nativeEntrypoints: ['callJsBridge'],
      transports: [
        customTransport({
          name: 'broken',
          send: () => {
            throw new Error('transport failed');
          },
        }),
      ],
    });

    await expect(bridge.ping()).rejects.toThrow('transport failed');
    await expect(bridge.$dispatch(null as never)).rejects.toThrow(
      'Invalid native message.',
    );
    await expect(bridge.$dispatch({} as never)).rejects.toThrow(
      'Invalid native message.',
    );
    await expect(bridge.$dispatch('not-json')).rejects.toThrow(
      'Invalid native message.',
    );
    await bridge.$dispatch({
      type: 'response',
      $callbackId: 'unknown',
      error: 'ignored',
    });

    bridge.$destroy();
    bridge.$destroy();
    expect(() => bridge.ping()).toThrow('instance has been destroyed');
    expect(() => bridge.$on('anything' as never, vi.fn())).toThrow(
      'instance has been destroyed',
    );
    await expect(
      bridge.$dispatch({ type: 'event', name: 'anything' }),
    ).rejects.toThrow('instance has been destroyed');
  });
});
