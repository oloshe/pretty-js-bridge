import {
  PrettyJsBridge,
  customTransport,
} from '../../src/public';

type EventPayloads = {
  pause: { timestamp: number };
  networkChanged: { online: boolean };
  themeChanged: { theme: 'light' | 'dark' };
};

export const eventBridge = PrettyJsBridge.register<{}, EventPayloads>()({
  methods: {},
  events: {
    pause: { path: 'onPause' },
    networkChanged: {
      path: 'androidJsObj.onNetworkChanged',
    },
    themeChanged: true,
  },
  nativeEntrypoints: ['callJsBridge'],
  transports: [
    customTransport({
      name: 'event-only-host',
      send: () => undefined,
    }),
  ],
});

export const stopPauseListener = eventBridge.$on(
  'pause',
  ({ timestamp }) => {
    console.log('paused at', new Date(timestamp));
  },
);

export const stopNetworkListener = eventBridge.$once(
  'networkChanged',
  ({ online }) => {
    console.log('first network state', online);
  },
);

export async function simulateNativeEvents(): Promise<void> {
  // Direct window callback installed from events.pause.path.
  (globalThis as any).onPause({ timestamp: Date.now() });

  // Nested callback path; JSON strings are parsed automatically.
  (globalThis as any).androidJsObj.onNetworkChanged(
    JSON.stringify({ online: true }),
  );

  // Unified callback entrypoint.
  await (globalThis as any).callJsBridge({
    type: 'event',
    name: 'themeChanged',
    data: { theme: 'dark' },
  });

  // The same dispatcher is available without installing a global entrypoint.
  await eventBridge.$dispatch({
    type: 'event',
    name: 'pause',
    data: { timestamp: Date.now() },
  });
}

export function disposeEventExample(): void {
  stopPauseListener();
  stopNetworkListener();
  eventBridge.$destroy();
}
