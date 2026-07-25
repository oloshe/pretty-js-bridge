import type {
  BridgeEnvelope,
  BridgeEnvironment,
  BridgeEventProtocol,
  BridgeLogger,
  BridgeMethodProtocol,
  BridgeSchema,
  HandlerResultEnvelope,
  InferredRegisterOptions,
  InferredRegisteredBridge,
  MethodConfig,
  MethodSupportMap,
  MethodTarget,
  NativeMessage,
  ProtocolRegistrar,
  RegisterOptions,
  RegisteredBridge,
} from './schema';
import {
  getAtPath,
  installAtPath,
  parseNativeMessage,
  serializeError,
} from './runtime-utils';

type Listener = (payload: unknown) => void;
type Handler = (params: unknown) => unknown | Promise<unknown>;

interface PendingCall {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  cleanupCallback: () => void;
}

const CONTROL_KEYS = new Set([
  '$invoke',
  '$on',
  '$once',
  '$handle',
  '$dispatch',
  '$destroy',
]);

/**
 * @en Registration entrypoint for PrettyJsBridge.
 * @zh PrettyJsBridge 的注册入口。
 */
export class PrettyJsBridge {
  /**
   * @en Declares a partial function protocol, then registers through the returned function.
   * @zh 先声明部分函数协议，再通过返回函数注册配置。
   *
   * @typeParam S @en Known method function signatures. @zh 已知方法的函数签名。
   * @typeParam E @en Event names mapped to payload types. @zh 事件名到 payload 类型的映射。
   */
  static register<
    S extends BridgeMethodProtocol,
    E extends BridgeEventProtocol = {},
  >(): ProtocolRegistrar<S, E>;

  /**
   * @en Infers the API directly from configuration keys without a generic.
   * @zh 不传泛型，直接从配置 key 推断 API。
   *
   * @param options @en Inferred registration options. @zh 推断式注册配置。
   */
  static register<const O extends InferredRegisterOptions>(
    options: O,
  ): InferredRegisteredBridge<O>;

  /**
   * @en Registers a strictly typed bridge with a complete `BridgeSchema`.
   * @zh 使用完整 `BridgeSchema` 注册严格类型的 bridge。
   *
   * @typeParam S @en Complete bridge schema. @zh 完整 bridge schema。
   * @param options @en Options matching the schema. @zh 与 schema 匹配的配置。
   */
  static register<S extends BridgeSchema>(
    options: RegisterOptions<S>,
  ): RegisteredBridge<S>;

  static register(
    options?: InferredRegisterOptions | RegisterOptions<any>,
  ): object {
    if (!options) {
      return (nextOptions: InferredRegisterOptions) =>
        new BridgeRuntime(nextOptions).publicApi();
    }
    return new BridgeRuntime(options).publicApi();
  }
}

/**
 * @en Error thrown when a method is unsupported and no fallback is provided.
 * @zh 平台或版本不支持方法且没有 fallback 时抛出的错误。
 */
export class UnsupportedBridgeMethodError extends Error {
  /**
   * @en Stable error name.
   * @zh 稳定的错误名称。
   */
  readonly name = 'UnsupportedBridgeMethodError';

  /**
   * @en Creates an unsupported-method error.
   * @zh 创建不支持方法错误。
   *
   * @param method @en Invoked method name. @zh 被调用的方法名。
   * @param environment @en Current platform and version. @zh 当前平台与版本。
   * @param supportedFrom @en Declared platform/version requirements. @zh 方法声明的平台版本要求。
   */
  constructor(
    /**
     * @en Invoked method name.
     * @zh 被调用的方法名。
     */
    readonly method: string,
    /**
     * @en Current host platform and version.
     * @zh 当前宿主平台与版本。
     */
    readonly environment: BridgeEnvironment,
    /**
     * @en Declared platform/version requirements.
     * @zh 方法声明的平台版本要求。
     */
    readonly supportedFrom: MethodSupportMap,
  ) {
    const minimum = supportedFrom[environment.platform];
    const reason =
      minimum === undefined
        ? `platform "${environment.platform}" is not supported`
        : `version "${environment.version}" is lower than "${minimum}"`;
    super(`Bridge method "${method}" is unavailable: ${reason}.`);
  }
}

class BridgeRuntime {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly eventNamesByPath = new Map<string, string>();
  private readonly handlers = new Map<string, Handler>();
  private readonly pending = new Map<string, PendingCall>();
  private readonly uninstallers: Array<() => void> = [];
  private readonly callbackNamespace: string;
  private readonly logger: BridgeLogger;
  private sequence = 0;
  private destroyed = false;

