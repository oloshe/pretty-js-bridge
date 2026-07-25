import {
  PrettyJsBridge,
  customTransport,
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

interface CountryRegion {
  countryCode: string;
  flagUrl: string;
  nameI18n: Record<string, string>;
  phoneCode: string;
}

type LegacyAppMethods = {
  closeWebView: () => void;
  updateWebView: (params: { isBounces: 1 | 0 }) => void;
  updateTitleBar: (params: TitleBarOptions) => void;
  callRouter: (params: { router: `example-app://${string}` }) => void;
  getTitleBar: () => { statusBarHeight: number };
  showImageChooser: () => string;
  getChatList: () => ChatUser[];
  getCountryRegionList: () => CountryRegion[];
  base64ToImage: (params: { base64Data: string }) => void;
};

interface LegacyAppEvents {
  onResume: void;
  onPause: void;
  shareInfo: void;
  memoryWarning: void;
}

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

const COUNTRY_REGION_LIST_STORAGE_KEY =
  'example-app:country-region-list';

const readCachedCountryRegionList = (): CountryRegion[] | undefined => {
  const cachedList = localStorage.getItem(
    COUNTRY_REGION_LIST_STORAGE_KEY,
  );
  if (!cachedList) return undefined;
  try {
    const parsed: unknown = JSON.parse(cachedList);
    return Array.isArray(parsed)
      ? parsed as CountryRegion[]
      : undefined;
  } catch {
    return undefined;
  }
};

export const legacyAppBridge = PrettyJsBridge.register<
  LegacyAppMethods,
  LegacyAppEvents
>()({
  environment,
  methods: {
    closeWebView: { target: 'closeWebPage' },
    updateWebView: {
      target: 'updateWebView',
      presets: {
        noBounces: { isBounces: 0 },
      },
    },
    updateTitleBar: true,
    callRouter: true,
    getTitleBar: {
      callbackName: 'onGetTitleBar',
      supportedFrom: { ios: '2.5.0' },
      fallback: () => ({
        statusBarHeight:
          Number(query.get('statusBarHeight')) || 0,
      }),
    },
    showImageChooser: {
      callbackName: 'onImageChooserResult',
    },
    getChatList: {
      target: 'getChatList',
      callbackName: 'onChatListResult',
    },
    getCountryRegionList: {
      callbackName: 'onCountryRegionListResult',
      hook: (_params, invokeNative) =>
        readCachedCountryRegionList() ?? invokeNative(),
    },
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

export const updateWebView = (
  params: { isBounces: 1 | 0 },
): Promise<void> => legacyAppBridge.updateWebView(params);

export const disableWebViewBounces = (): Promise<void> =>
  legacyAppBridge.updateWebView.noBounces();

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
}> => legacyAppBridge.getTitleBar();

export const showImageChooser = (): Promise<string> =>
  legacyAppBridge.showImageChooser();

export const getChatListByNative = (): Promise<ChatUser[]> =>
  legacyAppBridge.getChatList();

export const getCountryRegionList = (): Promise<CountryRegion[]> =>
  legacyAppBridge.getCountryRegionList();

export const onResume = (
  callback: () => void,
): (() => void) => legacyAppBridge.$on('onResume', callback);

export const onPause = (
  callback: () => void,
): (() => void) => legacyAppBridge.$on('onPause', callback);
