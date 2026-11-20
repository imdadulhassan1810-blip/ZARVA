export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
export const unauthorized = (msg = "Not signed in") => new AppError(401, "unauthorized", msg);
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const tooMany = (msg: string, retryAfter: number) => new AppError(429, "rate_limited", msg, { retryAfter });
export const forbidden = (msg = "Not allowed") => new AppError(403, "forbidden", msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
