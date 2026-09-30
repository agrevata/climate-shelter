import "server-only";
import { requireOrigin, readJson, httpError } from "./request";
export async function readMutation(request: Request) {
  requireOrigin(request);
  return readJson(request);
}
export const mutationError = httpError;
