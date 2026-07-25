# Examples

每个示例目录都包含：

- `example.ts`：可以被 TypeScript 编译检查的完整代码。
- `README.md`：对应场景的使用教程和 native 侧消息说明。

| 示例 | 覆盖能力 |
|---|---|
| [`01-typed-platform-calls`](./01-typed-platform-calls/) | 完整协议、无泛型方法推断、部分协议额外 key 推断、平台 target 映射、`$invoke`、全平台 transport |
| [`02-events-and-callback-paths`](./02-events-and-callback-paths/) | 事件 payload 第二泛型、`$on` / `$once` listener 推断、全局函数、嵌套对象路径、统一入口事件 |
| [`03-native-handlers`](./03-native-handlers/) | `$handle`、直接 handler、统一入口 handler、`handler-result` |
| [`04-custom-transport-and-lifecycle`](./04-custom-transport-and-lifecycle/) | 自定义 transport、逐方法 transport、broadcast、`$callbackName`、超时、`$destroy` |
| [`05-legacy-app-adapter`](./05-legacy-app-adapter/) | 匿名旧业务协议、静态回调、内部 JSON 解析、版本 fallback 和渐进迁移 |
| [`06-game-middleware-adapter`](./06-game-middleware-adapter/) | 匿名游戏中台的 `actionName/actionParams/callBackName`、统一 `nativeToH5`、平台优先级和本地 mock |
| [`07-platform-version-fallback`](./07-platform-version-fallback/) | 初始化平台/版本、逐方法 `supportedFrom`、类型安全 fallback、无 fallback 错误 |
| [`08-flutter-app`](./08-flutter-app/) | Flutter WebView App、JavaScriptChannel、Dart 消息路由、Promise 回调和自定义 logger |

在仓库内验证所有示例：

```bash
pnpm typecheck:examples
```

示例源码使用 `../../src/public`，以便直接检查当前工作区代码。复制到业务项目时，将 import 改为 `pretty-js-bridge`。
