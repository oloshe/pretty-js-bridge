# 示例 8：Flutter App 调用 H5 Bridge

这个示例是一套最小 Flutter WebView App：Flutter 注入 `h5ToNative` JavaScriptChannel，H5 使用 `flutterTransport()` 调用 Dart，Dart 再执行请求中的 `$callbackName` 返回 Promise 结果。

## 目录

- `example.ts`：H5 TypeScript，声明 `getDeviceInfo`、`showToast` 并配置自定义 logger。
- `flutter_app/lib/main.dart`：Flutter WebView 宿主、消息路由和回调实现。
- `flutter_app/assets/index.html`：WebView 本地页面。
- `scripts/build-flutter-example.mjs`：仓库根目录的 Vite 打包脚本会生成 `assets/example.js`。

## H5 注册

```ts
const bridge = PrettyJsBridge.register<FlutterAppProtocol>({
  methods: {
    getDeviceInfo: true,
    showToast: true,
  },
  transports: [
    flutterTransport({ channel: 'h5ToNative' }),
  ],
  logger: (...data) => console.log(...data),
});
```

JavaScriptChannel transport 会发送 JSON 字符串：

```json
{
  "type": "request",
  "method": "getDeviceInfo",
  "$callbackId": "...",
  "$callbackName": "__prettyJsBridgeCallbacks...."
}
```

## Flutter 接收并响应

`main.dart` 使用与 transport 相同的 channel 名：

```dart
..addJavaScriptChannel(
  'h5ToNative',
  onMessageReceived: _handleBridgeMessage,
)
```

处理完成后，Flutter 调用 H5 生成的唯一回调：

```dart
await controller.runJavaScript(
  '$callbackName(${jsonEncode({'data': result})});',
);
```

错误使用 `{ "error": ... }` 返回，H5 Promise 会 reject。

## 运行

先在仓库根目录生成 H5 资源：

```bash
pnpm install
pnpm build:example:flutter
```

然后创建 Flutter 平台壳并运行：

```bash
cd examples/08-flutter-app/flutter_app
flutter create --platforms=android,ios .
flutter pub get
flutter run
```

`flutter create` 只负责补齐标准 Android/iOS 工程目录；本示例维护的 `lib/main.dart`、`pubspec.yaml` 和 `assets/` 是实际 bridge 代码。页面上的两个按钮分别演示无参数调用、带参数调用、native UI 操作、返回值以及英文生命周期日志。
