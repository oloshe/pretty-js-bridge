/**
 * @en Host platform identifiers supported by PrettyJsBridge.
 * @zh PrettyJsBridge 支持的宿主平台标识。
 */
export type BridgePlatform =
  | 'android'
  | 'ios'
  | 'flutter'
  | 'react-native'
  | 'custom';

/**
 * @en Declares the parameter and result types of an H5-to-native method.
 * @zh 声明 H5 调用 native 的方法参数与返回值。
 *
 * @typeParam Params @en The method parameter type. @zh 调用参数类型。
 * @typeParam Result @en The fulfilled result type. @zh Promise 成功结果类型。
 */
export interface BridgeMethod<Params = void, Result = void> {
  /**
   * @en Type-only parameter placeholder.
   * @zh 仅用于类型推断的参数占位。
   */
  readonly params: Params;
  /**
   * @en Type-only result placeholder.
   * @zh 仅用于类型推断的结果占位。
   */
  readonly result: Result;
}

/**
 * @en Declares an event emitted by native to H5.
 * @zh 声明由 native 发布给 H5 的事件。
 *
 * @typeParam Payload @en The event payload type. @zh 事件负载类型。
 */
export interface BridgeEvent<Payload = void> {
  /**
   * @en Type-only event payload placeholder.
   * @zh 仅用于类型推断的事件负载占位。
   */
  readonly payload: Payload;
}

/**
 * @en Declares a handler invoked by native and implemented by H5.
 * @zh 声明由 native 调用、H5 处理的 handler。
 *
 * @typeParam Params @en The handler parameter type. @zh handler 参数类型。
 * @typeParam Result @en The handler result type. @zh handler 结果类型。
 */
export interface BridgeHandler<Params = void, Result = void> {
  /**
   * @en Type-only parameter placeholder.
   * @zh 仅用于类型推断的参数占位。
   */
  readonly params: Params;
  /**
   * @en Type-only result placeholder.
   * @zh 仅用于类型推断的结果占位。
   */
  readonly result: Result;
}

/**
 * @en Declares all bridge methods, events, and handlers.
 * @zh 集中声明 bridge 的方法、事件和 handler。
 */
export interface BridgeSchema {
  /**
   * @en H5-to-native method map.
   * @zh H5 调用 native 的方法表。
   */
  methods: Record<string, BridgeMethod<any, any>>;
  /**
   * @en Native-to-H5 event map.
   * @zh native 发布给 H5 的事件表。
   */
  events?: Record<string, BridgeEvent<any>>;
  /**
   * @en Native-callable H5 handler map.
   * @zh native 调用的 H5 handler 表。
   */
  handlers?: Record<string, BridgeHandler<any, any>>;
}

/**
 * @en Function-style protocol for known methods while inferring extra methods.
 * @zh 函数式方法协议，用于声明已知方法并推断额外方法。
 */
export type BridgeMethodProtocol = Record<
  string,
  (...args: never[]) => unknown
>;

/**
 * @en Payload map for events declared alongside a function-style method protocol.
 * @zh 与函数式方法协议一起声明的事件 payload 映射。
 */
export type BridgeEventProtocol = object;

/**
 * @en Standard method request passed from H5 to a transport.
 * @zh H5 方法调用发送给 transport 的标准请求消息。
 */
export interface BridgeEnvelope {
  /**
   * @en Message kind; always `request`.
   * @zh 消息类型，固定为 `request`。
   */
  type: 'request';
  /**
   * @en H5 method name used during registration.
   * @zh 注册时使用的 H5 方法名。
   */
  method: string;
  /**
   * @en Call parameters; an array for multi-argument calls.
   * @zh 调用参数；多参数调用时为参数数组。
   */
  params?: unknown;
  /**
   * @en Unique callback ID generated for this call.
   * @zh 本次调用的唯一回调 ID。
   */
  $callbackId: string;
  /**
   * @en Internal callback path generated for this call.
   * @zh 本次调用的内部回调路径。
   */
  $callbackName: string;
  /**
   * @en Native-visible callback name supplied by `withCallback()`.
   * @zh `withCallback()` 指定的 native 可见回调名。
   */
  nativeCallbackName?: string;
}

