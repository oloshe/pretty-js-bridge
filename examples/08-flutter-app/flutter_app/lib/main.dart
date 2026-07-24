import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const BridgeExampleApp());
}

class BridgeExampleApp extends StatelessWidget {
  const BridgeExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: BridgeExamplePage(),
    );
  }
}

class BridgeExamplePage extends StatefulWidget {
  const BridgeExamplePage({super.key});

  @override
  State<BridgeExamplePage> createState() => _BridgeExamplePageState();
}

class _BridgeExamplePageState extends State<BridgeExamplePage> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'h5ToNative',
        onMessageReceived: _handleBridgeMessage,
      )
      ..loadFlutterAsset('assets/index.html');
  }

  Future<void> _handleBridgeMessage(JavaScriptMessage incoming) async {
    final request = jsonDecode(incoming.message) as Map<String, dynamic>;
    final callbackName = request[r'$callbackName'] as String;

    try {
      final data = switch (request['method']) {
        'getDeviceInfo' => <String, dynamic>{
          'platform': Theme.of(context).platform.name,
          'appVersion': '1.0.0',
        },
        'showToast' => _showToast(request['params'] as Map<String, dynamic>),
        final method => throw UnsupportedError('Unknown method: $method'),
      };
      await _reply(callbackName, <String, dynamic>{'data': data});
    } catch (error) {
      await _reply(callbackName, <String, dynamic>{
        'error': <String, dynamic>{'message': error.toString()},
      });
    }
  }

  Map<String, dynamic> _showToast(Map<String, dynamic> params) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(params['message'] as String)));
    return <String, dynamic>{'shown': true};
  }

  Future<void> _reply(String callbackName, Map<String, dynamic> response) {
    return _controller.runJavaScript('$callbackName(${jsonEncode(response)});');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pretty JS Bridge')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
