import {
  PrettyJsBridge,
  androidTransport,
  customTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
  type BridgeMethod,
} from '../../src/public';

type AppProtocol = {
  methods: {
    openPage: BridgeMethod<
      { url: string; replace?: boolean },
      { opened: boolean }
    >;
    closePage: BridgeMethod<void, void>;
    getUser: BridgeMethod<
      { userId: string },
      { id: string; nickname: string }
    >;
    pay: BridgeMethod<
      { amount: number; currency: string },
      { transactionId: string }
    >;
  };
};

export const appBridge = PrettyJsBridge.register<AppProtocol>({
  methods: {
    openPage: true,
    closePage: { target: 'closeNativePage' },
    getUser: { timeout: 5_000 },
    pay: {
      target: {
        android: 'googlePay',
        ios: 'iOSPay',
      },
    },
  },
  transports: [
    iosTransport({ mode: 'method' }),
    androidTransport({ mode: 'method' }),
    flutterTransport({
      name: 'flutter-channel',
      channel: 'h5ToNative',
    }),
    flutterTransport({
      name: 'flutter-inappwebview',
      kind: 'in-app-webview',
    }),
    reactNativeTransport(),
  ],
  logger: (...data: unknown[]) => console.log(...data),
  timeout: 10_000,
});

export async function openUserPage(): Promise<string> {
  const { opened } = await appBridge.openPage({
    url: '/users/42',
    replace: false,
  });
  if (!opened) return 'native refused to open the page';

  const user = await appBridge.$invoke('getUser', {
    userId: '42',
  });
  return user.nickname;
}

export async function closeCurrentPage(): Promise<void> {
  await appBridge.closePage();
}

export async function pay(): Promise<string> {
  const result = await appBridge.pay({
    amount: 12,
    currency: 'USD',
  });
  return result.transactionId;
}

// These examples intentionally remain commented because they are compile errors:
// appBridge.openPage({ path: '/wrong-field' });
// appBridge.getUser({});
// appBridge.share({});

const inferenceTransport = customTransport({
  name: 'inference-example',
  send: (message) => console.log(message),
});

// Without a protocol generic, method names come from the registration object.
export const inferredBridge = PrettyJsBridge.register({
  methods: {
    some: true,
  },
  transports: [inferenceTransport],
});

export const callInferredMethod = (
  ...args: unknown[]
): Promise<unknown> => inferredBridge.some(...args);

// Use the curried form when only part of the protocol is declared. The
// registration object can then contribute additional exact method keys.
export const partiallyTypedBridge = PrettyJsBridge.register<{
  a: (value: number) => void;
}>()({
  methods: {
    a: true,
    b: true,
  },
  transports: [inferenceTransport],
});

export const callDeclaredMethod = (
  value: number,
): Promise<void> => partiallyTypedBridge.a(value);

export const callExtraMethod = (
  ...args: unknown[]
): Promise<unknown> => partiallyTypedBridge.b(...args);

// Compile errors:
// inferredBridge.notRegistered();
// partiallyTypedBridge.a('wrong');
// partiallyTypedBridge.c();