/**
 * @en Result message sent to native after an H5 handler runs.
 * @zh H5 handler 执行后发送给 native 的结果消息。
 */
export interface HandlerResultEnvelope {
  /**
   * @en Message kind; always `handler-result`.
   * @zh 消息类型，固定为 `handler-result`。
   */
  type: 'handler-result';
  /**
   * @en Name of the executed handler.
   * @zh 已执行的 handler 名称。
   */
  handler: string;
  /**
   * @en Native-provided result correlation ID.
   * @zh native 提供的结果关联 ID。
   */
  callbackId?: string;
  /**
   * @en Data returned by a successful handler.
   * @zh handler 成功执行后的数据。
   */
  data?: unknown;
  /**
   * @en Error when the handler is missing or fails.
   * @zh handler 不存在或执行失败时的错误。
   */
  error?: unknown;
}

/**
 * @en Standard native-to-H5 messages accepted by `$dispatch()`.
 * @zh `$dispatch()` 接收的标准 native-to-H5 消息。
 */
export type NativeMessage =
  | {
      /**
       * @en Message variant kind.
       * @zh 消息分支类型。
       */
      type: 'response';
      /**
       * @en Callback ID matching the request.
       * @zh 与请求对应的回调 ID。
       */
      $callbackId: string;
      /**
       * @en Successful data returned by native.
       * @zh native 返回的成功数据。
       */
      data?: unknown;
      /**
       * @en Error information returned by native.
       * @zh native 返回的错误信息。
       */
      error?: unknown;
    }
  | {
      /**
       * @en Message variant kind.
       * @zh 消息分支类型。
       */
      type: 'event';
      /**
       * @en Registered event name.
       * @zh 已注册的事件名称。
       */
      name: string;
      /**
       * @en Data delivered to event listeners.
       * @zh 发送给事件监听器的数据。
       */
      data?: unknown;
    }
  | {
      /**
       * @en Message variant kind.
       * @zh 消息分支类型。
       */
      type: 'handler';
      /**
       * @en Registered H5 handler name.
       * @zh 已注册的 H5 handler 名称。
       */
      name: string;
      /**
       * @en Parameters passed to the handler.
       * @zh 发送给 handler 的参数。
       */
      data?: unknown;
      /**
       * @en Optional result ID; omit for fire-and-forget calls.
       * @zh 可选的结果关联 ID；省略时不发送结果。
       */
      callbackId?: string;
    };

/**
 * @en Common interface implemented by platform transports.
 * @zh 平台 transport 的统一接口。
 */
export interface BridgeTransport {
  /**
   * @en Unique transport name used for per-method selection.
   * @zh transport 唯一名称，可用于方法级选择。
   */
  readonly name: string;
  /**
   * @en Host platform represented by this transport.
   * @zh transport 对应的宿主平台。
   */
  readonly platform: BridgePlatform;
  /**
   * @en Checks whether the host bridge is available.
   * @zh 检查当前页面中宿主 bridge 是否可用。
   */
  isAvailable(): boolean;
  /**
   * @en Sends a standard message to the host.
   * @zh 把标准消息发送给宿主。
   *
   * @param message @en Request or handler-result message. @zh 请求或 handler 结果消息。
   * @param target @en Optional native method or channel name. @zh 可选的 native 方法或通道名。
   */
  send(message: BridgeEnvelope | HandlerResultEnvelope, target?: string): unknown;
}

type ParamsOf<T> = T extends BridgeMethod<infer P, any>
  ? P
  : T extends BridgeHandler<infer P, any>
    ? P
    : never;

type ResultOf<T> = T extends BridgeMethod<any, infer R>
  ? R
  : T extends BridgeHandler<any, infer R>
    ? R
    : never;

type MaybePromise<T> = T | Promise<T>;

/**
 * @en Receives English bridge lifecycle messages and optional context values.
 * @zh 接收英文 bridge 生命周期日志及可选上下文数据。
 */
export type BridgeLogger = (...data: unknown[]) => void;

