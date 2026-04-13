// 统一维护前端请求层的基础地址配置。
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

// 将相对路径解析为可请求的绝对地址。
export function resolveRequestUrl(url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}
