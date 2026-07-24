# pretty-js-bridge

一个与 App、业务和宿主框架无关的 TypeScript JS Bridge。适用于任意 WebView 内嵌 H5，内置 Android、iOS、Flutter、React Native 调用规则，也可以接入自定义 native 协议。

## 特性

- `PrettyJsBridge.register<Protocol>()` 注册后生成同名、类型安全的调用方法
- 方法参数、Promise 返回值、事件 payload、native→H5 handler 全链路类型检查
- Android JavascriptInterface、iOS WKWebView、Flutter、React Native WebView
- 支持 `window.onPause`、`window.androidJsObj.xxx` 等 native 回调路径
- 支持统一 `window.callJsBridge(message)` 入口
- 发布订阅式事件监听，业务模块之间互不依赖
- ESM、CommonJS、UMD 和完整 TypeScript 声明
- 所有公开类型、字段、方法与参数均使用分行 `@en` / `@zh` TSDoc，IDE 悬停即可查看
- 默认通过 `console.log` 输出英文 bridge 生命周期日志，也可在 `register()` 传入自定义 logger
- `$callbackId`、全局 `$callbackName`、超时、销毁与清理
- 按平台和 App 版本声明方法支持范围，并提供类型安全的 fallback
- 支持从 `methods` 配置推断方法，也支持“部分严格协议 + 额外未知方法”

完整场景教程见 [`examples/`](./examples/)：包括类型安全的平台调用、事件与回调路径、native handlers、自定义 transport、生命周期和可运行的 Flutter WebView App。

每个示例目录同时包含可编译的 TypeScript 文件与 Markdown 教程。

## 安装与引入

```bash
npm install pretty-js-bridge
```

ESM：

```ts
import {
  PrettyJsBridge,
  androidTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
  type BridgeEvent,
  type BridgeHandler,
  type BridgeMethod,
} from 'pretty-js-bridge';
```

CommonJS：

```js
const {
  PrettyJsBridge,
  androidTransport,
} = require('pretty-js-bridge');
```

浏览器 UMD：

```html
<script src="./dist/index.umd.js"></script>
<script>
  // UMD 全局对象将类和 transport 工厂合并到同一个入口。
  const transport = PrettyJsBridge.androidTransport();
</script>
```

## 1. 声明业务协议

库不包含任何 App 方法。每个项目只需要声明自己的协议：

```ts
type AppBridgeProtocol = {
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
  };

  events: {
    pause: BridgeEvent<{ timestamp: number }>;
    networkChanged: BridgeEvent<{ online: boolean }>;
  };

  handlers: {
    getToken: BridgeHandler<
      { refresh: boolean },
      { token: string }
    >;
  };
};
```

三类协议分别表示：

- `methods`：H5 调用 native，并通过 Promise 接收 native 响应。
- `events`：native 通知 H5；桥将通知发布给所有订阅者。
- `handlers`：native 请求 H5 执行业务并获得返回值。

## 2. 注册桥

```ts
const h5ToNative = PrettyJsBridge.register<AppBridgeProtocol>({
  environment: {
    platform: 'ios',
    version: '2.5.0',
  },
  methods: {
    openPage: true,
    closePage: { target: 'closeNativePage' },
    getUser: {
      timeout: 5000,
      supportedFrom: {
        ios: '2.5.0',
        android: '5.2.0',
      },
      fallback: ({ userId }) =>
        loadUserFromHttp(userId),
    },
  },

  events: {
    // native 调用 window.onPause(payload)
    pause: { path: 'onPause' },

    // native 调用 window.androidJsObj.onNetworkChanged(payload)
    networkChanged: {
      path: 'androidJsObj.onNetworkChanged',
    },
  },

  handlers: {
    // native 可直接调用 window.androidJsObj.getToken(data, callbackId)
    getToken: { path: 'androidJsObj.getToken' },
  },

  // native 也可统一调用 window.callJsBridge(message)
  nativeEntrypoints: ['callJsBridge'],

  // 默认使用第一个当前可用的平台。
  transports: [
    iosTransport(),
    androidTransport(),
    flutterTransport({ channel: 'h5ToNative' }),
    reactNativeTransport(),
  ],

  logger: (...data) => appLogger.info(...data),
  timeout: 10_000,
});
```

