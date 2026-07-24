# 示例 2：事件订阅与 native 回调路径

这个示例展示 native 主动通知 H5 的三种入口，以及 `$on`/`$once` 发布订阅。

## 1. 直接挂到 window

```ts
events: {
  pause: {
    path: 'onPause',
  },
}
```

注册后 native 可以调用：

```js
window.onPause({
  timestamp: Date.now(),
});
```

库不会把业务逻辑直接放进 `window.onPause`。这个函数只负责派发 `pause` 事件，任意业务模块都可以订阅：

```ts
const off = eventBridge.$on(
  'pause',
  ({ timestamp }) => {
    console.log(timestamp);
  },
);

off();
```

## 2. 嵌套对象路径

```ts
networkChanged: {
  path: 'androidJsObj.onNetworkChanged',
}
```

对应 native 调用：

```js
window.androidJsObj.onNetworkChanged(
  JSON.stringify({ online: true }),
);
```

对象参数和 JSON 字符串都可以被接收。

## 3. 统一 callJsBridge

注册入口：

```ts
nativeEntrypoints: ['callJsBridge']
```

native 发送：

```js
window.callJsBridge({
  type: 'event',
  name: 'themeChanged',
  data: { theme: 'dark' },
});
```

如果宿主不需要全局函数，也可以从已有 native 接入层调用：

```ts
await eventBridge.$dispatch(message);
```

## 4. 生命周期

- `$on` 每次事件都执行，返回取消函数。
- `$once` 只执行一次，随后自动取消。
- `$destroy()` 删除库安装的全局路径、订阅和待处理 callback。

完整代码见 [`example.ts`](./example.ts)。
