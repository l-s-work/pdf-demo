import type { GenericAbortSignal } from 'axios';
import type { RequestCancelHandler, RequestLifecycleOptions } from './types';

type ManagedExternalSignal = AbortSignal | GenericAbortSignal;

// 管理内部 AbortController，并向外暴露手动取消句柄。
export function createManagedRequestController(
  options?: RequestLifecycleOptions<ManagedExternalSignal>
) {
  const controller = new AbortController();
  const externalSignal = options?.signal;

  const cancel: RequestCancelHandler = (reason = '请求已取消') => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  const handleExternalAbort = () => {
    const signalReason =
      externalSignal && 'reason' in externalSignal ? externalSignal.reason : undefined;
    cancel(typeof signalReason === 'string' ? signalReason : '外部已取消请求');
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort();
    } else {
      externalSignal.addEventListener?.('abort', handleExternalAbort, { once: true });
    }
  }

  options?.onCancel?.(cancel);

  return {
    signal: controller.signal,
    cancel,
    dispose() {
      externalSignal?.removeEventListener?.('abort', handleExternalAbort);
    },
  };
}
