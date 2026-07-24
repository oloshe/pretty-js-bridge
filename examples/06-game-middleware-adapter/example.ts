import {
  PrettyJsBridge,
  customTransport,
  type BridgeEvent,
  type BridgeMethod,
  type NativeMessage,
} from '../../src/public';

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ViewportSettings {
  width?: number;
  height?: number;
  safeArea: SafeAreaInsets;
}

type MiddlewareGameProtocol = {
  methods: {
    showToast: BridgeMethod<{ msg: string }, void>;
    printLog: BridgeMethod<{ msg: string }, void>;
    getViewport: BridgeMethod<void, ViewportSettings>;
    getPermission: BridgeMethod<
      { permissions: string[] },
      { permission: boolean | string[] }
    >;
  };
  events: {
    network_change: BridgeEvent<{ status: string }>;
    send_gift: BridgeEvent<Record<string, unknown>>;
    on_pause: BridgeEvent<void>;
    on_resume: BridgeEvent<void>;
    on_destroy: BridgeEvent<void>;
    terminal_game: BridgeEvent<void>;
    get_user_info: BridgeEvent<Record<string, unknown>>;
    get_user_wallet: BridgeEvent<Record<string, unknown>>;
  };
};

interface MiddlewareBridgePayload {
  actionName: string;
  actionParams?: unknown;
  callBackName?: string;
}

interface MiddlewareNativeMessage {
  actionName: string;
  actionParams?: unknown;
}

interface GameNativeWindow extends Window {
  webkit?: {
    messageHandlers?: {
      h5ToNative?: {
        postMessage(body: string): void;
      };
    };
  };
  androidJsObj?: {
    h5ToNative?: (body: string) => void;
    nativeToH5?: (message: MiddlewareNativeMessage | string) => void;
  };
  nativeToH5?: (message: MiddlewareNativeMessage | string) => void;
}

const LOCAL_VIEWPORT: ViewportSettings = {
  width: 750,
  height: 1334,
  safeArea: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
};

const getAtPath = (path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (owner, key) => (owner as Record<string, unknown>)?.[key],
      globalThis,
    );

const resolveInternalCallback = (
  callbackName: string,
  value?: unknown,
): void => {
  const callback = getAtPath(callbackName);
  if (typeof callback !== 'function') {
    throw new Error(`Bridge callback "${callbackName}" is missing.`);
  }
  (callback as (response?: unknown) => void)(value);
};

const createMockResponse = (
  actionName: string,
): unknown => {
  if (actionName === 'get_viewport') return LOCAL_VIEWPORT;
  if (actionName === 'get_permission') {
    return { permission: true };
  }
  return null;
};

const middlewareTransport = customTransport({
  name: 'game-middleware-adapter',

  // Keep this transport available in a browser so local game development can
  // use the same mock behavior as the original NativeBridge.
  isAvailable: () => true,

  send: (message, target) => {
    if (message.type !== 'request') return;

    const payload: MiddlewareBridgePayload = {
      actionName: target ?? message.method,
    };
    if (message.params !== undefined) {
      payload.actionParams = message.params;
    }
    if (message.nativeCallbackName) {
      payload.callBackName = message.nativeCallbackName;
    }

    const nativeWindow = window as GameNativeWindow;
    const body = JSON.stringify(payload);

    // Match the original bridge: iOS wins when both bridges exist.
    if (nativeWindow.webkit?.messageHandlers?.h5ToNative) {
      nativeWindow.webkit.messageHandlers.h5ToNative.postMessage(body);
      if (!message.nativeCallbackName) {
        resolveInternalCallback(message.$callbackName);
      }
      return;
    }

    if (nativeWindow.androidJsObj?.h5ToNative) {
      nativeWindow.androidJsObj.h5ToNative(body);
      if (!message.nativeCallbackName) {
        resolveInternalCallback(message.$callbackName);
      }
      return;
    }

    // Local development mock.
    if (payload.actionName === 'show_toast') {
      console.log(String((message.params as { msg: string }).msg));
    }
    if (message.nativeCallbackName) {
      queueMicrotask(() => {
        dispatchMiddlewareNativeMessage({
          actionName: message.nativeCallbackName as string,
          actionParams: createMockResponse(payload.actionName),
        });
      });
    } else {
      resolveInternalCallback(message.$callbackName);
    }
  },
});

export const gameBridge =
  PrettyJsBridge.register<MiddlewareGameProtocol>({
    methods: {
      showToast: { target: 'show_toast' },
      printLog: { target: 'print_log' },
      getViewport: {
        target: 'get_viewport',
        timeout: 1_000,
      },
      getPermission: {
        target: 'get_permission',
        timeout: 5_000,
      },
    },
    transports: [middlewareTransport],
    timeout: 5_000,
  });

function dispatchMiddlewareNativeMessage(
  input: MiddlewareNativeMessage | string,
): void {
  const message =
    typeof input === 'string'
      ? (JSON.parse(input) as MiddlewareNativeMessage)
      : input;
  const actionName =
    message.actionName === 'legacy_destroy'
      ? 'on_destroy'
      : message.actionName;

  // A response uses its callBackName as actionName. withCallback() installed
  // this function for the current request.
  const callback = getAtPath(actionName);
  if (typeof callback === 'function') {
    (callback as (payload?: unknown) => void)(message.actionParams);
    return;
  }

  // Everything else is a persistent game/native event.
  void gameBridge.$dispatch({
    type: 'event',
    name: actionName,
    data: message.actionParams ?? {},
  } as NativeMessage);
}

const nativeWindow = window as GameNativeWindow;
const callbackTarget =
  nativeWindow.webkit?.messageHandlers?.h5ToNative
    ? nativeWindow
    : (nativeWindow.androidJsObj ??= {});
const previousNativeToH5 = callbackTarget.nativeToH5;
callbackTarget.nativeToH5 = dispatchMiddlewareNativeMessage;

export const showToast = (msg: string): Promise<void> =>
  gameBridge.showToast({ msg });

export const printLog = (msg: string): Promise<void> =>
  gameBridge.printLog({ msg });

export const requestViewport =
  async (): Promise<ViewportSettings> => {
    try {
      return await gameBridge.getViewport.withCallback(
        'init_viewport',
      );
    } catch {
      return LOCAL_VIEWPORT;
    }
  };

export const requestPermission = (
  permissions: string[],
): Promise<{ permission: boolean | string[] }> =>
  gameBridge.getPermission.withCallback(
    'on_get_permission',
    { permissions },
  );

export const onPause = (
  listener: () => void,
): (() => void) => gameBridge.$on('on_pause', listener);

export const onResume = (
  listener: () => void,
): (() => void) => gameBridge.$on('on_resume', listener);

export const onNetworkChanged = (
  listener: (payload: { status: string }) => void,
): (() => void) =>
  gameBridge.$on('network_change', listener);

export const onGiftReceived = (
  listener: (payload: Record<string, unknown>) => void,
): (() => void) => gameBridge.$on('send_gift', listener);

export function disposeGameBridge(): void {
  if (callbackTarget.nativeToH5 === dispatchMiddlewareNativeMessage) {
    callbackTarget.nativeToH5 = previousNativeToH5;
  }
  gameBridge.$destroy();
}