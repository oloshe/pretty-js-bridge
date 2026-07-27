import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PrettyJsBridge,
  UnsupportedBridgeMethodError,
  androidTransport,
  customTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
  type BridgeEnvelope,
  type BridgeEvent,
  type BridgeHandler,
  type BridgeMethod,
  type HandlerResultEnvelope,
} from '../src/public';

type TestProtocol = {
  methods: {
    openPage: BridgeMethod<{ url: string }, { opened: boolean }>;
  };
  events: {
    pause: BridgeEvent<{ at: number }>;
  };
  handlers: {
    getToken: BridgeHandler<{ refresh: boolean }, { token: string }>;
  };
};

const cleanupGlobals = [
  'androidJsObj',
  'webkit',
  'flutterChannel',
  'flutter_inappwebview',
  'ReactNativeWebView',
  'onPause',
  'callJsBridge',
  'legacyCallbacks',
  '__prettyJsBridgeCallbacks',
] as const;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of cleanupGlobals) {
    delete (globalThis as Record<string, unknown>)[key];
  }
});

describe('PrettyJsBridge', () => {
  it('creates typed methods and resolves a callback-path response', async () => {
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register<TestProtocol>({
      methods: { openPage: true },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            request = message as BridgeEnvelope;
          },
        }),
      ],
    });

    const result = bridge.openPage({ url: '/settings' });
    expect(request?.method).toBe('openPage');
    expect(request?.params).toEqual({ url: '/settings' });
    const callback = request?.$callbackName
      .split('.')
      .reduce<unknown>(
        (value, key) => (value as Record<string, unknown>)[key],
        globalThis,
      );
    expect(typeof callback).toBe('function');
    (callback as (value: unknown) => void)({
      data: JSON.stringify({ opened: true }),
    });
    await expect(result).resolves.toEqual({ opened: true });
  });

  it('uses a configured callback, allows a call-site override, and cleans up', async () => {
    const requests: BridgeEnvelope[] = [];
    const bridge = PrettyJsBridge.register<TestProtocol>({
      methods: {
        openPage: {
          callbackName: 'legacyCallbacks.defaultOpenPage',
        },
      },
      transports: [
        customTransport({
          name: 'legacy',
          send: (message) => {
            if (message.type === 'request') requests.push(message);
          },
        }),
      ],
    });

    const defaultResult = bridge.openPage({ url: '/default' });
    expect(requests[0]?.nativeCallbackName).toBe(
      'legacyCallbacks.defaultOpenPage',
    );
    const defaultCallback = (
      globalThis as Record<string, any>
    ).legacyCallbacks.defaultOpenPage;
    expect(defaultCallback).toBeTypeOf('function');

    defaultCallback(JSON.stringify({ opened: true }));

    await expect(defaultResult).resolves.toEqual({ opened: true });
    expect(
      (globalThis as Record<string, unknown>).legacyCallbacks,
    ).toBeUndefined();

    const overrideResult = bridge.openPage.withCallback(
      'legacyCallbacks.overrideOpenPage',
      { url: '/legacy' },
    );

    expect(requests[1]?.nativeCallbackName).toBe(
      'legacyCallbacks.overrideOpenPage',
    );
    const callbacks = (
      globalThis as Record<string, any>
    ).legacyCallbacks;
    expect(callbacks.defaultOpenPage).toBeUndefined();
    expect(callbacks.overrideOpenPage).toBeTypeOf('function');

    callbacks.overrideOpenPage(JSON.stringify({ opened: true }));

    await expect(overrideResult).resolves.toEqual({ opened: true });
    expect(
      (globalThis as Record<string, unknown>).legacyCallbacks,
    ).toBeUndefined();
  });

  it('shares a configured callback path with an event and resolves through a one-time listener', async () => {
    type SharedCallbackProtocol = {
      methods: {
        openPage: BridgeMethod<{ url: string }, { opened: boolean }>;
      };
      events: {
        openPageResult: BridgeEvent<{ opened: boolean }>;
      };
    };
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register<SharedCallbackProtocol>({
      methods: {
        openPage: {
          callbackName: 'legacyCallbacks.openPageResult',
        },
      },
      events: {
        openPageResult: {
          path: 'legacyCallbacks.openPageResult',
        },
      },
      transports: [
        customTransport({
          name: 'legacy',
          send: (message) => {
            if (message.type === 'request') request = message;
          },
        }),
      ],
    });
    const listener = vi.fn();
    bridge.$on('openPageResult', listener);
    const eventCallback = (
      globalThis as Record<string, any>
    ).legacyCallbacks.openPageResult;

    const result = bridge.openPage({ url: '/shared-callback' });

    expect(request?.nativeCallbackName).toBe(
      'legacyCallbacks.openPageResult',
    );
    expect(
      (globalThis as Record<string, any>).legacyCallbacks.openPageResult,
    ).toBe(eventCallback);

    eventCallback(JSON.stringify({ opened: true }));

    await expect(result).resolves.toEqual({ opened: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ opened: true });
    expect(
      (globalThis as Record<string, any>).legacyCallbacks.openPageResult,
    ).toBe(eventCallback);

    bridge.$destroy();
  });

  it('publishes direct window and nested-path callbacks as events', () => {
    const bridge = PrettyJsBridge.register<TestProtocol>({
      methods: { openPage: true },
      events: { pause: { path: 'androidJsObj.onPause' } },
      transports: [
        customTransport({ name: 'test', send: () => undefined }),
      ],
    });
    const listener = vi.fn();
    const stop = bridge.$events.pause(listener);

    expect(Object.keys(bridge.$events)).toContain('pause');
    expect(Reflect.get(bridge.$events, Symbol.toStringTag)).toBeUndefined();

    (
      (globalThis as Record<string, any>).androidJsObj.onPause as (
        data: string,
      ) => void
    )('{"at":12}');
    expect(listener).toHaveBeenCalledWith({ at: 12 });

    stop();
    (
      (globalThis as Record<string, any>).androidJsObj.onPause as (
        data: string,
      ) => void
    )('{"at":13}');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('dispatches schema-only events and handlers through a unified entrypoint', async () => {
    const sent: HandlerResultEnvelope[] = [];
    const bridge = PrettyJsBridge.register<TestProtocol>({
      methods: { openPage: true },
      handlers: { getToken: true },
      nativeEntrypoints: ['callJsBridge'],
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            if (message.type === 'handler-result') sent.push(message);
          },
        }),
      ],
    });
    const pauseListener = vi.fn();
    bridge.$events.pause(pauseListener);
    bridge.$handle('getToken', ({ refresh }) => ({
      token: refresh ? 'fresh' : 'cached',
    }));

    await (globalThis as Record<string, any>).callJsBridge({
      type: 'event',
      name: 'pause',
      data: { at: 15 },
    });
    await (globalThis as Record<string, any>).callJsBridge(
      JSON.stringify({
        type: 'handler',
        name: 'getToken',
        data: { refresh: true },
        callbackId: 'native-1',
      }),
    );
    expect(sent).toEqual([
      {
        type: 'handler-result',
        handler: 'getToken',
        callbackId: 'native-1',
        data: { token: 'fresh' },
      },
    ]);
    expect(pauseListener).toHaveBeenCalledWith({ at: 15 });
  });

  it('rejects when no transport is available and removes globals on destroy', async () => {
    const bridge = PrettyJsBridge.register<TestProtocol>({
      methods: { openPage: true },
      events: { pause: { path: 'onPause' } },
      transports: [
        customTransport({
          name: 'offline',
          isAvailable: () => false,
          send: () => undefined,
        }),
      ],
    });
    await expect(bridge.openPage({ url: '/' })).rejects.toThrow(
      'No native bridge transport is available',
    );
    expect((globalThis as Record<string, unknown>).onPause).toBeTypeOf(
      'function',
    );
    bridge.$destroy();
    expect((globalThis as Record<string, unknown>).onPause).toBeUndefined();
  });
});