省略 `logger` 时默认调用 `console.log`。自定义 logger 会收到英文 `[PrettyJsBridge] ...` 消息以及方法名、callback ID、transport 等上下文，覆盖注册、调用、回调、native 消息、handler、结算和销毁等关键位置。

现在 `h5ToNative` 只包含协议里声明的方法，并能直接检查参数：

```ts
const user = await h5ToNative.getUser({ userId: '42' });
user.nickname; // string

await h5ToNative.closePage();

// TypeScript error：缺少 userId
await h5ToNative.getUser({});

// TypeScript error：协议没有 share 方法
await h5ToNative.share({});
```

也可以使用 `$invoke`：

```ts
const user = await h5ToNative.$invoke('getUser', {
  userId: '42',
});
```

### 从注册配置推断方法

不传协议泛型时，实例会精确识别 `methods` 中的 key：

```ts
const bridge = PrettyJsBridge.register({
  methods: { some: true },
  transports: [transport],
});

const result = bridge.some('value', 1);
// Promise<unknown>
```

未知方法接受 `unknown[]` 参数并返回 `Promise<unknown>`。多参数会作为数组写入 `message.params`。

如果只声明部分方法的严格签名，并希望配置中的额外 key 继续参与推断，使用两段式注册：

```ts
const bridge = PrettyJsBridge.register<{
  a: (value: number) => void;
}>()({
  methods: {
    a: true,
    b: true,
  },
  transports: [transport],
});

bridge.a(1);          // Promise<void>
bridge.b('value', 2); // Promise<unknown>
```

`a` 的参数保持严格检查，`b` 来自注册配置，未配置的其他名字仍然报错。完整教程见 [`examples/01-typed-platform-calls`](./examples/01-typed-platform-calls/)。

旧宿主要求 H5 在每次调用时提供静态 callback 名时，直接使用方法上的 `withCallback`：

```ts
const titleBar =
  await h5ToNative.getTitleBar.withCallback(
    'onGetTitleBar',
  );

const result =
  await h5ToNative.openPage.withCallback(
    'onOpenPage',
    { url: '/home' },
  );
```

callback 名属于本次调用，不需要在注册配置中集中维护。库会：

1. 安装 `window.onGetTitleBar` 等 native 可见 callback。
2. 在发给 transport 的 request 中提供 `nativeCallbackName`。
3. callback 执行、超时或实例销毁后恢复原值或清理路径。

自定义 transport 可以把 `nativeCallbackName` 转换成旧协议的 `callBackName`。同一个静态 callback 名不适合并发调用；支持升级 native 时应优先使用库生成的唯一 `$callbackName`。

### 平台版本与 fallback

`environment` 表示当前宿主。方法的 `supportedFrom` 中，版本字符串是该平台的最低支持版本，`true` 表示所有版本；未列出的平台视为不支持。版本按数字段比较，因此 `2.5.0` 高于 `2.4.9`。

不支持时不会调用 native：定义了 `fallback` 就直接使用其返回值，否则调用会抛出 `UnsupportedBridgeMethodError`。fallback 的参数和返回值由对应 `BridgeMethod` 自动推导，可以是同步函数或异步函数。没有 `supportedFrom` 的方法保持原行为。

完整示例见 [`examples/07-platform-version-fallback`](./examples/07-platform-version-fallback/)。

## 3. 事件：native 调用 H5

注册时声明的 direct path 会被安装为全局函数。native 可以传对象或 JSON 字符串：

```ts
const offPause = h5ToNative.$on('pause', ({ timestamp }) => {
  console.log('paused at', timestamp);
});

const offOnce = h5ToNative.$once(
  'networkChanged',
  ({ online }) => console.log(online),
);

offPause();
offOnce();
```

对应 native 调用：

```js
window.onPause({ timestamp: Date.now() });

window.androidJsObj.onNetworkChanged(
  JSON.stringify({ online: true }),
);
```

同一个事件可以被多个业务模块订阅。全局回调只负责派发，不需要引用具体业务代码。

## 4. Handler：native 请求 H5

```ts
const removeGetToken = h5ToNative.$handle(
  'getToken',
  async ({ refresh }) => {
    const token = await tokenStore.get(refresh);
    return { token };
  },
);
```

统一入口的 native 消息：

```js
window.callJsBridge({
  type: 'handler',
  name: 'getToken',
  data: { refresh: true },
  callbackId: 'native_callback_1',
});
```

