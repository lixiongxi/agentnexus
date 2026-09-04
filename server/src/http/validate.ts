/** zod 解析统一入口：校验失败自动转成 AppError，业务代码无需判空 */
import type { ZodType, output } from "zod";
import { AppError, ErrorCode } from "../core/errors";

/**
 * 解析并断言数据符合 schema。
 * 失败时抛出 VALIDATION_ERROR，附带完整的 issues 明细（前端可据此做字段级提示）。
 *
 * 泛型签名说明：约束到具体 schema 类型 S 而非 ZodSchema<T>，
 * 因为 ZodSchema<T> 等价于 ZodType<T, _, T>（输入=输出），
 * 对含 .default() 的 schema 会让 TS 把 T 推断成「输入类型」（字段可空），
 * 造成大量虚假的 possibly undefined 报错。
 */
export function parse<S extends ZodType>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join(".");
    const message = path ? `${path}: ${first?.message ?? "参数不合法"}` : (first?.message ?? "参数不合法");
    throw new AppError(ErrorCode.VALIDATION_ERROR, message, result.error.issues);
  }
  return result.data;
}
