import {
  PrettyJsBridge,
  customTransport,
  type BridgeHandler,
  type HandlerResultEnvelope,
} from '../../src/public';

type HandlerProtocol = {
  methods: {};
  handlers: {
    getToken: BridgeHandler<
      { refresh: boolean },
      { token: string }
    >;
    confirmPayment: BridgeHandler<
      { orderId: string; amount: number },
      { confirmed: boolean }
    >;
  };
};

const nativeResults: HandlerResultEnvelope[] = [];

export const handlerBridge = PrettyJsBridge.register<HandlerProtocol>({
  methods: {},
  handlers: {
    getToken: { path: 'androidJsObj.getToken' },
    confirmPayment: true,
  },
  nativeEntrypoints: ['callJsBridge'],
  transports: [
    customTransport({
      name: 'native-result-channel',
      send: (message) => {
        if (message.type === 'handler-result') {
          nativeResults.push(message);
        }
      },
    }),
  ],
  onError: (error) => {
    console.error('H5 handler failed', error);
  },
});

export const removeTokenHandler = handlerBridge.$handle(
  'getToken',
  async ({ refresh }) => ({
    token: refresh ? 'new-token' : 'cached-token',
  }),
);

export const removePaymentHandler = handlerBridge.$handle(
  'confirmPayment',
  ({ orderId, amount }) => ({
    confirmed: orderId.length > 0 && amount > 0,
  }),
);

export async function simulateNativeHandlerCalls(): Promise<
  readonly HandlerResultEnvelope[]
> {
  // Direct path: second argument is the callbackId returned to native.
  await (globalThis as any).androidJsObj.getToken(
    { refresh: true },
    'native-token-1',
  );

  // Unified entrypoint.
  await (globalThis as any).callJsBridge({
    type: 'handler',
    name: 'confirmPayment',
    data: {
      orderId: 'ORDER-100',
      amount: 99,
    },
    callbackId: 'native-payment-1',
  });

  return nativeResults;
}