/**
 * @en Current host environment used for method version checks.
 * @zh 当前宿主环境，用于方法版本判断。
 */
export interface BridgeEnvironment {
  /**
   * @en Host identifier such as `ios`, `android`, or `web`.
   * @zh 宿主标识，例如 `ios`、`android` 或 `web`。
   */
  platform: string;
  /**
   * @en Dot-separated numeric version such as `2.5.0`.
   * @zh 点分数字版本，例如 `2.5.0`。
   */
  version: string;
}

/**
 * @en Minimum supported version per platform; `true` means every version.
 * @zh 各平台的最低支持版本；`true` 表示该平台所有版本。
 */
export type MethodSupportMap = Readonly<
  Record<string, string | true>
>;

/**
 * @en Context supplied to a version fallback.
 * @zh 调用版本 fallback 时提供的上下文。
 */
export interface MethodFallbackContext {
  /**
   * @en Current H5 method name.
   * @zh 当前调用的 H5 方法名。
   */
  method: string;
  /**
   * @en Host environment supplied during registration.
   * @zh 注册时传入的宿主环境。
   */
  environment: BridgeEnvironment;
  /**
   * @en Platform/version requirements declared by the method.
   * @zh 方法声明的平台版本要求。
   */
  supportedFrom: MethodSupportMap;
}

/**
 * @en Native target name or target names selected by transport platform.
 * @zh native 方法名，或按 transport 平台选择的 native 方法名映射。
 */
export type MethodTarget = string | Readonly<
  Partial<Record<BridgePlatform, string>>
>;

/**
 * @en Runtime configuration for one bridge method.
 * @zh 单个 bridge 方法的运行时配置。
 *
 * @typeParam M @en Associated `BridgeMethod` declaration. @zh 对应的 `BridgeMethod` 声明。
 */
export interface MethodConfig<
  M extends BridgeMethod<any, any> = BridgeMethod<any, any>,
> {
  /**
   * @en Native method name or per-platform names; defaults to the schema method key.
   * @zh native 方法名或按平台配置的方法名；默认使用 schema 方法 key。
   */
  target?: MethodTarget;
  /**
   * @en Selects one named transport for this method.
   * @zh 为该方法指定一个 transport 名称。
   */
  transport?: string;
  /**
   * @en Timeout in milliseconds, overriding the global value.
   * @zh 本方法超时时间（毫秒），覆盖全局值。
   */
  timeout?: number;
  /**
   * @en Minimum version per platform; `true` allows all versions and omitted platforms are unsupported.
   * @zh 各平台最低支持版本；`true` 表示全部版本，未列出则不支持。
   */
  supportedFrom?: MethodSupportMap;
  /**
   * @en Runs instead of calling native when the current host is unsupported.
   * @zh 当前宿主不支持时执行，不再调用 native。
   *
   * @param params @en Parameters of the current call. @zh 本次方法调用参数。
   * @param context @en Method name, environment, and version requirements. @zh 方法名、宿主环境和版本要求。
   */
  fallback?: (
    params: ParamsOf<M>,
    context: MethodFallbackContext,
  ) => MaybePromise<ResultOf<M>>;
}

/**
 * @en Configuration for events exposed as native-callable global functions.
 * @zh native 直接调用全局事件函数时的配置。
 */
export interface EventConfig {
  /**
   * @en Native-visible path such as `onPause` or `androidJsObj.onPause`.
   * @zh native 可见路径，例如 `onPause` 或 `androidJsObj.onPause`。
   */
  path?: string;
}

/**
 * @en Configuration for an H5 handler directly invoked by native.
 * @zh native 直接调用 H5 handler 时的配置。
 */
export interface HandlerConfig {
  /**
   * @en Native-visible path for the handler.
   * @zh native 可见的 handler 路径。
   */
  path?: string;
}

/**
 * @en Configuration for a unified native-to-H5 message entrypoint.
 * @zh 统一 native-to-H5 消息入口配置。
 */
export interface NativeEntrypointConfig {
  /**
   * @en Unified entrypoint path; defaults to `callJsBridge`.
   * @zh 统一入口路径，默认 `callJsBridge`。
   */
  path?: string;
}