桥执行 handler 后，会通过可用 transport 发回：

```ts
{
  type: 'handler-result',
  handler: 'getToken',
  callbackId: 'native_callback_1',
  data: { token: '...' }
}
```

没有注册 handler 或执行失败时，`handler-result.error` 包含错误。可以通过注册项的 `onError` 统一记录。

## 5. H5 调用 native 的消息协议

每次方法调用都会发送：

```ts
{
  type: 'request',
  method: 'getUser',
  params: { userId: '42' },
  $callbackId: '...',
  $callbackName: '__prettyJsBridgeCallbacks....',
  nativeCallbackName: 'onGetUser' // 仅 withCallback 调用存在
}
```

native 有两种响应方式。

方式一：调用消息中的 `$callbackName`：

```js
window.__prettyJsBridgeCallbacks[$callbackId]({
  data: { id: '42', nickname: 'Ada' },
});
```

方式二：通过统一入口响应：

```js
window.callJsBridge({
  type: 'response',
  $callbackId,
  data: { id: '42', nickname: 'Ada' },
});
```

错误响应使用 `error` 字段。响应完成、超时或实例销毁时，对应 callback 会被自动移除。

`$callbackId` 和 `$callbackName` 由 PrettyJsBridge 生成，`$` 前缀用于和业务/native 自己生成的字段区分。native handler 请求使用的 `callbackId` 仍由 native 提供，因此 handler 协议不改名。

callback、统一 response、事件和 handler 的 `data` 都会经过内部 JSON 字符串解析。业务协议应直接声明最终结果类型，不需要再写 `parseStringObject()`。

## 6. 平台配置

### Android

单一桥方法：

```ts
androidTransport({
  object: 'androidJsObj',
  handler: 'h5ToNative',
});
```

调用规则：

```js
window.androidJsObj.h5ToNative(JSON.stringify(message));
```

native 为每个方法注入独立函数时：

```ts
androidTransport({
  object: 'androidJsObj',
  mode: 'method',
});
```

调用规则：

```js
window.androidJsObj[target](JSON.stringify(message));
```

### iOS WKWebView

```ts
iosTransport({
  handler: 'h5ToNative',
});
```

调用规则：

```js
window.webkit.messageHandlers.h5ToNative.postMessage(message);
```

每个方法对应一个 message handler 时，使用 `mode: 'method'`。

### Flutter

JavaScriptChannel：

```ts
flutterTransport({
  channel: 'h5ToNative',
  kind: 'javascript-channel',
});
```

调用 `window.h5ToNative.postMessage(JSON.stringify(message))`。

flutter_inappwebview：

```ts
flutterTransport({
  kind: 'in-app-webview',
});
```

调用 `window.flutter_inappwebview.callHandler(target, message)`。

### React Native

```ts
reactNativeTransport({
  object: 'ReactNativeWebView',
});
```

调用 `window.ReactNativeWebView.postMessage(JSON.stringify(message))`。

### 自定义平台或已有 App 协议

```ts
const legacyTransport = customTransport({
  name: 'legacy-app',
  isAvailable: () => Boolean(window.legacyBridge),
  send: (message, target) => {
    window.legacyBridge.call(target, JSON.stringify(message));
  },
});
```

某个方法可以指定 transport：

```ts
methods: {
  openPage: {
    transport: 'legacy-app',
    target: 'openNativePage',
  },
}
```

多个宿主桥需要同时收到消息时，设置 `transportMode: 'broadcast'`；默认的 `first` 只使用数组中第一个可用 transport。

## 生命周期

H5 页面卸载时销毁实例：

```ts
h5ToNative.$destroy();
```

销毁会移除库安装的全局入口、事件/handler 函数、待处理 callback 与订阅，并拒绝尚未完成的 Promise。

## 构建与测试

库产物由 Vite 构建，Vitest 使用 V8 provider，并强制 statements、branches、functions、lines 四项覆盖率均为 100%。

```bash
pnpm check
```

该命令会执行源码/测试/示例类型检查、41 个单元测试、覆盖率阈值、ESM/CommonJS/UMD 构建以及 Flutter 示例资源构建。

生成：

```text
dist/index.js          ESM
dist/index.cjs         CommonJS
dist/index.umd.js      UMD / script tag
dist/types/*.d.ts      TypeScript declarations
```
