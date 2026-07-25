# 示例 1：类型安全调用与全平台 transport

这个示例展示 H5 调用 native 的主流程，包括协议声明、直接方法、`$invoke` 和所有内置平台 transport。

## 1. 声明协议

`BridgeMethod<Params, Result>` 的第一个泛型是参数，第二个泛型是 Promise 成功结果：

```ts
type AppProtocol = {
  methods: {
    openPage: BridgeMethod<
      { url: string; replace?: boolean },
      { opened: boolean }
    >;
    closePage: BridgeMethod<void, void>;
  };
};
```

注册后会得到同名方法：

```ts
await appBridge.openPage({
  url: '/users/42',
});

await appBridge.closePage();
```

缺少 `url`、传入错误字段或调用未声明方法都会产生 TypeScript 错误。

## 2. 配置方法

```ts
methods: {
  openPage: true,
  closePage: {
    target: 'closeNativePage',
  },
  getUser: {
    timeout: 5_000,
  },
  pay: {
    target: {
      android: 'googlePay',
      ios: 'iOSPay',
    },
  },
}
```

- `true`：native target 与协议方法名相同。
- `target`：传字符串时映射到统一的 native 方法名；传平台映射时按当前 transport 选择方法名。
- `timeout`：覆盖注册实例的默认超时时间。

logger 也在 `register()` 中配置。省略时库默认调用 `console.log`；传入自定义函数后，注册、方法调用、transport 发送、native 回调/消息、handler、Promise 结算和销毁日志都会交给该函数，日志消息为英文：

```ts
const bridge = PrettyJsBridge.register<AppProtocol>({
  methods,
  transports,
  logger: (...data) => appLogger.info(...data),
});
```

## 3. 不声明协议时推断方法

不传泛型时，`methods` 中实际出现的 key 会直接进入返回类型：

```ts
const bridge = PrettyJsBridge.register({
  methods: {
    some: true,
  },
  transports: [transport],
});

const result = bridge.some('value', 1);
// result: Promise<unknown>
```

因为没有参数和结果协议，推断方法的类型是：

```ts
(...args: unknown[]) => Promise<unknown>
```

`bridge.notRegistered()` 和 `$invoke('notRegistered')` 仍会产生 TypeScript 错误。

传入一个参数时，transport 收到原参数；传入多个参数时，`message.params` 是参数数组。

## 4. 部分声明协议并推断额外方法

如果只想为部分方法提供严格签名，可以使用两段式注册：

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
```

得到的类型为：

```ts
bridge.a(1);          // Promise<void>
bridge.b('value', 2); // Promise<unknown>

bridge.a('wrong'); // TypeScript error
bridge.c();        // TypeScript error
```

这里使用两段式调用是为了让 TypeScript 在固定显式协议后，继续从第二次调用精确推断 `b`。一次调用中显式指定部分泛型后，TypeScript 不支持继续推断剩余类型参数。

完整的 `BridgeSchema + BridgeMethod` 写法保持原有的一次调用方式，适合所有方法都需要严格参数和结果类型的项目。

## 5. 平台调用规则

transport 按数组顺序检查，默认只使用第一个可用项。

| 平台 | 默认调用 |
|---|---|
| iOS WKWebView | `window.webkit.messageHandlers.h5ToNative.postMessage(message)` |
| Android | `window.androidJsObj.h5ToNative(JSON.stringify(message))` |
| Flutter JavaScriptChannel | `window.h5ToNative.postMessage(JSON.stringify(message))` |
| Flutter InAppWebView | `window.flutter_inappwebview.callHandler(target, message)` |
| React Native | `window.ReactNativeWebView.postMessage(JSON.stringify(message))` |

Android 或 iOS native 为每个方法分别注入函数时，配置 `mode: 'method'`：

```ts
androidTransport({
  object: 'androidJsObj',
  mode: 'method',
});

iosTransport({
  mode: 'method',
});
```


示例中的统一业务方法 `appBridge.pay()` 会在 Android method mode 调用 `googlePay`，在 iOS method mode 调用 `iOSPay`。request 消息里的 `method` 仍然是公共名称 `pay`；只有 transport 收到的 target 会按平台变化。映射中没有当前平台时，target 回退为公共方法名。
完整代码见 [`example.ts`](./example.ts)。