/**
 * @en Maps schema methods to registration configs.
 * @zh 将 schema 方法映射为注册配置。
 */
export type MethodConfigs<S extends BridgeSchema> = {
  [K in keyof S['methods']]: MethodConfig<S['methods'][K]> | true;
};

/**
 * @en Maps schema events to optional registration configs.
 * @zh 将 schema 事件映射为可选注册配置。
 */
export type EventConfigs<S extends BridgeSchema> = {
  [K in keyof NonNullable<S['events']>]?: EventConfig | true;
};

/**
 * @en Maps schema handlers to optional registration configs.
 * @zh 将 schema handler 映射为可选注册配置。
 */
export type HandlerConfigs<S extends BridgeSchema> = {
  [K in keyof NonNullable<S['handlers']>]?: HandlerConfig | true;
};

/**
 * @en Options for registering a bridge with a complete `BridgeSchema`.
 * @zh 使用完整 `BridgeSchema` 注册 bridge 的选项。
 */
export interface RegisterOptions<S extends BridgeSchema> {
  /**
   * @en Host platform and version used for support checks.
   * @zh 用于版本判断的宿主平台和版本。
   */
  environment?: BridgeEnvironment;
  /**
   * @en Required typed native method configs.
   * @zh 必须注册的 typed native 方法配置。
   */
  methods: MethodConfigs<S>;
  /**
   * @en Optional native-to-H5 event configs.
   * @zh 可选的 native-to-H5 事件配置。
   */
  events?: EventConfigs<S>;
  /**
   * @en Optional native-to-H5 handler configs.
   * @zh 可选的 native-to-H5 handler 配置。
   */
  handlers?: HandlerConfigs<S>;
  /**
   * @en Candidate transport list.
   * @zh 候选 transport 列表。
   */
  transports: readonly BridgeTransport[];
  /**
   * @en `first` sends to the first available transport; `broadcast` sends to all.
   * @zh `first` 发送到首个可用 transport；`broadcast` 发送到全部。
   */
  transportMode?: 'first' | 'broadcast';
  /**
   * @en Unified native-to-H5 entrypoint paths.
   * @zh 统一 native-to-H5 入口路径列表。
   */
  nativeEntrypoints?: readonly (NativeEntrypointConfig | string)[];
  /**
   * @en Global namespace used for generated callback paths.
   * @zh 自动生成回调路径时使用的全局命名空间。
   */
  callbackNamespace?: string;
  /**
   * @en Global call timeout in milliseconds.
   * @zh 全局调用超时时间（毫秒）。
   */
  timeout?: number;
  /**
   * @en Logger for bridge calls, callbacks, messages, handlers, and lifecycle events. Defaults to `console.log`.
   * @zh bridge 调用、回调、消息、handler 与生命周期日志函数，默认使用 `console.log`。
   */
  logger?: BridgeLogger;
  /**
   * @en Receives dispatch, handler, or transport errors.
   * @zh 接收 dispatch、handler 或 transport 错误。
   *
   * @param error @en The original captured error. @zh 捕获到的原始错误。
   */
  onError?: (error: unknown) => void;
}

/**
 * @en Registration options inferred when no schema generic is supplied.
 * @zh 不传 schema 泛型时使用的推断式注册选项。
 */
