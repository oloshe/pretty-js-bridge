# 示例 6：匿名游戏中台 Native Bridge

本示例使用匿名化的游戏中台协议，不包含真实项目名、本地路径或源码出处。

完整适配代码见 [`example.ts`](./example.ts)。

## 协议特点

中台游戏发送：

```ts
{
  actionName: 'get_viewport',
  actionParams: undefined,
  callBackName: 'init_viewport',
}
```

平台入口：

```js
// iOS，发送 JSON 字符串
window.webkit.messageHandlers.h5ToNative.postMessage(body);

// Android，发送 JSON 字符串
window.androidJsObj.h5ToNative(body);
```

在这种统一入口协议中，native 不会直接调用 `window.init_viewport(result)`。所有 native→H5 消息都经过统一入口：

```js
// iOS
window.nativeToH5({
  actionName: 'init_viewport',
  actionParams: viewport,
});

// Android
window.androidJsObj.nativeToH5({
  actionName: 'init_viewport',
  actionParams: viewport,
});
```

`actionName` 既可能是持续事件名，也可能是某次请求的 `callBackName`。

## 1. 类型化方法

```ts
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
};
```

native action 与 H5 方法名通过 `target` 映射：

```ts
methods: {
  showToast: {
    target: 'show_toast',
  },
  getViewport: {
    target: 'get_viewport',
    timeout: 1_000,
  },
}
```

## 2. 调用处声明 callback

callback 不需要集中配置：

```ts
const viewport =
  await gameBridge.getViewport.withCallback(
    'init_viewport',
  );

const permission =
  await gameBridge.getPermission.withCallback(
    'on_get_permission',
    {
      permissions: ['microphone'],
    },
  );
```

transport 通过 `message.nativeCallbackName` 得到本次调用选择的名字，并写入 `callBackName`。

## 3. 统一 nativeToH5 路由

adapter 根据宿主选择 callback 挂载位置：

- 存在 iOS bridge：挂到 `window.nativeToH5`
- 否则：挂到 `window.androidJsObj.nativeToH5`

收到消息后：

1. 将历史别名 `legacy_destroy` 规范化为 `on_destroy`。
2. 如果 `actionName` 对应当前 `withCallback`，resolve 该请求。
3. 否则通过 `$dispatch` 发布为持续事件。

```ts
const offPause = gameBridge.$on(
  'on_pause',
  () => pauseGame(),
);

const offNetwork = gameBridge.$on(
  'network_change',
  ({ status }) => updateNetwork(status),
);
```

## 4. 平台优先级

该适配器通过 `return` 保证只调用一个平台：

1. 优先 iOS `webkit.messageHandlers`
2. 其次 Android `androidJsObj`
3. 都不存在时使用本地 mock

示例保持该优先顺序，因此两个平台入口同时存在时也只发送一次。

## 5. 无 callback 的调用

```ts
await showToast('Welcome');
await printLog('game ready');
```

该中台协议对没有 `callBackName` 的 action 发送后立即返回 `null`。adapter 在发送完成后通过 `message.$callbackName` resolve PrettyJsBridge 内部 callback，因此 Promise 只表示消息已交给宿主。

## 6. 超时与本地 mock

- 普通 callback 默认超时 5 秒。
- viewport 请求超时 1 秒，并回退到本地 viewport。
- 没有 native bridge 时，示例模拟 viewport、permission、toast 和无返回调用。

PrettyJsBridge 超时时会 reject；`requestViewport()` wrapper 捕获错误并返回本地设置，从而提供稳定的 fallback 行为。

## 7. 游戏退出时清理

```ts
disposeGameBridge();
```

这个函数会恢复原有 `nativeToH5`，并调用 `$destroy()` 清理事件订阅、pending callbacks 和 callback aliases。