  constructor(
    private readonly options:
      | InferredRegisterOptions
      | RegisterOptions<any>,
  ) {
    this.callbackNamespace =
      options.callbackNamespace ?? '__prettyJsBridgeCallbacks';
    this.logger =
      options.logger ?? ((...data: unknown[]) => console.log(...data));
    this.installNativeCallbacks();
    this.log('Bridge registered.', {
      methods: Object.keys(options.methods),
      transports: options.transports.map((transport) => transport.name),
    });
  }

  publicApi(): object {
    const api: Record<string, unknown> = {
      $invoke: (method: PropertyKey, ...args: unknown[]) =>
        this.invoke(method, undefined, ...args),
      $on: this.on.bind(this),
      $once: this.once.bind(this),
      $handle: this.handle.bind(this),
      $dispatch: this.dispatch.bind(this),
      $destroy: this.destroy.bind(this),
    };
    for (const method of Object.keys(this.options.methods)) {
      if (CONTROL_KEYS.has(method)) {
        const error = new Error(`Bridge method "${method}" is reserved.`);
        this.log('Bridge registration failed.', { method, error });
        throw error;
      }
      const invoke = (...args: unknown[]) =>
        this.invoke(method, undefined, ...args);
      invoke.withCallback = (
        nativeCallbackName: string,
        ...args: unknown[]
      ) => this.invoke(method, nativeCallbackName, ...args);
      const configured = (
        this.options.methods as Record<string, true | MethodConfig>
      )[method];
      if (configured !== true && configured?.presets) {
        for (const [presetName, presetParams] of Object.entries(
          configured.presets,
        )) {
          if (presetName in invoke) {
            const error = new Error(
              `Bridge preset "${method}.${presetName}" is reserved.`,
            );
            this.log('Bridge registration failed.', {
              method,
              preset: presetName,
              error,
            });
            throw error;
          }
          Object.defineProperty(invoke, presetName, {
            enumerable: true,
            value: () => this.invoke(method, undefined, presetParams),
          });
        }
      }
      api[method] = invoke;
    }
    return Object.freeze(api);
  }

  private invoke(
    method: PropertyKey,
    nativeCallbackName: string | undefined,
    ...args: unknown[]
  ): Promise<unknown> {
    this.assertActive();
    const name = String(method);
    this.log('Calling native method.', {
      method: name,
      args,
      nativeCallbackName,
    });
    const configured = (
      this.options.methods as Record<
        string,
        true | MethodConfig
      >
    )[name];
    if (!configured) {
      const error = new Error(`Unknown bridge method "${name}".`);
      this.log('Native method call rejected.', { method: name, error });
      return Promise.reject(error);
    }
    const config = configured === true ? {} : configured;
    const params =
      args.length < 2 ? args[0] : args;
    const invokeNative = () =>
      this.invokeNative(
        name,
        nativeCallbackName,
        config,
        params,
        args.length > 0,
      );
    if (!config.hook) return invokeNative();
    this.log('Using method hook.', { method: name, params });
    try {
      return Promise.resolve(config.hook(params, invokeNative));
    } catch (error) {
      this.log('Method hook failed.', { method: name, error });
      return Promise.reject(error);
    }
  }