export interface InferredRegisterOptions {
  /**
   * @en Host platform and version used for support checks.
   * @zh 用于版本判断的宿主平台和版本。
   */
  environment?: BridgeEnvironment;
  /**
   * @en Native method configs inferred from object keys.
   * @zh 从对象 key 推断的 native 方法配置。
   */
  methods: Record<string, MethodConfig | true>;
  /**
   * @en Event configs inferred from object keys.
   * @zh 从对象 key 推断的事件配置。
   */
  events?: Record<string, EventConfig | true>;
  /**
   * @en Handler configs inferred from object keys.
   * @zh 从对象 key 推断的 handler 配置。
   */
  handlers?: Record<string, HandlerConfig | true>;
  /**
   * @en Candidate transport list.
   * @zh 候选 transport 列表。
   */
  transports: readonly BridgeTransport[];
  /**
   * @en Transport delivery mode.
   * @zh transport 发送模式。
   */
  transportMode?: 'first' | 'broadcast';
  /**
   * @en Unified native-to-H5 entrypoint paths.
   * @zh 统一 native-to-H5 入口路径列表。
   */
  nativeEntrypoints?: readonly (NativeEntrypointConfig | string)[];
  /**
   * @en Namespace used for generated callback paths.
   * @zh 自动生成回调路径时使用的命名空间。
   */
  callbackNamespace?: string;
  /**
   * @en Global call timeout in milliseconds.
   * @zh 全局调用超时时间（毫秒）。
   */
  timeout?: number;
  /**
   * @en Logger for bridge calls, callbacks, messages, handlers, and lifecycle events. Defaults to `console.log`.
   * @zh bridge 调用、回调、消息、handler 与生命周期日志函数，默认使用 `console.log`。
   */
  logger?: BridgeLogger;
  /**
   * @en Receives dispatch, handler, or transport errors.
   * @zh 接收 dispatch、handler 或 transport 错误。
   *
   * @param error @en The original captured error. @zh 捕获到的原始错误。
   */
  onError?: (error: unknown) => void;
}

type PayloadOf<T> = T extends BridgeEvent<infer P> ? P : never;
type CallArgs<P> = [P] extends [void] ? [] : [params: P];

/**
 * @en Creates a callable method with `withCallback()` from a `BridgeMethod`.
 * @zh 从 `BridgeMethod` 生成可调用方法，并附带 `withCallback()`。
 *
 * @param args @en Arguments matching the method declaration. @zh 与方法声明匹配的调用参数。
 */
export type TypedBridgeMethod<T> = ((
  ...args: CallArgs<ParamsOf<T>>
) => Promise<ResultOf<T>>) & {
  /**
   * @en Invokes with a native-visible callback name chosen at the call site.
   * @zh 使用调用处指定的 native 可见回调名发起请求。
   *
   * @param callbackName @en Global callback path invoked by native. @zh native 调用的全局回调路径。
   * @param args @en Method call arguments. @zh 方法调用参数。
   */
  withCallback(
    callbackName: string,
    ...args: CallArgs<ParamsOf<T>>
  ): Promise<ResultOf<T>>;
};

/**
 * @en Loose call type for an inferred method; arguments and result are `unknown`.
 * @zh 无协议方法的宽松调用类型；参数与结果均为 `unknown`。
 *
 * @param args @en Arbitrary call arguments. @zh 任意调用参数。
 */
export type UnknownTypedBridgeMethod = ((
  ...args: unknown[]
) => Promise<unknown>) & {
  /**
   * @en Invokes with a native-visible callback name chosen at the call site.
   * @zh 使用调用处指定的 native 可见回调名发起请求。
   *
   * @param callbackName @en Global callback path invoked by native. @zh native 调用的全局回调路径。
   * @param args @en Method call arguments. @zh 方法调用参数。
   */
  withCallback(
    callbackName: string,
    ...args: unknown[]
  ): Promise<unknown>;
};

type PromisifiedProtocolMethod<T> =
  T extends (...args: infer A) => infer R
    ? ((...args: A) => Promise<Awaited<R>>) & {
        /**
         * @en Invokes with a native-visible callback name chosen at the call site.
         * @zh 使用调用处指定的 native 可见回调名发起请求。
         *
         * @param callbackName @en Global callback path invoked by native. @zh native 调用的全局回调路径。
         * @param args @en Declared method arguments. @zh 已声明的方法参数。
         */
        withCallback(
          callbackName: string,
          ...args: A
        ): Promise<Awaited<R>>;
      }
    : never;

/**
 * @en Converts schema methods to typed Promise methods.
 * @zh 将 schema 方法转换为 typed Promise 方法。
 */
export type TypedBridgeMethods<S extends BridgeSchema> = {
  readonly [K in keyof S['methods']]: TypedBridgeMethod<S['methods'][K]>;
};

