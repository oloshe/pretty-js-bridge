import type {
  BridgeEnvelope,
  BridgeTransport,
  HandlerResultEnvelope,
} from './schema';
import { callAtPath, getAtPath } from './runtime-utils';

type WireMessage = BridgeEnvelope | HandlerResultEnvelope;

/**
 * @en Android WebView transport options.
 * @zh Android WebView transport 配置。
 */
export interface AndroidTransportOptions {
  /**
   * @en Transport name.
   * @zh transport 名称。
   */
  name?: string;
  /**
   * @en Global object path containing the native bridge.
   * @zh 挂载 native bridge 的全局对象路径。
   */
  object?: string;
  /**
   * @en Unified handler name used in `bridge` mode.
   * @zh `bridge` 模式下的统一 handler 名。
   */
  handler?: string;
  /**
   * @en `bridge` calls one entrypoint; `method` calls by method name.
   * @zh `bridge` 调统一入口；`method` 按方法名调用。
   */
  mode?: 'bridge' | 'method';
  /**
   * @en Whether to serialize as JSON; defaults to `true`.
   * @zh 是否序列化为 JSON，默认 `true`。
   */
  stringify?: boolean;
}

/**
 * @en iOS WKWebView transport options.
 * @zh iOS WKWebView transport 配置。
 */
export interface IosTransportOptions {
  /**
   * @en Transport name.
   * @zh transport 名称。
   */
  name?: string;
  /**
   * @en Handler name under `webkit.messageHandlers`.
   * @zh `webkit.messageHandlers` 中的 handler 名。
   */
  handler?: string;
  /**
   * @en `bridge` calls one entrypoint; `method` calls by method name.
   * @zh `bridge` 调统一入口；`method` 按方法名调用。
   */
  mode?: 'bridge' | 'method';
  /**
   * @en Whether to serialize as JSON; defaults to `false`.
   * @zh 是否序列化为 JSON，默认 `false`。
   */
  stringify?: boolean;
}

/**
 * @en Flutter WebView transport options.
 * @zh Flutter WebView transport 配置。
 */
export interface FlutterTransportOptions {
  /**
   * @en Transport name.
   * @zh transport 名称。
   */
  name?: string;
  /**
   * @en JavaScript channel or default handler name.
   * @zh JavaScript channel 或默认 handler 名。
   */
  channel?: string;
  /**
   * @en Flutter WebView bridge implementation kind.
   * @zh Flutter WebView bridge 实现类型。
   */
  kind?: 'javascript-channel' | 'in-app-webview';
  /**
   * @en Whether to serialize as JSON.
   * @zh 是否序列化为 JSON。
   */
  stringify?: boolean;
}

/**
 * @en React Native WebView transport options.
 * @zh React Native WebView transport 配置。
 */
export interface ReactNativeTransportOptions {
  /**
   * @en Transport name.
   * @zh transport 名称。
   */
  name?: string;
  /**
   * @en Global object path exposing `postMessage`.
   * @zh 提供 `postMessage` 的全局对象路径。
   */
  object?: string;
}

const encode = (message: WireMessage, stringify: boolean): unknown =>
  stringify ? JSON.stringify(message) : message;

/**
 * @en Creates an Android WebView transport.
 * @zh 创建 Android WebView transport。
 *
 * @param options @en Bridge path, mode, and serialization options. @zh bridge 路径、模式和序列化选项。
 * @returns @en A transport accepted by `register()`. @zh 可传给 `register()` 的 transport。
 */
export const androidTransport = (
  options: AndroidTransportOptions = {},
): BridgeTransport => {
  const object = options.object ?? 'androidJsObj';
  const handler = options.handler ?? 'h5ToNative';
  const mode = options.mode ?? 'bridge';
  return {
    name: options.name ?? 'android',
    platform: 'android',
    isAvailable: () =>
      mode === 'bridge'
        ? typeof getAtPath(`${object}.${handler}`) === 'function'
        : !!getAtPath(object),
    send: (message, target) => {
      const key = mode === 'method' ? (target ?? message.type) : handler;
      return callAtPath(
        `${object}.${key}`,
        [encode(message, options.stringify ?? true)],
        object,
      );
    },
  };
};