  private invokeNative(
    name: string,
    nativeCallbackName: string | undefined,
    config: MethodConfig,
    params: unknown,
    hasParams: boolean,
  ): Promise<unknown> {
    if (config.supportedFrom) {
      const environment = this.options.environment;
      if (!environment) {
        const error = new Error(
          `Bridge method "${name}" declares supportedFrom, but register() has no environment.`,
        );
        this.log('Native method call rejected.', { method: name, error });
        return Promise.reject(error);
      }
      if (!isMethodSupported(environment, config.supportedFrom)) {
        if (!config.fallback) {
          const error = new UnsupportedBridgeMethodError(
            name,
            environment,
            config.supportedFrom,
          );
          this.log('Native method call rejected.', { method: name, error });
          return Promise.reject(error);
        }
        this.log('Using method fallback.', { method: name, params });
        try {
          return Promise.resolve(
            config.fallback(params, {
              method: name,
              environment,
              supportedFrom: config.supportedFrom,
            }),
          );
        } catch (error) {
          this.log('Method fallback failed.', { method: name, error });
          return Promise.reject(error);
        }
      }
    }
    const resolvedNativeCallbackName =
      nativeCallbackName ?? config.callbackName;
    const callbackId = `${Date.now().toString(36)}_${++this.sequence}`;
    const callbackName = `${this.callbackNamespace}.${callbackId}`;
    const envelope: BridgeEnvelope = {
      type: 'request',
      method: name,
      $callbackId: callbackId,
      $callbackName: callbackName,
    };
    if (resolvedNativeCallbackName) {
      envelope.nativeCallbackName = resolvedNativeCallbackName;
    }
    if (hasParams) envelope.params = params;

    return new Promise((resolve, reject) => {
      const cleanupCallback = installAtPath(callbackName, (value: unknown) => {
        this.log('Native callback received.', {
          method: name,
          callbackId,
          value,
        });
        const parsed = parseNativeMessage(value);
        if (
          parsed &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          (parsed as { error?: unknown }).error !== undefined
        ) {
          this.settle(callbackId, false, (parsed as { error: unknown }).error);
          return;
        }
        const data =
          parsed && typeof parsed === 'object' && 'data' in parsed
            ? (parsed as { data?: unknown }).data
            : parsed;
        this.settle(callbackId, true, parseNativeMessage(data));
      });
      const callbackEventName = resolvedNativeCallbackName
        ? this.eventNamesByPath.get(resolvedNativeCallbackName)
        : undefined;
      const forwardNativeResponse = (value: unknown) => {
        const callback = getAtPath(callbackName);
        if (typeof callback === 'function') {
          (callback as (response: unknown) => void)(value);
        }
      };
      const cleanupNativeCallback =
        resolvedNativeCallbackName &&
        resolvedNativeCallbackName !== callbackName
          ? callbackEventName
            ? this.once(callbackEventName, forwardNativeResponse)
            : installAtPath(resolvedNativeCallbackName, forwardNativeResponse)
          : () => undefined;
      const timeout = config.timeout ?? this.options.timeout;
      const pending: PendingCall = {
        method: name,
        resolve,
        reject,
        cleanupCallback: () => {
          cleanupNativeCallback();
          cleanupCallback();
        },
      };
      if (timeout && timeout > 0) {
        pending.timer = setTimeout(
          () =>
            this.settle(
              callbackId,
              false,
              new Error(`Bridge call "${name}" timed out after ${timeout}ms.`),
            ),
          timeout,
        );
      }
      this.pending.set(callbackId, pending);
      try {
        this.send(envelope, config.target ?? name, config.transport);
      } catch (error) {
        this.settle(callbackId, false, error);
      }
    });
  }

  private on(event: PropertyKey, listener: Listener): () => void {
    this.assertActive();
    const name = String(event);
    this.log('Event listener registered.', { event: name });
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(name, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(name);
    };
  }

  private once(event: PropertyKey, listener: Listener): () => void {
    const name = String(event);
    const wrapped = (payload: unknown) => {
      const set = this.listeners.get(name)!;
      set.delete(wrapped);
      if (set.size === 0) this.listeners.delete(name);
      listener(payload);
    };
    return this.on(name, wrapped);
  }

  private handle(name: PropertyKey, handler: Handler): () => void {
    this.assertActive();
    const key = String(name);
    this.log('H5 handler registered.', { handler: key });
    this.handlers.set(key, handler);
    return () => {
      if (this.handlers.get(key) === handler) this.handlers.delete(key);
    };
  }

