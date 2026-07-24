# 示例 4：自定义 transport 与生命周期

当宿主已有自己的桥协议时，不需要修改库，使用 `customTransport` 适配即可。

## 1. 自定义 transport

```ts
const transport = customTransport({
  name: 'legacy-app',
  isAvailable: () => Boolean(window.legacyBridge),
  send: (message, target) => {
    window.legacyBridge.call(
      target,
      JSON.stringify(message),
    );
  },
});
```

transport 只负责两件事：

1. `isAvailable()` 判断宿主桥是否存在。
2. `send(message, target)` 把标准消息转换成宿主调用。

## 2. 逐方法选择 transport

```ts
methods: {
  legacyCall: {
    transport: 'legacy-app',
    target: 'legacyEcho',
  },
  analytics: {
    transport: 'audit',
  },
}
```

这样同一个注册实例可以把不同方法发送到不同 native 通道。

## 3. 两种 Promise 响应

统一入口响应：

```ts
bridge.$dispatch({
  type: 'response',
  $callbackId: message.$callbackId,
  data: result,
});
```

`$callbackName` 响应：

```js
const callback = resolvePath(message.$callbackName);
callback({
  data: result,
});
```

callback 完成后会自动从全局 namespace 删除。

## 4. broadcast

默认 `transportMode: 'first'` 使用第一个可用 transport。设置：

```ts
transportMode: 'broadcast'
```

消息会发送给所有可用 transport，适合同时调用宿主和审计通道。broadcast 仍只有一个 Promise 响应，native 侧应约定由哪个 transport 返回结果。

## 5. 超时与销毁

方法级 `timeout` 优先于注册级 `timeout`：

```ts
slowOperation: {
  timeout: 100,
}
```

超时会拒绝 Promise 并清理 callback。

```ts
bridge.$destroy();
```

销毁会：

- 删除事件、handler 和统一入口的全局路径。
- 删除待处理 callback。
- 拒绝未完成的 Promise。
- 清空事件订阅与 handlers。
- 阻止实例继续调用。

完整代码见 [`example.ts`](./example.ts)。