/**
 * @en Control methods available on every registered bridge.
 * @zh 每个已注册 bridge 都包含的控制方法。
 */
export interface BridgeControls<S extends BridgeSchema> {
  /**
   * @en Invokes native by method name.
   * @zh 按方法名调用 native。
   *
   * @param method @en Method name from the schema. @zh schema 中的方法名。
   * @param args @en Method arguments. @zh 方法参数。
   */
  $invoke<K extends keyof S['methods']>(
    method: K,
    ...args: CallArgs<ParamsOf<S['methods'][K]>>
  ): Promise<ResultOf<S['methods'][K]>>;

  /**
   * @en Subscribes to a persistent event.
   * @zh 订阅一个持续事件。
   *
   * @param event @en Event name from the schema. @zh schema 中的事件名。
   * @param listener @en Event listener. @zh 事件监听函数。
   * @returns @en Unsubscribe function. @zh 取消订阅函数。
   */
  $on<K extends keyof NonNullable<S['events']>>(
    event: K,
    listener: (payload: PayloadOf<NonNullable<S['events']>[K]>) => void,
  ): () => void;

  /**
   * @en Subscribes to an event for one emission only.
   * @zh 订阅一个只触发一次的事件。
   *
   * @param event @en Event name from the schema. @zh schema 中的事件名。
   * @param listener @en Event listener. @zh 事件监听函数。
   * @returns @en Function for cancelling before the event fires. @zh 提前取消订阅函数。
   */
  $once<K extends keyof NonNullable<S['events']>>(
    event: K,
    listener: (payload: PayloadOf<NonNullable<S['events']>[K]>) => void,
  ): () => void;

  /**
   * @en Registers an H5 handler callable by native.
   * @zh 注册供 native 调用的 H5 handler。
   *
   * @param handler @en Handler name from the schema. @zh schema 中的 handler 名。
   * @param callback @en Function that handles parameters and returns a result. @zh 处理参数并返回结果的函数。
   * @returns @en Function that unregisters the handler. @zh 注销 handler 的函数。
   */
  $handle<K extends keyof NonNullable<S['handlers']>>(
    handler: K,
    callback: (
      params: ParamsOf<NonNullable<S['handlers']>[K]>,
    ) => MaybePromise<ResultOf<NonNullable<S['handlers']>[K]>>,
  ): () => void;

  /**
   * @en Dispatches a standard native message or JSON string.
   * @zh 派发标准 native 消息或 JSON 字符串。
   *
   * @param message @en Response, event, or handler message. @zh 响应、事件或 handler 消息。
   */
  $dispatch(message: NativeMessage | string): Promise<void>;
  /**
   * @en Destroys the bridge and cleans listeners, entrypoints, and pending callbacks.
   * @zh 销毁 bridge 并清理监听器、入口和 pending 回调。
   */
  $destroy(): void;
}

/**
 * @en Typed bridge returned from a complete schema registration.
 * @zh 完整 schema 注册后得到的 typed bridge。
 */
export type RegisteredBridge<S extends BridgeSchema> = TypedBridgeMethods<S> &
  BridgeControls<S>;

type ProtocolMethodConfigs<S extends BridgeMethodProtocol> = {
  [K in keyof S]: MethodConfig | true;
} & Record<string, MethodConfig | true>;

type ProtocolEventConfigs<E extends BridgeEventProtocol> = {
  [K in keyof E]?: EventConfig | true;
} & Record<string, EventConfig | true>;

/**
 * @en Partial function-protocol options; `methods` may contain extra keys.
 * @zh 部分函数协议的注册选项；`methods` 可包含协议外的额外 key。
 */
export type ProtocolRegisterOptions<
  S extends BridgeMethodProtocol,
  E extends BridgeEventProtocol = {},
> = Omit<InferredRegisterOptions, 'methods' | 'events'> & {
  /**
   * @en Known method configs plus extra methods declared at the call site.
   * @zh 已知方法配置与调用处新增的方法配置。
   */
  methods: ProtocolMethodConfigs<S>;
  /**
   * @en Typed event configs plus extra events declared at the call site.
   * @zh 已声明类型的事件配置与调用处新增的事件配置。
   */
  events?: ProtocolEventConfigs<E>;
};

