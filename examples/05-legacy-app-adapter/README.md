# 示例 5：适配匿名旧业务 JS Bridge

本示例使用匿名化的旧业务协议演示迁移方式，不包含真实项目名、本地路径或源码出处。

完整适配代码见 [`example.ts`](./example.ts)。

## 结论

旧业务应用的 native 协议已经稳定运行，不应该直接换成 PrettyJsBridge 默认的标准 envelope。最安全的接入方式是使用 `customTransport`，只替换 H5 封装层，不要求 Android 或 iOS 同时改造。

旧协议发送的是：

```ts
{
  actionName: 'getTitleBar',
  actionPramas: undefined,
  callBackName: 'onGetTitleBar',
}
```

注意 `actionPramas` 是现有协议的原始拼写。适配时必须保留，不能改成 `actionParams`。

旧平台入口：

```js
window.webkit.messageHandlers.h5ToNative.postMessage(
  JSON.stringify(payload),
);

window.androidJsObj.h5ToNative(
  JSON.stringify(payload),
);
```

因此这里没有直接使用 `iosTransport()` 和 `androidTransport()`，而是用一个 custom transport 同时保留：

- 固定 handler 名 `h5ToNative`
- iOS 和 Android 都接收 JSON 字符串
- 两个平台入口同时存在时都调用
- `actionName/actionPramas/callBackName` 消息结构
- 无回调调用立即完成 Promise

## 1. 声明旧业务应用协议

把散落在 `h5ToNative<T>()` 中的 action 收口成类型：

```ts
type LegacyAppMethods = {
  closeWebView: () => void;
  updateWebView: (params: { isBounces: 1 | 0 }) => void;
  getTitleBar: () => { statusBarHeight: number };
  getCountryRegionList: () => CountryRegion[];
};

interface LegacyAppEvents {
  onResume: void;
  onPause: void;
  onImageChooserResult: string;
}

const legacyAppBridge = PrettyJsBridge.register<
  LegacyAppMethods,
  LegacyAppEvents
>()({
  // methods / events / transports
});
```

以后新增 native action 时，需要同时添加：

1. `LegacyAppMethods` 方法签名
2. `register().methods` 中的 action 映射
3. 对业务暴露的语义化函数

这样调用参数错误会直接由 TypeScript 报出。

## 2. 映射不同的 actionName

业务函数名不必和 native action 一致：

```ts
methods: {
  closeWebView: {
    target: 'closeWebPage',
  },
  updateWebView: {
    target: 'updateWebView',
    presets: {
      noBounces: { isBounces: 0 },
    },
  },
  getChatList: {
    target: 'getChatList',
  },
}
```

transport 中的 `target` 就是最终发送给 native 的 `actionName`。

## 3. 用 presets 收口固定参数方法

旧文件里的 `updateWebview_noBounces()` 只是给 `updateWebView` 固定参数。可以把这个语义直接声明在主方法配置中：

```ts
updateWebView: {
  target: 'updateWebView',
  presets: {
    noBounces: { isBounces: 0 },
  },
}
```

注册结果会生成类型安全的零参子方法：

```ts
await legacyAppBridge.updateWebView.noBounces();
```

它发送的 action 仍是 `updateWebView`，参数仍是 `{ isBounces: 0 }`。同一个方法可以声明多个预设；预设名和固定参数都由 TypeScript 检查。

## 4. 用 hook 决定本地返回还是调用 native

`getCountryRegionList` 需要优先读取本地缓存，缓存不存在或无效时才访问宿主。把这段决策闭包挂在方法配置上：

```ts
getCountryRegionList: {
  callbackName: 'onCountryRegionListResult',
  hook: (_params, invokeNative) =>
    readCachedCountryRegionList() ?? invokeNative(),
}
```

调用方不再需要额外 wrapper 分支：

```ts
const list = await legacyAppBridge.getCountryRegionList();
```

- 缓存命中：hook 直接返回列表，不创建 callback，不发送 native 消息。
- 缓存未命中：hook 调用 `invokeNative()`，继续使用原方法的 callback、timeout、版本 fallback 和 transport。
- hook 可返回同步值或 Promise；参数和结果必须符合 `LegacyAppMethods` 中的签名。

hook 内不要再次调用 `legacyAppBridge.getCountryRegionList()`，否则会递归进入自身；继续访问宿主必须调用闭包参数 `invokeNative()`。

## 5. 兼容旧的静态回调名

旧 native 不使用 PrettyJsBridge 生成的 `$callbackId`，而是调用固定的全局函数：

```js
window.onGetTitleBar(result);
window.onImageChooserResult(imageUrl);
window.onChatListResult(result);
```

固定 callback 名可以集中写在逐方法注册配置中：

