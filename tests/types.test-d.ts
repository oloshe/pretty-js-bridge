import {
  PrettyJsBridge,
  customTransport,
  type BridgeEvent,
  type BridgeHandler,
  type BridgeLogger,
  type BridgeMethod,
  type MethodConfig,
} from '../src/public';

type AppProtocol = {
  methods: {
    openPage: BridgeMethod<{ url: string }, { opened: boolean }>;
    closePage: BridgeMethod<void, void>;
  };
  events: {
    pause: BridgeEvent<{ timestamp: number }>;
  };
  handlers: {
    getToken: BridgeHandler<{ refresh: boolean }, { token: string }>;
  };
};

const logger: BridgeLogger = (...data) => console.log(...data);

const bridge = PrettyJsBridge.register<AppProtocol>({
  logger,
  environment: { platform: 'ios', version: '2.5.0' },
  methods: {
    openPage: {
      supportedFrom: { ios: '2.5.0', android: true },
      fallback: (params, context) => ({
        opened:
          params.url.length > 0 &&
          context.environment.platform.length > 0,
      }),
    },
    closePage: { target: 'close' },
  },
  events: {
    pause: { path: 'onPause' },
  },
  handlers: {
    getToken: true,
  },
  transports: [
    customTransport({
      name: 'test',
      send: () => undefined,
    }),
  ],
});

const result: Promise<{ opened: boolean }> = bridge.openPage({ url: '/home' });
void result;
void bridge.closePage();
bridge.$on('pause', (payload) => payload.timestamp.toFixed());
bridge.$handle('getToken', async ({ refresh }) => ({
  token: refresh ? 'new' : 'cached',
}));

const callbackResult: Promise<{ opened: boolean }> =
  bridge.openPage.withCallback('onOpenPage', { url: '/callback' });
void callbackResult;
void bridge.closePage.withCallback('onClosePage');

// @ts-expect-error callback calls still require the declared method parameter
void bridge.openPage.withCallback('onOpenPage');
// @ts-expect-error missing required parameter
void bridge.openPage();
// @ts-expect-error wrong parameter property
void bridge.openPage({ path: '/home' });
// @ts-expect-error void method accepts no argument
void bridge.closePage({});
// @ts-expect-error only declared events can be observed
bridge.$on('resume', () => undefined);
// @ts-expect-error only declared handlers can be registered
bridge.$handle('unknown', () => undefined);
// @ts-expect-error handler result is checked
bridge.$handle('getToken', () => ({ value: 'wrong' }));

const invalidFallback: MethodConfig<
  AppProtocol['methods']['openPage']
> = {
  // @ts-expect-error fallback must return the method's declared result
  fallback: () => ({ opened: 'yes' }),
};
void invalidFallback;

const inferenceTransport = customTransport({
  name: 'inference',
  send: () => undefined,
});

const inferredBridge = PrettyJsBridge.register({
  methods: {
    some: true,
    another: { target: 'anotherNativeMethod' },
  },
  transports: [inferenceTransport],
});

const inferredResult: Promise<unknown> =
  inferredBridge.some('value', 1);
void inferredResult;
void inferredBridge.another.withCallback(
  'onAnother',
  { enabled: true },
);
void inferredBridge.$invoke('some', 'value', 1);

// @ts-expect-error a no-generic registration exposes only configured keys
void inferredBridge.missing();
// @ts-expect-error $invoke also restricts names to configured keys
void inferredBridge.$invoke('missing');

interface PaymentEvents {
  paymentChanged: {
    status: 'success' | 'failed';
    transactionId: string;
  };
}

type HookedMethods = {
  updateWebView: (params: { isBounces: 1 | 0 }) => void;
  getCountryRegionList: () => Array<{ countryCode: string }>;
};

const hookedBridge = PrettyJsBridge.register<HookedMethods>()({
  methods: {
    updateWebView: {
      presets: {
        noBounces: { isBounces: 0 },
      },
    },
    getCountryRegionList: {
      hook: (_params, invokeNative) =>
        Math.random() > 0.5
          ? [{ countryCode: 'LOCAL' }]
          : invokeNative(),
    },
  },
  transports: [inferenceTransport],
});

const presetResult: Promise<void> =
  hookedBridge.updateWebView.noBounces();
const hookedResult: Promise<Array<{ countryCode: string }>> =
  hookedBridge.getCountryRegionList();
void presetResult;
void hookedResult;

// @ts-expect-error only configured preset names are exposed
void hookedBridge.updateWebView.bounces();

PrettyJsBridge.register<HookedMethods>()({
  methods: {
    updateWebView: {
      presets: {
        // @ts-expect-error preset params must match the declared method
        invalid: { isBounces: 2 },
      },
    },
    getCountryRegionList: true,
  },
  transports: [inferenceTransport],
});

PrettyJsBridge.register<HookedMethods>()({
  methods: {
    updateWebView: true,
    getCountryRegionList: {
      // @ts-expect-error hook results must match the declared method
      hook: () => [{ countryCode: 1 }],
    },
  },
  transports: [inferenceTransport],
});

const partiallyTypedBridge = PrettyJsBridge.register<{
  a: (value: number) => void;
}, PaymentEvents>()({
  methods: {
    a: {
      target: {
        android: 'googlePay',
        ios: 'iOSPay',
      },
      callbackName: 'onA',
    },
    b: true,
  },
  events: {
    paymentChanged: true,
    inferredEvent: true,
  },
  transports: [inferenceTransport],
});

const declaredResult: Promise<void> =
  partiallyTypedBridge.a(1);
const extraResult: Promise<unknown> =
  partiallyTypedBridge.b('value', 2);
void declaredResult;
void extraResult;
partiallyTypedBridge.$on('paymentChanged', (payload) => {
  const status: 'success' | 'failed' = payload.status;
  const transactionId: string = payload.transactionId;
  void status;
  void transactionId;
});
partiallyTypedBridge.$once('inferredEvent', (payload) => {
  const inferredPayload: unknown = payload;
  void inferredPayload;
});

// @ts-expect-error declared methods keep their parameter types
void partiallyTypedBridge.a('wrong');
// @ts-expect-error unconfigured extra methods are not exposed
void partiallyTypedBridge.c();
// @ts-expect-error declared event payloads are checked
partiallyTypedBridge.$on('paymentChanged', (payload: { status: number }) => {
  void payload;
});
// @ts-expect-error unconfigured and undeclared events are not exposed
partiallyTypedBridge.$on('missingEvent', () => undefined);
