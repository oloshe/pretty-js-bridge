import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  androidTransport,
  customTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
} from '../src/platforms';
import type { BridgeEnvelope, HandlerResultEnvelope } from '../src/schema';

const root = globalThis as Record<string, any>;
const request: BridgeEnvelope = {
  type: 'request',
  method: 'openPage',
  $callbackId: 'callback-1',
  $callbackName: 'callbacks.callback-1',
};
const handlerResult: HandlerResultEnvelope = {
  type: 'handler-result',
  handler: 'getToken',
};

const globals = [
  'androidJsObj',
  'customAndroid',
  'webkit',
  'h5ToNative',
  'customFlutter',
  'flutter_inappwebview',
  'ReactNativeWebView',
  'customReactNative',
] as const;

afterEach(() => {
  for (const key of globals) delete root[key];
});

describe('Android transport', () => {
  it('reports availability and sends serialized bridge messages', () => {
    const transport = androidTransport();
    expect(transport.name).toBe('android');
    expect(transport.platform).toBe('android');
    expect(transport.isAvailable()).toBe(false);

    const send = vi.fn();
    root.androidJsObj = { h5ToNative: send };
    expect(transport.isAvailable()).toBe(true);
    transport.send(request);
    expect(JSON.parse(send.mock.calls[0]![0])).toEqual(request);
  });

  it('supports custom bridge and method-mode options', () => {
    const bridgeSend = vi.fn();
    root.customAndroid = { customHandler: bridgeSend };
    const bridge = androidTransport({
      name: 'custom-android',
      object: 'customAndroid',
      handler: 'customHandler',
      stringify: false,
    });
    expect(bridge.name).toBe('custom-android');
    bridge.send(handlerResult);
    expect(bridgeSend).toHaveBeenCalledWith(handlerResult);

    const requestSend = vi.fn();
    root.customAndroid = { request: requestSend };
    const method = androidTransport({
      object: 'customAndroid',
      mode: 'method',
    });
    expect(method.isAvailable()).toBe(true);
    method.send(request);
    expect(JSON.parse(requestSend.mock.calls[0]![0])).toEqual(request);
  });
});

describe('iOS transport', () => {
  it('reports availability and posts unstringified messages by default', () => {
    const transport = iosTransport();
    expect(transport.name).toBe('ios');
    expect(transport.platform).toBe('ios');
    expect(transport.isAvailable()).toBe(false);

    const postMessage = vi.fn();
    root.webkit = {
      messageHandlers: { h5ToNative: { postMessage } },
    };
    expect(transport.isAvailable()).toBe(true);
    transport.send(request);
    expect(postMessage).toHaveBeenCalledWith(request);
  });

  it('supports custom handler and method modes', () => {
    const customPost = vi.fn();
    root.webkit = {
      messageHandlers: {
        customHandler: { postMessage: customPost },
      },
    };
    const custom = iosTransport({
      name: 'custom-ios',
      handler: 'customHandler',
      stringify: true,
    });
    expect(custom.name).toBe('custom-ios');
    custom.send(request);
    expect(JSON.parse(customPost.mock.calls[0]![0])).toEqual(request);

    const resultPost = vi.fn();
    root.webkit = {
      messageHandlers: { 'handler-result': { postMessage: resultPost } },
    };
    const method = iosTransport({ mode: 'method' });
    expect(method.isAvailable()).toBe(true);
    method.send(handlerResult);
    expect(resultPost).toHaveBeenCalledWith(handlerResult);
  });
});

describe('Flutter transport', () => {
  it('supports JavaScriptChannel defaults and custom options', () => {
    const defaultTransport = flutterTransport();
    expect(defaultTransport.name).toBe('flutter');
    expect(defaultTransport.platform).toBe('flutter');
    expect(defaultTransport.isAvailable()).toBe(false);

    const defaultPost = vi.fn();
    root.h5ToNative = { postMessage: defaultPost };
    expect(defaultTransport.isAvailable()).toBe(true);
    defaultTransport.send(request);
    expect(JSON.parse(defaultPost.mock.calls[0]![0])).toEqual(request);

    const customPost = vi.fn();
    root.customFlutter = { postMessage: customPost };
    const custom = flutterTransport({
      name: 'custom-flutter',
      channel: 'customFlutter',
      stringify: false,
    });
    expect(custom.name).toBe('custom-flutter');
    custom.send(request);
    expect(customPost).toHaveBeenCalledWith(request);
  });

  it('supports flutter_inappwebview availability, target, and fallback channel', () => {
    const transport = flutterTransport({ kind: 'in-app-webview' });
    expect(transport.isAvailable()).toBe(false);

    const callHandler = vi.fn();
    root.flutter_inappwebview = { callHandler };
    expect(transport.isAvailable()).toBe(true);
    transport.send(request, 'openNative');
    transport.send(request);
    expect(callHandler).toHaveBeenNthCalledWith(1, 'openNative', request);
    expect(callHandler).toHaveBeenNthCalledWith(2, 'h5ToNative', request);
  });
});

describe('React Native and custom transports', () => {
  it('supports default and custom React Native bridge objects', () => {
    const transport = reactNativeTransport();
    expect(transport.name).toBe('react-native');
    expect(transport.platform).toBe('react-native');
    expect(transport.isAvailable()).toBe(false);

    const defaultPost = vi.fn();
    root.ReactNativeWebView = { postMessage: defaultPost };
    expect(transport.isAvailable()).toBe(true);
    transport.send(request);
    expect(JSON.parse(defaultPost.mock.calls[0]![0])).toEqual(request);

    const customPost = vi.fn();
    root.customReactNative = { postMessage: customPost };
    const custom = reactNativeTransport({
      name: 'custom-react-native',
      object: 'customReactNative',
    });
    expect(custom.name).toBe('custom-react-native');
    custom.send(request);
    expect(JSON.parse(customPost.mock.calls[0]![0])).toEqual(request);
  });

  it('creates custom transports with default or supplied availability checks', () => {
    const send = vi.fn();
    const available = customTransport({ name: 'available', send });
    const unavailable = customTransport({
      name: 'unavailable',
      isAvailable: () => false,
      send,
    });

    expect(available.platform).toBe('custom');
    expect(available.isAvailable()).toBe(true);
    expect(unavailable.isAvailable()).toBe(false);
    available.send(request, 'target');
    expect(send).toHaveBeenCalledWith(request, 'target');
  });
});