```ts
methods: {
  getTitleBar: {
    callbackName: 'onGetTitleBar',
  },
  showImageChooser: {
    callbackName: 'onImageChooserResult',
  },
  getChatList: {
    target: 'getChatList',
    callbackName: 'onChatListResult',
  },
}
```

当固定 callback 同时也是业务事件时，把同一个路径注册成 event：

```ts
events: {
  onImageChooserResult: true,
}

const off = legacyAppBridge.$on(
  'onImageChooserResult',
  imageUrl => console.log(imageUrl),
);
```

原生调用 `window.onImageChooserResult(imageUrl)` 时只进行一次事件派发：业务 `$on` 监听会执行，`showImageChooser()` 的 Promise 则通过内部一次性监听 resolve。method 调用期间不会覆盖 event 的全局函数。

业务层不再重复声明固定名称，直接调用类型方法：

```ts
const titleBar = await legacyAppBridge.getTitleBar();
const imageUrl = await legacyAppBridge.showImageChooser();
const chatList = await legacyAppBridge.getChatList();
```

`callbackName` 会把名字作为 `message.nativeCallbackName` 交给 transport，legacy adapter 只需把它写入旧 payload 的 `callBackName`。没有匹配 event 时，bridge 临时安装该全局 callback；匹配已注册 event 路径时，bridge 复用 event 入口。

某一次调用需要临时使用其他名称时，仍可覆盖注册值：

```ts
const titleBar =
  await legacyAppBridge.getTitleBar.withCallback(
    'onPreviewTitleBar',
  );
```

优先级是单次 `.withCallback(name)`、方法 `callbackName`、最后不发送 `nativeCallbackName`。native 调用对应全局函数后 Promise 会 resolve。临时 callback 会在完成、超时或 `$destroy()` 时恢复或移除；复用 event 时只移除内部一次性监听，event 全局函数保留到 `$destroy()`。

这个机制保持了旧 native 行为。不过同一个静态 callback 名不适合同时发起多个并发请求；原来的 EventBus `once` 实现也有相同约束。若未来 native 能升级，建议改用每次请求唯一的 `$callbackId/$callbackName`。

native 即使把结果作为 JSON 字符串传给 `onGetTitleBar`，PrettyJsBridge 也会在 callback 层解析。协议直接声明最终对象，业务包装无需 `parseStringObject()`：

```ts
export const getTitleBar = () => legacyAppBridge.getTitleBar();
```

## 6. 无回调方法

旧代码在没有 `callBackName` 时立即返回：

```ts
Promise.resolve()
```

PrettyJsBridge 的方法调用默认等待响应，所以 adapter 在发送完成后主动调用本次生成的 callback，使下面这些方法保持旧语义：

```ts
await closeWebView();
await legacyAppBridge.updateWebView.noBounces();
await updateTitleBar({ isTitleHidden: 1 });
```

这里的 Promise 表示“消息已交给 JS bridge”，不表示 native 已完成操作。

## 7. 平台版本与旧版本 fallback

示例从 URL 和宿主桥识别 `platform`、`appVersion`，并在注册时传入 `environment`。实际项目可以替换成已有的 App 信息来源。

旧业务应用 原逻辑只有 iOS `2.5.0` 及以上调用 `getTitleBar`，其他情况使用 URL 中的 `statusBarHeight`。现在可以直接写在方法配置中：

```ts
getTitleBar: {
  supportedFrom: { ios: '2.5.0' },
  fallback: () => ({
    statusBarHeight:
      Number(query.get('statusBarHeight')) || 0,
  }),
}
```

旧 iOS 或 Android 调用该方法时不会发送 native 消息，直接返回 fallback。版本满足要求时使用方法配置的 `callbackName: 'onGetTitleBar'`。

## 8. App 生命周期事件

旧的：

```ts
window.onPause = () => appCallbacks.emit('onPause');
```

可以改成：

```ts
events: {
  onPause: true,
  onResume: true,
}
```

业务继续使用包装函数：

```ts
const off = onPause(() => {
  video.pause();
});

off();
```

native 仍然调用 `window.onPause()`，但事件分发由 PrettyJsBridge 管理。

## 9. 推荐迁移步骤

1. 在 旧业务应用的 shared 包中引入 `pretty-js-bridge`。
2. 复制 [`example.ts`](./example.ts) 中的 transport、协议和 register 配置。
3. 先保留 `closeWebView`、`updateTitleBar` 等旧导出函数名，让业务页面不需要一次性修改。
4. 逐个把原来的 `h5ToNative({...})` 包装迁移为 `legacyAppBridge.method(params)`。
5. 每迁移一个 action，就补充对应参数、返回值和 callback 映射。
6. 最后再删除旧 EventBus 和旧 `h5ToNative` 实现。

如果项目需要支持本地开发无 native bridge，可以额外添加一个仅开发环境可用的 mock `customTransport`，不要让生产 transport 静默吞掉调用。