/**
 * @en Creates an iOS WKWebView transport.
 * @zh 创建 iOS WKWebView transport。
 *
 * @param options @en Handler, mode, and serialization options. @zh handler、模式和序列化选项。
 * @returns @en A transport accepted by `register()`. @zh 可传给 `register()` 的 transport。
 */
export const iosTransport = (
  options: IosTransportOptions = {},
): BridgeTransport => {
  const handler = options.handler ?? 'h5ToNative';
  const mode = options.mode ?? 'bridge';
  const base = 'webkit.messageHandlers';
  return {
    name: options.name ?? 'ios',
    platform: 'ios',
    isAvailable: () =>
      mode === 'bridge'
        ? typeof getAtPath(`${base}.${handler}.postMessage`) === 'function'
        : !!getAtPath(base),
    send: (message, target) => {
      const key = mode === 'method' ? (target ?? message.type) : handler;
      const owner = `${base}.${key}`;
      return callAtPath(
        `${owner}.postMessage`,
        [encode(message, options.stringify ?? false)],
        owner,
      );
    },
  };
};

/**
 * @en Creates a Flutter WebView transport.
 * @zh 创建 Flutter WebView transport。
 *
 * @param options @en Channel, implementation kind, and serialization options. @zh channel、实现类型和序列化选项。
 * @returns @en A transport accepted by `register()`. @zh 可传给 `register()` 的 transport。
 */
export const flutterTransport = (
  options: FlutterTransportOptions = {},
): BridgeTransport => {
  const channel = options.channel ?? 'h5ToNative';
  const kind = options.kind ?? 'javascript-channel';
  return {
    name: options.name ?? 'flutter',
    platform: 'flutter',
    isAvailable: () =>
      kind === 'in-app-webview'
        ? typeof getAtPath('flutter_inappwebview.callHandler') === 'function'
        : typeof getAtPath(`${channel}.postMessage`) === 'function',
    send: (message, target) =>
      kind === 'in-app-webview'
        ? callAtPath(
            'flutter_inappwebview.callHandler',
            [target ?? channel, encode(message, options.stringify ?? false)],
            'flutter_inappwebview',
          )
        : callAtPath(
            `${channel}.postMessage`,
            [encode(message, options.stringify ?? true)],
            channel,
          ),
  };
};

/**
 * @en Creates a React Native WebView transport.
 * @zh 创建 React Native WebView transport。
 *
 * @param options @en React Native bridge object options. @zh React Native bridge 对象配置。
 * @returns @en A transport accepted by `register()`. @zh 可传给 `register()` 的 transport。
 */
export const reactNativeTransport = (
  options: ReactNativeTransportOptions = {},
): BridgeTransport => {
  const object = options.object ?? 'ReactNativeWebView';
  return {
    name: options.name ?? 'react-native',
    platform: 'react-native',
    isAvailable: () => typeof getAtPath(`${object}.postMessage`) === 'function',
    send: (message) =>
      callAtPath(`${object}.postMessage`, [JSON.stringify(message)], object),
  };
};

/**
 * @en Custom transport options for adapting any native protocol.
 * @zh 自定义 transport 配置，用于适配任意既有 native 协议。
 */
export interface CustomTransportOptions {
  /**
   * @en Unique transport name.
   * @zh transport 唯一名称。
   */
  name: string;
  /**
   * @en Checks host availability; defaults to always available.
   * @zh 检查宿主是否可用；默认始终可用。
   */
  isAvailable?: () => boolean;
  /**
   * @en Adapter function that sends a standard message.
   * @zh 发送标准消息的适配函数。
   *
   * @param message @en Request or handler-result message. @zh 请求或 handler 结果消息。
   * @param target @en Optional native target from method configuration. @zh 方法配置中的可选 native target。
   */
  send: (message: WireMessage, target?: string) => unknown;
}

/**
 * @en Creates a transport from a custom send function.
 * @zh 从自定义发送函数创建 transport。
 *
 * @param options @en Name, availability check, and send implementation. @zh 名称、可用性检查和发送实现。
 * @returns @en A transport accepted by `register()`. @zh 可传给 `register()` 的 transport。
 */
export const customTransport = (
  options: CustomTransportOptions,
): BridgeTransport => ({
  name: options.name,
  platform: 'custom',
  isAvailable: options.isAvailable ?? (() => true),
  send: options.send,
});
