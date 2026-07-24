import {
  PrettyJsBridge,
  UnsupportedBridgeMethodError,
  customTransport,
  type BridgeMethod,
} from '../../src/public';

type VersionedProtocol = {
  methods: {
    getTitleBar: BridgeMethod<
      void,
      { statusBarHeight: number }
    >;
    requestTracking: BridgeMethod<
      { scene: string },
      { accepted: boolean }
    >;
  };
};

const environment = {
  platform: 'ios',
  version: '2.4.0',
};

const bridge = PrettyJsBridge.register<VersionedProtocol>({
  environment,
  methods: {
    getTitleBar: {
      supportedFrom: {
        ios: '2.5.0',
        android: '5.3.0',
      },
      fallback: (_params, context) => ({
        statusBarHeight:
          context.environment.platform === 'ios' ? 20 : 0,
      }),
    },
    requestTracking: {
      supportedFrom: {
        ios: '7.0.0',
        android: true,
      },
    },
  },
  transports: [
    customTransport({
      name: 'app',
      send: (message) => {
        // Replace this with the App's native transport.
        console.log(message);
      },
    }),
  ],
});

// iOS 2.4.0 is lower than 2.5.0, so this returns the fallback value and
// does not send anything to native.
export const titleBar = bridge.getTitleBar();

export async function enableTracking(): Promise<boolean> {
  try {
    const result = await bridge.requestTracking({
      scene: 'home',
    });
    return result.accepted;
  } catch (error) {
    if (error instanceof UnsupportedBridgeMethodError) {
      return false;
    }
    throw error;
  }
}
