/**
 * 统一响应包装。
 * 所有接口一律返回 { ok: true, data } 或 { ok: false, error: { code, message } }，
 * 杜绝 v1 中「同一个字段有时在顶层、有时在 data 里」的不一致。
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiFailure {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

/** 分页响应（列表接口统一形状，前端可复用同一套分页组件） */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize };
}
