import {
  PrettyJsBridge,
  customTransport,
  type BridgeEvent,
  type BridgeMethod,
} from '../../src/public';

interface TitleBarOptions {
  bg?: string;
  titleColor?: string;
  statusDarkMode?: 1 | 0;
  leftDarkIcon?: 1 | 0;
  isLineVis?: 1 | 0;
  isWebFull?: 1 | 0;
  isTitleHidden?: 1 | 0;
  rightIconUrl?: string;
  rightIconCBName?: string;
  isStatusBarHidden?: 1 | 0;
}

interface ChatUser {
  uid: number;
  nick: string;
  avatar: string;
}

type LegacyAppProtocol = {
  methods: {
    closeWebView: BridgeMethod<void, void>;
    updateWebview: BridgeMethod<{ isBounces: 1 | 0 }, void>;
    updateTitleBar: BridgeMethod<TitleBarOptions, void>;
    callRouter: BridgeMethod<{ router: `example-app://${string}` }, void>;
    getTitleBar: BridgeMethod<void, { statusBarHeight: number }>;
    showImageChooser: BridgeMethod<void, string>;
    getChatList: BridgeMethod<void, ChatUser[]>;
    base64ToImage: BridgeMethod<{ base64Data: string }, void>;
  };
  events: {
    onResume: BridgeEvent<void>;
    onPause: BridgeEvent<void>;
    shareInfo: BridgeEvent<void>;
    memoryWarning: BridgeEvent<void>;
  };
};

interface LegacyBridgePayload {
  actionName: string;
  // Keep the native protocol's original spelling.
  actionPramas?: unknown;
  callBackName?: string;
}


const resolvePath = (path: string): ((value?: unknown) => void) => {
  const callback = path
    .split('.')
    .reduce<unknown>(
      (owner, key) => (owner as Record<string, unknown>)[key],
      globalThis,
    );
  if (typeof callback !== 'function') {
    throw new Error(`PrettyJsBridge callback "${path}" was not found.`);
  }
  return callback as (value?: unknown) => void;
};


const legacyAppTransport = customTransport({
  name: 'legacy-app-adapter',

  isAvailable: () => {
    const host = window as any;
    return Boolean(
      host.webkit?.messageHandlers?.h5ToNative?.postMessage ||
        host.androidJsObj?.h5ToNative,
    );
  },

  send: (message, target) => {
    if (message.type !== 'request') return;

    const legacyCallbackName = message.nativeCallbackName;

    const legacyPayload: LegacyBridgePayload = {
      actionName: target ?? message.method,
    };
    if (message.params !== undefined) {
      legacyPayload.actionPramas = message.params;
    }
    if (legacyCallbackName) {
      legacyPayload.callBackName = legacyCallbackName;
    }

    // The existing legacy native implementation expects a JSON string on
    // both iOS and Android, and the old helper calls both when both exist.
    const payload = JSON.stringify(legacyPayload);
    const host = window as any;
    host.webkit?.messageHandlers?.h5ToNative?.postMessage(payload);
    host.androidJsObj?.h5ToNative?.(payload);

    // The old h5ToNative() returns Promise.resolve() for calls without a
    // callBackName. Resolve the generated Promise with the same semantics.
    if (!legacyCallbackName) {
      resolvePath(message.$callbackName)();
    }
  },
});

const query = new URLSearchParams(window.location.search);
const environment = {
  platform: query.get('platform') ?? (
    (window as any).webkit?.messageHandlers?.h5ToNative
      ? 'ios'
      : (window as any).androidJsObj?.h5ToNative
        ? 'android'
        : 'web'
  ),
  version: query.get('appVersion') ?? '0.0.0',
};

export const legacyAppBridge = PrettyJsBridge.register<LegacyAppProtocol>({
  environment,
  methods: {
    closeWebView: { target: 'closeWebPage' },
    updateWebview: { target: 'updateWebView' },
    updateTitleBar: true,
    callRouter: true,
    getTitleBar: {
      supportedFrom: { ios: '2.5.0' },
      fallback: () => ({
        statusBarHeight:
          Number(query.get('statusBarHeight')) || 0,
      }),
    },
    showImageChooser: true,
    getChatList: { target: 'getChatList' },
    base64ToImage: true,
  },
  events: {
    onResume: true,
    onPause: true,
    shareInfo: true,
    memoryWarning: true,
  },
  transports: [legacyAppTransport],
  timeout: 10_000,
});

export const closeWebView = (): Promise<void> =>
  legacyAppBridge.closeWebView();

export const updateWebview = (
  params: { isBounces: 1 | 0 },
): Promise<void> => legacyAppBridge.updateWebview(params);

export const updateTitleBar = (
  options: TitleBarOptions,
): Promise<void> => legacyAppBridge.updateTitleBar(options);

export const callRouter = (
  router: `example-app://${string}`,
): Promise<void> =>
  legacyAppBridge.callRouter({
    router: encodeURI(router) as `example-app://${string}`,
  });

export const getTitleBar = (): Promise<{
  statusBarHeight: number;
}> => legacyAppBridge.getTitleBar.withCallback('onGetTitleBar');

export const showImageChooser = (): Promise<string> =>
  legacyAppBridge.showImageChooser.withCallback('onImageChooserResult');

export const getChatListByNative = (): Promise<ChatUser[]> =>
  legacyAppBridge.getChatList.withCallback('onChatListResult');

export const onResume = (
  callback: () => void,
): (() => void) => legacyAppBridge.$on('onResume', callback);

export const onPause = (
  callback: () => void,
): (() => void) => legacyAppBridge.$on('onPause', callback);