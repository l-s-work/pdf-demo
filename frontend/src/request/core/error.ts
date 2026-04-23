import axios from 'axios';

// 统一请求错误对象的构造参数。
interface AppRequestErrorOptions {
  code: string;
  message: string;
  status?: number;
  isCanceled?: boolean;
  raw?: unknown;
}

// 统一请求错误类型，屏蔽 axios / fetch / DOMException 差异。
export class AppRequestError extends Error {
  code: string;
  status?: number;
  isCanceled: boolean;
  raw?: unknown;

  constructor(options: AppRequestErrorOptions) {
    super(options.message);
    this.name = 'AppRequestError';
    this.code = options.code;
    this.status = options.status;
    this.isCanceled = options.isCanceled ?? false;
    this.raw = options.raw;
  }
}

// 统一提取后端返回中的 message/detail 字段。
function extractBackendMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if ('message' in payload && typeof payload.message === 'string') {
    return payload.message;
  }

  if ('detail' in payload && typeof payload.detail === 'string') {
    return payload.detail;
  }

  return undefined;
}

// 判断当前错误是否属于取消行为。
export function isRequestCanceledError(error: unknown): boolean {
  if (error instanceof AppRequestError) {
    return error.isCanceled;
  }

  if (axios.isCancel(error)) {
    return true;
  }

  return error instanceof DOMException && error.name === 'AbortError';
}

// 将任意错误统一转换为请求层错误结构。
export function normalizeRequestError(error: unknown): AppRequestError {
  if (error instanceof AppRequestError) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new AppRequestError({
      code: 'REQUEST_CANCELED',
      message: '请求已取消',
      isCanceled: true,
      raw: error,
    });
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const backendMessage = extractBackendMessage(error.response?.data);
    const isTimeout = error.code === 'ECONNABORTED';

    return new AppRequestError({
      code: error.code ?? (status ? `HTTP_${status}` : 'AXIOS_ERROR'),
      message:
        backendMessage ??
        (isTimeout ? '请求超时' : status ? `请求失败（${status}）` : '网络请求失败'),
      status,
      raw: error,
    });
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AppRequestError({
      code: 'REQUEST_CANCELED',
      message: '请求已取消',
      isCanceled: true,
      raw: error,
    });
  }

  if (error instanceof Error) {
    return new AppRequestError({
      code: 'UNKNOWN_ERROR',
      message: error.message || '未知请求错误',
      raw: error,
    });
  }

  return new AppRequestError({
    code: 'UNKNOWN_ERROR',
    message: '未知请求错误',
    raw: error,
  });
}

// 获取可直接显示给用户的错误文案。
export function getRequestErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (!error) {
    return fallback;
  }

  return normalizeRequestError(error).message || fallback;
}
