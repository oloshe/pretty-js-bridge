# 示例 3：native 调用 H5 Handler

事件适合单向通知；handler 适合 native 请求 H5 执行业务并等待结果。

## 1. 声明 handler 类型

```ts
type HandlerProtocol = {
  methods: {};
  handlers: {
    getToken: BridgeHandler<
      { refresh: boolean },
      { token: string }
    >;
  };
};
```

注册 handler 时，参数和返回值都会被检查：

```ts
const remove = bridge.$handle(
  'getToken',
  async ({ refresh }) => ({
    token: await loadToken(refresh),
  }),
);
```

## 2. 直接函数调用

```ts
handlers: {
  getToken: {
    path: 'androidJsObj.getToken',
  },
}
```

native 调用：

```js
window.androidJsObj.getToken(
  { refresh: true },
  'native-token-1',
);
```

第二个参数是 native 提供的 `callbackId`。

## 3. 统一入口调用

```js
window.callJsBridge({
  type: 'handler',
  name: 'confirmPayment',
  data: {
    orderId: 'ORDER-100',
    amount: 99,
  },
  callbackId: 'native-payment-1',
});
```

## 4. 返回 native

handler 完成后，库使用可用 transport 发送：

```ts
{
  type: 'handler-result',
  handler: 'getToken',
  callbackId: 'native-token-1',
  data: {
    token: 'new-token',
  },
}
```

handler 抛出错误时发送 `error` 字段，并调用注册项中的 `onError`。如果 native 不需要返回结果，可以省略 `callbackId`。

完整代码见 [`example.ts`](./example.ts)。
