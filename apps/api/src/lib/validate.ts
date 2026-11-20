import type { ZodTypeAny, z } from "zod";
import { badRequest } from "./errors";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest("validation_error", r.error.issues[0]?.message ?? "Invalid input", r.error.flatten());
  }
  return r.data;
}
