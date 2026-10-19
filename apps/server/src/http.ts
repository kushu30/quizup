import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

export function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

export function parseOrReject<Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
  response: Response,
): z.infer<Schema> | null {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  response.status(400).json({
    error: 'Invalid request',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
  return null;
}

export function sendNotFound(response: Response, what: string) {
  response.status(404).json({ error: `${what} not found` });
}

export function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function isHttpClientError(error: unknown): error is { status: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (isHttpClientError(error)) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
}