describe('registration inference runtime', () => {
  it('exposes configured presets and lets a hook choose local or native results', async () => {
    type AppMethods = {
      updateWebView: (params: { isBounces: 1 | 0 }) => void;
      getCountryRegionList: () => Array<{ countryCode: string }>;
    };

    const requests: BridgeEnvelope[] = [];
    let useLocalList = true;
    const bridge = PrettyJsBridge.register<AppMethods>()({
      methods: {
        updateWebView: {
          presets: {
            noBounces: { isBounces: 0 },
          },
        },
        getCountryRegionList: {
          hook: (_params, invokeNative) =>
            useLocalList
              ? [{ countryCode: 'LOCAL' }]
              : invokeNative(),
        },
      },
      transports: [
        customTransport({
          name: 'presets-and-hooks',
          send: (message) => {
            if (message.type !== 'request') return;
            requests.push(message);
            const callback = message.$callbackName
              .split('.')
              .reduce<unknown>(
                (value, key) =>
                  (value as Record<string, unknown>)[key],
                globalThis,
              ) as (value?: unknown) => void;
            callback(
              message.method === 'getCountryRegionList'
                ? [{ countryCode: 'NATIVE' }]
                : undefined,
            );
          },
        }),
      ],
    });

    await expect(bridge.updateWebView.noBounces()).resolves.toBeUndefined();
    expect(requests[0]).toEqual(
      expect.objectContaining({
        method: 'updateWebView',
        params: { isBounces: 0 },
      }),
    );

    await expect(bridge.getCountryRegionList()).resolves.toEqual([
      { countryCode: 'LOCAL' },
    ]);
    expect(requests).toHaveLength(1);

    useLocalList = false;
    await expect(bridge.getCountryRegionList()).resolves.toEqual([
      { countryCode: 'NATIVE' },
    ]);
    expect(requests[1]?.method).toBe('getCountryRegionList');

    const hookError = new Error('local lookup failed');
    const failingBridge = PrettyJsBridge.register<AppMethods>()({
      methods: {
        updateWebView: true,
        getCountryRegionList: {
          hook: () => {
            throw hookError;
          },
        },
      },
      transports: [
        customTransport({ name: 'unused', send: () => undefined }),
      ],
    });
    await expect(failingBridge.getCountryRegionList()).rejects.toBe(
      hookError,
    );

    expect(() =>
      PrettyJsBridge.register<AppMethods>()({
        methods: {
          updateWebView: {
            presets: {
              withCallback: { isBounces: 0 },
            },
          },
          getCountryRegionList: true,
        },
        transports: [
          customTransport({ name: 'unused', send: () => undefined }),
        ],
      }),
    ).toThrow('Bridge preset "updateWebView.withCallback" is reserved.');
  });

  it('registers inferred method keys and serializes multiple unknown arguments', async () => {
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register({
      methods: { some: true },
      transports: [
        customTransport({
          name: 'inferred',
          send: (message) => {
            request = message as BridgeEnvelope;
          },
        }),
      ],
    });

    const result = bridge.some('first', 2, { enabled: true });
    expect(request?.method).toBe('some');
    expect(request?.params).toEqual([
      'first',
      2,
      { enabled: true },
    ]);

    await bridge.$dispatch({
      type: 'response',
      $callbackId: request!.$callbackId,
      data: JSON.stringify({ accepted: true }),
    });
    await expect(result).resolves.toEqual({ accepted: true });
  });

  it('maps one public method to platform-specific native targets', async () => {
    const googlePay = vi.fn();
    const iOSPay = vi.fn();
    const fallbackSend = vi.fn();
    (globalThis as Record<string, unknown>).androidJsObj = {
      googlePay,
    };
    (globalThis as Record<string, unknown>).webkit = {
      messageHandlers: {
        iOSPay: { postMessage: iOSPay },
      },
    };

    type PaymentProtocol = {
      methods: {
        pay: BridgeMethod<
          { amount: number },
          { accepted: boolean }
        >;
      };
    };

    const bridge = PrettyJsBridge.register<PaymentProtocol>({
      methods: {
        pay: {
          target: {
            android: 'googlePay',
            ios: 'iOSPay',
          },
        },
      },
      transports: [
        androidTransport({ mode: 'method' }),
        iosTransport({ mode: 'method' }),
        customTransport({
          name: 'fallback-platform',
          send: fallbackSend,
        }),
      ],
      transportMode: 'broadcast',
    });

    const result = bridge.pay({ amount: 12 });
    const androidMessage = JSON.parse(
      googlePay.mock.calls[0]![0] as string,
    ) as BridgeEnvelope;
    const iosMessage = iOSPay.mock.calls[0]![0] as BridgeEnvelope;

    expect(androidMessage.method).toBe('pay');
    expect(iosMessage.method).toBe('pay');
    expect(fallbackSend).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'pay' }),
      'pay',
    );
    expect(androidMessage.$callbackId).toBe(iosMessage.$callbackId);

    await bridge.$dispatch({
      type: 'response',
      $callbackId: androidMessage.$callbackId,
      data: { accepted: true },
    });
    await expect(result).resolves.toEqual({ accepted: true });
  });
});

