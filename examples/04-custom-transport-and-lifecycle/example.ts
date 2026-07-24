import {
  PrettyJsBridge,
  customTransport,
  type BridgeEnvelope,
  type BridgeMethod,
  type HandlerResultEnvelope,
} from '../../src/public';

type CustomProtocol = {
  methods: {
    legacyCall: BridgeMethod<{ value: string }, { echoed: string }>;
    analytics: BridgeMethod<{ event: string }, void>;
    slowOperation: BridgeMethod<void, string>;
  };
};

type WireMessage = BridgeEnvelope | HandlerResultEnvelope;
const auditLog: WireMessage[] = [];

const appTransport = customTransport({
  name: 'legacy-app',
  isAvailable: () => true,
  send: (message, target) => {
    console.log('call native target', target, message);
    if (message.type === 'request' && message.method === 'legacyCall') {
      queueMicrotask(() => {
        void customBridge.$dispatch({
          type: 'response',
          $callbackId: message.$callbackId,
          data: {
            echoed: String(
              (message.params as { value: string }).value,
            ),
          },
        });
      });
    }
  },
});

const auditTransport = customTransport({
  name: 'audit',
  send: (message) => {
    auditLog.push(message);
  },
});

export const customBridge = PrettyJsBridge.register<CustomProtocol>({
  methods: {
    legacyCall: {
      transport: 'legacy-app',
      target: 'legacyEcho',
    },
    analytics: {
      transport: 'audit',
    },
    slowOperation: {
      transport: 'legacy-app',
      timeout: 100,
    },
  },
  transports: [appTransport, auditTransport],
  timeout: 3_000,
});

export async function callLegacyApp(): Promise<string> {
  const result = await customBridge.legacyCall({
    value: 'hello',
  });
  return result.echoed;
}

export async function demonstrateCallbackName(): Promise<void> {
  const bridge = PrettyJsBridge.register<CustomProtocol>({
    methods: {
      legacyCall: true,
      analytics: true,
      slowOperation: true,
    },
    transports: [
      customTransport({
        name: 'callback-name-host',
        send: (message) => {
          if (message.type !== 'request') return;
          const callback = message.$callbackName
            .split('.')
            .reduce<any>((owner, key) => owner[key], globalThis);
          callback({ data: { echoed: 'native response' } });
        },
      }),
    ],
  });

  await bridge.legacyCall({ value: 'H5 request' });
  bridge.$destroy();
}

export async function demonstrateBroadcast(): Promise<
  readonly WireMessage[]
> {
  const bridge = PrettyJsBridge.register<CustomProtocol>({
    methods: {
      legacyCall: true,
      analytics: true,
      slowOperation: true,
    },
    transports: [appTransport, auditTransport],
    transportMode: 'broadcast',
  });

  const pending = bridge.analytics({ event: 'page_view' });
  bridge.$destroy();
  await pending.catch(() => undefined);
  return auditLog;
}

export async function demonstrateTimeout(): Promise<string> {
  try {
    await customBridge.slowOperation();
    return 'unexpected success';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function disposeCustomExample(): void {
  customBridge.$destroy();
}
