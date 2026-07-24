import { PrettyJsBridge } from './bridge-core';
import {
  androidTransport,
  customTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
} from './platforms';

export default Object.assign(PrettyJsBridge, {
  androidTransport,
  customTransport,
  flutterTransport,
  iosTransport,
  reactNativeTransport,
});
