import axios from 'axios';
import { createManagedRequestController } from './cancel';
import { API_BASE_URL } from './config';
import { normalizeRequestError } from './error';
import type { RequestOptions } from './types';

// 创建统一 axios 客户端，供普通 JSON API 请求复用。
const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeRequestError(error))
);

// 封装 GET / POST 等常见请求能力，并统一接入取消与错误处理。
class RequestClient {
  async request<TResponse, TData = unknown>(options: RequestOptions<TData>): Promise<TResponse> {
    const controller = createManagedRequestController(options);

    try {
      const response = await axiosClient.request<TResponse>({
        ...options,
        signal: controller.signal
      });
      return response.data;
    } catch (error) {
      throw normalizeRequestError(error);
    } finally {
      controller.dispose();
    }
  }

  async get<TResponse>(url: string, options?: RequestOptions): Promise<TResponse> {
    return this.request<TResponse>({
      ...options,
      url,
      method: 'GET'
    });
  }

  async post<TResponse, TData = unknown>(url: string, data?: TData, options?: RequestOptions<TData>): Promise<TResponse> {
    return this.request<TResponse, TData>({
      ...options,
      url,
      data,
      method: 'POST'
    });
  }
}

export const requestClient = new RequestClient();
