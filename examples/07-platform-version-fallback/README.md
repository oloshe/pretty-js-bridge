# 示例 7：平台版本判断与 fallback

初始化时把当前宿主的平台和 App 版本交给桥：

```ts
PrettyJsBridge.register<Protocol>({
  environment: {
    platform: 'ios',
    version: '2.4.0',
  },
  // ...
});
```

在方法定义处使用 `supportedFrom` 声明各平台的最低版本：

```ts
getTitleBar: {
  supportedFrom: {
    ios: '2.5.0',
    android: '5.3.0',
  },
  fallback: () => ({ statusBarHeight: 0 }),
}
```

规则如下：

- 字符串表示最低支持版本，版本按数字段比较，所以 `2.5.0` 高于 `2.4.9`。
- `true` 表示该平台的所有版本都支持。
- 没有出现在 `supportedFrom` 中的平台视为不支持。
- 方法没有 `supportedFrom` 时，不做平台和版本限制。

当前环境不支持时，桥不会创建回调，也不会向 native 发送消息。如果定义了 `fallback`，桥直接执行它；其参数和返回值都由该方法的 `BridgeMethod<Params, Result>` 约束：

```ts
fallback: (params, context) => {
  console.log(params, context.environment);
  return { statusBarHeight: 0 };
}
```

`fallback` 可以返回结果或 `Promise`。它只处理“平台或版本不支持”，不会吞掉 transport、超时或 native 返回的错误。

如果没有 fallback，调用会拒绝并抛出 `UnsupportedBridgeMethodError`。可以按需捕获：

```ts
try {
  await bridge.requestTracking({ scene: 'home' });
} catch (error) {
  if (error instanceof UnsupportedBridgeMethodError) {
    // 展示旧版本提示，或关闭对应入口。
  }
}
```

只要任一方法声明了 `supportedFrom`，注册时就应提供 `environment`；否则调用该方法时会得到明确的配置错误。

完整代码见 [`example.ts`](./example.ts)。
