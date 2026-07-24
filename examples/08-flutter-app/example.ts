import {
  PrettyJsBridge,
  flutterTransport,
  type BridgeMethod,
} from '../../src/public';

type FlutterAppProtocol = {
  methods: {
    getDeviceInfo: BridgeMethod<
      void,
      { platform: string; appVersion: string }
    >;
    showToast: BridgeMethod<
      { message: string },
      { shown: boolean }
    >;
  };
};

const logElement = document.querySelector<HTMLPreElement>('#log');
const writeLog = (...data: unknown[]): void => {
  console.log(...data);
  if (logElement) {
    logElement.textContent += `${data.map(String).join(' ')}\n`;
  }
};

export const flutterBridge =
  PrettyJsBridge.register<FlutterAppProtocol>({
    methods: {
      getDeviceInfo: true,
      showToast: true,
    },
    transports: [
      flutterTransport({
        channel: 'h5ToNative',
        kind: 'javascript-channel',
      }),
    ],
    logger: writeLog,
    timeout: 5_000,
  });

document.querySelector('#device-info')?.addEventListener('click', async () => {
  const info = await flutterBridge.getDeviceInfo();
  writeLog(`Flutter replied: ${info.platform} ${info.appVersion}`);
});

document.querySelector('#show-toast')?.addEventListener('click', async () => {
  const result = await flutterBridge.showToast({
    message: 'Hello from TypeScript',
  });
  writeLog(`Toast shown: ${result.shown}`);
});

window.addEventListener('beforeunload', () => {
  flutterBridge.$destroy();
});
