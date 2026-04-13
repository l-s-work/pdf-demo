import type { AxiosRequestConfig, GenericAbortSignal } from 'axios';

// 外部可持有的取消函数类型。
export type RequestCancelHandler = (reason?: string) => void;

// 通用请求生命周期参数，支持外部 signal 和取消回调。
export interface RequestLifecycleOptions<TSignal = AbortSignal> {
  signal?: TSignal;
  onCancel?: (cancel: RequestCancelHandler) => void;
}

// 普通 HTTP 请求参数类型。
export interface RequestOptions<TData = unknown> extends Omit<AxiosRequestConfig<TData>, 'signal'>, RequestLifecycleOptions<GenericAbortSignal> {}

// 单次流式分片回调参数。
export interface StreamChunkPayload {
  chunk: Uint8Array;
  text: string;
}

// 流式请求支持的返回类型。
export type StreamResponseType = 'text' | 'json' | 'arrayBuffer';

// 流式请求参数类型。
export interface StreamRequestOptions extends RequestLifecycleOptions {
  url: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  responseType?: StreamResponseType;
  onChunk?: (payload: StreamChunkPayload) => void;
}