describe('platform version support', () => {
  type VersionProtocol = {
    methods: {
      getSettings: BridgeMethod<
        { scope: string },
        { source: 'native' | 'fallback' }
      >;
    };
  };

  it('uses a typed fallback without sending when the platform version is unsupported', async () => {
    const send = vi.fn();
    const bridge = PrettyJsBridge.register<VersionProtocol>({
      environment: { platform: 'android', version: '2.4.9' },
      methods: {
        getSettings: {
          supportedFrom: { android: '6.6.10', ios: '7.0.0' },
          fallback: ({ scope }, context) => {
            expect(scope).toBe('profile');
            expect(context.environment.platform).toBe('android');
            return { source: 'fallback' };
          },
        },
      },
      transports: [customTransport({ name: 'test', send })],
    });

    await expect(
      bridge.getSettings({ scope: 'profile' }),
    ).resolves.toEqual({ source: 'fallback' });
    expect(send).not.toHaveBeenCalled();
  });

  it('compares numeric version parts and parses unified response data', async () => {
    let request: BridgeEnvelope | undefined;
    const bridge = PrettyJsBridge.register<VersionProtocol>({
      environment: { platform: 'android', version: '2.5.0' },
      methods: {
        getSettings: {
          supportedFrom: { android: '2.4.9' },
          fallback: () => ({ source: 'fallback' }),
        },
      },
      transports: [
        customTransport({
          name: 'test',
          send: (message) => {
            request = message as BridgeEnvelope;
          },
        }),
      ],
    });

    const result = bridge.getSettings({ scope: 'profile' });
    expect(request).toBeDefined();
    await bridge.$dispatch({
      type: 'response',
      $callbackId: request!.$callbackId,
      data: JSON.stringify({ source: 'native' }),
    });
    await expect(result).resolves.toEqual({ source: 'native' });
  });

  it('rejects with a dedicated error when unsupported and no fallback exists', async () => {
    const bridge = PrettyJsBridge.register<VersionProtocol>({
      environment: { platform: 'web', version: '1.0.0' },
      methods: {
        getSettings: {
          supportedFrom: { android: '1.0.0' },
        },
      },
      transports: [
        customTransport({ name: 'test', send: () => undefined }),
      ],
    });

    await expect(
      bridge.getSettings({ scope: 'profile' }),
    ).rejects.toBeInstanceOf(UnsupportedBridgeMethodError);
  });
});

