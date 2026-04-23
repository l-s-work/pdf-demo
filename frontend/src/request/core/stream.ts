import { createManagedRequestController } from './cancel';
import { resolveRequestUrl } from './config';
import { AppRequestError, normalizeRequestError } from './error';
import type { StreamRequestOptions } from './types';

// 浏览器端流式请求能力，适合 SSE/分块文本/增量输出等场景。
export async function streamRequest<TResponse = string>(
  options: StreamRequestOptions
): Promise<TResponse> {
  const controller = createManagedRequestController(options);

  try {
    const response = await fetch(resolveRequestUrl(options.url), {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppRequestError({
        code: `HTTP_${response.status}`,
        message: (await response.text()) || `请求失败（${response.status}）`,
        status: response.status,
      });
    }

    if (!response.body) {
      if (options.responseType === 'json') {
        return (await response.json()) as TResponse;
      }

      if (options.responseType === 'arrayBuffer') {
        return (await response.arrayBuffer()) as TResponse;
      }

      return (await response.text()) as TResponse;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const chunks: Uint8Array[] = [];
    let textBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      const text = decoder.decode(value, { stream: true });
      chunks.push(value);
      textBuffer += text;
      options.onChunk?.({ chunk: value, text });
    }

    const tail = decoder.decode();
    if (tail) {
      textBuffer += tail;
    }

    if (options.responseType === 'json') {
      return JSON.parse(textBuffer) as TResponse;
    }

    if (options.responseType === 'arrayBuffer') {
      const totalLength = chunks.reduce((sum, item) => sum + item.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;

      for (const item of chunks) {
        merged.set(item, offset);
        offset += item.byteLength;
      }

      return merged.buffer as TResponse;
    }

    return textBuffer as TResponse;
  } catch (error) {
    throw normalizeRequestError(error);
  } finally {
    controller.dispose();
  }
}