type InferredSchema<O extends InferredRegisterOptions> = {
  methods: {
    [K in keyof O['methods']]: BridgeMethod<unknown, unknown>;
  };
  events: O extends { events: infer E }
    ? { [K in keyof E]: BridgeEvent<unknown> }
    : {};
  handlers: O extends { handlers: infer H }
    ? { [K in keyof H]: BridgeHandler<unknown, unknown> }
    : {};
};

/**
 * @en Bridge inferred from options when no schema is supplied.
 * @zh 无 schema 注册时按配置推断出的 bridge。
 */
export type InferredRegisteredBridge<
  O extends InferredRegisterOptions,
> = {
  readonly [K in keyof O['methods']]: UnknownTypedBridgeMethod;
} & Omit<BridgeControls<InferredSchema<O>>, '$invoke'> & {
    /**
     * @en Invokes native by an inferred method name.
     * @zh 按推断出的方法名调用 native。
     *
     * @param method @en A key from the `methods` config. @zh `methods` 配置中的 key。
     * @param args @en Arbitrary call arguments. @zh 任意调用参数。
     */
    $invoke<K extends keyof O['methods']>(
      method: K,
      ...args: unknown[]
    ): Promise<unknown>;
  };

type ProtocolTypedMethods<
  S extends BridgeMethodProtocol,
  O extends ProtocolRegisterOptions<S>,
> = {
  readonly [K in keyof O['methods']]:
    K extends keyof S
      ? PromisifiedProtocolMethod<S[K]>
      : UnknownTypedBridgeMethod;
};

type ProtocolInvoke<
  S extends BridgeMethodProtocol,
  O extends ProtocolRegisterOptions<S>,
> = {
  /**
   * @en Invokes native by a configured name while preserving declared argument types.
   * @zh 按已配置的方法名调用 native，并保留已声明方法的参数类型。
   *
   * @param method @en A key from the `methods` config. @zh `methods` 配置中的 key。
   * @param args @en Declared arguments or unknown arguments for an extra method. @zh 已声明参数或额外方法的未知参数。
   */
  $invoke<K extends keyof O['methods']>(
    method: K,
    ...args: K extends keyof S
      ? Parameters<S[K]>
      : unknown[]
  ): Promise<
    K extends keyof S
      ? Awaited<ReturnType<S[K]>>
      : unknown
  >;
};

type ProtocolEvents<
  E extends BridgeEventProtocol,
  O extends InferredRegisterOptions,
> = {
  [K in keyof E]: BridgeEvent<E[K]>;
} & (O extends { events: infer Configs }
  ? {
      [K in Exclude<keyof Configs, keyof E>]: BridgeEvent<unknown>;
    }
  : {});

type ProtocolSchema<
  E extends BridgeEventProtocol,
  O extends InferredRegisterOptions,
> = Omit<InferredSchema<O>, 'events'> & {
  events: ProtocolEvents<E, O>;
};

/**
 * @en Bridge returned from partial function-protocol registration.
 * @zh 部分函数协议注册后得到的 bridge。
 */
export type ProtocolRegisteredBridge<
  S extends BridgeMethodProtocol,
  E extends BridgeEventProtocol,
  O extends ProtocolRegisterOptions<S, E>,
> = ProtocolTypedMethods<S, O> &
  Omit<BridgeControls<ProtocolSchema<E, O>>, '$invoke'> &
  ProtocolInvoke<S, O>;

/**
 * @en Second-stage registrar returned by `PrettyJsBridge.register<Protocol>()`.
 * @zh `PrettyJsBridge.register<Protocol>()` 返回的第二阶段注册函数。
 *
 * @param options @en Options containing known and extra methods. @zh 包含已知及额外方法的注册配置。
 */
export type ProtocolRegistrar<
  S extends BridgeMethodProtocol,
  E extends BridgeEventProtocol = {},
> = <const O extends ProtocolRegisterOptions<S, E>>(
  options: O,
) => ProtocolRegisteredBridge<S, E, O>;