  private async dispatch(input: NativeMessage | string): Promise<void> {
    this.assertActive();
    const parsed = parseNativeMessage(input);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      throw new Error('Invalid native message.');
    }
    const message = parsed as NativeMessage;
    this.log('Native message received.', { message });
    if (message.type === 'response') {
      this.settle(
        message.$callbackId,
        message.error === undefined,
        message.error === undefined
          ? parseNativeMessage(message.data)
          : message.error,
      );
    } else if (message.type === 'event') {
      for (const listener of this.listeners.get(message.name) ?? []) {
        listener(parseNativeMessage(message.data));
      }
    } else {
      await this.dispatchHandler(
        message.name,
        parseNativeMessage(message.data),
        message.callbackId,
      );
    }
  }

  private async dispatchHandler(
    name: string,
    data: unknown,
    callbackId?: string,
  ): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      const error = new Error(`No H5 handler registered for "${name}".`);
      this.log('H5 handler call failed.', { handler: name, error });
      this.options.onError?.(error);
      if (callbackId) {
        this.sendHandlerResult({
          type: 'handler-result',
          handler: name,
          callbackId,
          error: serializeError(error),
        });
      }
      return;
    }
    try {
      const result = await handler(data);
      this.log('H5 handler completed.', { handler: name, result });
      if (callbackId) {
        this.sendHandlerResult({
          type: 'handler-result',
          handler: name,
          callbackId,
          data: result,
        });
      }
    } catch (error) {
      this.log('H5 handler call failed.', { handler: name, error });
      this.options.onError?.(error);
      if (callbackId) {
        this.sendHandlerResult({
          type: 'handler-result',
          handler: name,
          callbackId,
          error: serializeError(error),
        });
      }
    }
  }

  private send(
    message: BridgeEnvelope | HandlerResultEnvelope,
    target?: MethodTarget,
    transportName?: string,
  ): void {
    let available = this.options.transports.filter(
      (transport) =>
        (!transportName || transport.name === transportName) &&
        transport.isAvailable(),
    );
    if (transportName && available.length === 0) {
      const exists = this.options.transports.some(
        (transport) => transport.name === transportName,
      );
      if (!exists) throw new Error(`Unknown transport "${transportName}".`);
    }
    if (available.length === 0) {
      throw new Error('No native bridge transport is available.');
    }
    if ((this.options.transportMode ?? 'first') === 'first') {
      available = available.slice(0, 1);
    }
    const defaultTarget =
      message.type === 'request' ? message.method : message.handler;
    for (const transport of available) {
      const resolvedTarget =
        typeof target === 'string'
          ? target
          : (target?.[transport.platform] ?? defaultTarget);
      this.log('Sending bridge message.', {
        message,
        target: resolvedTarget,
        transport: transport.name,
      });
      transport.send(message, resolvedTarget);
    }
  }

  private sendHandlerResult(message: HandlerResultEnvelope): void {
    try {
      this.send(message, message.handler);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private settle(callbackId: string, success: boolean, value: unknown): void {
    const pending = this.pending.get(callbackId);
    if (!pending) return;
    this.pending.delete(callbackId);
    this.log(success ? 'Bridge call resolved.' : 'Bridge call rejected.', {
      method: pending.method,
      callbackId,
      value,
    });
    if (pending.timer) clearTimeout(pending.timer);
    pending.cleanupCallback();
    if (success) pending.resolve(value);
    else pending.reject(value);
  }

  private installNativeCallbacks(): void {
    const eventConfigs = (this.options.events ?? {}) as Record<
      string,
      true | { path?: string }
    >;
    for (const [name, configured] of Object.entries(eventConfigs)) {
      const path = configured === true ? name : (configured.path ?? name);
      this.eventNamesByPath.set(path, name);
      this.uninstallers.push(
        installAtPath(path, (data: unknown) =>
          this.dispatch({
            type: 'event',
            name,
            data: parseNativeMessage(data),
          }),
        ),
      );
    }

    const handlerConfigs = (this.options.handlers ?? {}) as Record<
      string,
      true | { path?: string }
    >;
    for (const [name, configured] of Object.entries(handlerConfigs)) {
      const path = configured === true ? name : (configured.path ?? name);
      this.uninstallers.push(
        installAtPath(path, (data: unknown, callbackId?: unknown) =>
          this.dispatch({
            type: 'handler',
            name,
            data: parseNativeMessage(data),
            callbackId:
              typeof callbackId === 'string' ? callbackId : undefined,
          }),
        ),
      );
    }

    for (const configured of this.options.nativeEntrypoints ?? []) {
      const path =
        typeof configured === 'string'
          ? configured
          : (configured.path ?? 'callJsBridge');
      this.uninstallers.push(
        installAtPath(path, (message: NativeMessage | string) =>
          this.dispatch(message),
        ),
      );
    }
  }

  private destroy(): void {
    if (this.destroyed) {
      this.log('Bridge destroy skipped; instance is already destroyed.', {});
      return;
    }
    this.destroyed = true;
    this.log('Destroying bridge.', { pendingCalls: this.pending.size });
    for (const uninstall of this.uninstallers.reverse()) uninstall();
    for (const callbackId of [...this.pending.keys()]) {
      this.settle(
        callbackId,
        false,
        new Error('PrettyJsBridge instance was destroyed.'),
      );
    }
    this.listeners.clear();
    this.handlers.clear();
    this.log('Bridge destroyed.', {});
  }

  private assertActive(): void {
    if (this.destroyed) {
      const error = new Error('PrettyJsBridge instance has been destroyed.');
      this.log('Bridge operation rejected.', { error });
      throw error;
    }
  }

  private log(message: string, details: Record<string, unknown>): void {
    this.logger(`[PrettyJsBridge] ${message}`, details);
  }
}

const isMethodSupported = (
  environment: BridgeEnvironment,
  supportedFrom: MethodSupportMap,
): boolean => {
  const minimum = supportedFrom[environment.platform];
  return (
    minimum === true ||
    (typeof minimum === 'string' &&
      compareVersions(environment.version, minimum) >= 0)
  );
};

const compareVersions = (left: string, right: string): number => {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const versionParts = (version: string): number[] =>
  version.split('.').map((part) => {
    const match = /^\d+/.exec(part);
    return match ? Number(match[0]) : 0;
  });