describe('platform transports', () => {
  const message: BridgeEnvelope = {
    type: 'request',
    method: 'openPage',
    params: { url: '/' },
    $callbackId: '1',
    $callbackName: 'callbacks.1',
  };

  it('supports Android object bridge and method modes', () => {
    const bridgeSend = vi.fn();
    const methodSend = vi.fn();
    (globalThis as Record<string, unknown>).androidJsObj = {
      h5ToNative: bridgeSend,
      openNative: methodSend,
    };
    androidTransport().send(message, 'openNative');
    androidTransport({ mode: 'method' }).send(message, 'openNative');
    expect(JSON.parse(bridgeSend.mock.calls[0]![0])).toEqual(message);
    expect(JSON.parse(methodSend.mock.calls[0]![0])).toEqual(message);
  });

  it('supports iOS WKWebView message handlers', () => {
    const postMessage = vi.fn();
    (globalThis as Record<string, unknown>).webkit = {
      messageHandlers: { h5ToNative: { postMessage } },
    };
    iosTransport().send(message);
    expect(postMessage).toHaveBeenCalledWith(message);
  });

  it('supports Flutter channels and flutter_inappwebview', () => {
    const postMessage = vi.fn();
    const callHandler = vi.fn();
    (globalThis as Record<string, unknown>).flutterChannel = { postMessage };
    (globalThis as Record<string, unknown>).flutter_inappwebview = {
      callHandler,
    };
    flutterTransport({ channel: 'flutterChannel' }).send(message);
    flutterTransport({ kind: 'in-app-webview' }).send(message, 'openNative');
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual(message);
    expect(callHandler).toHaveBeenCalledWith('openNative', message);
  });

  it('supports React Native WebView', () => {
    const postMessage = vi.fn();
    (globalThis as Record<string, unknown>).ReactNativeWebView = {
      postMessage,
    };
    reactNativeTransport().send(message);
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual(message);
  });
});
