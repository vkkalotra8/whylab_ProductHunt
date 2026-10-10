export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toProblemDetails(requestId: string, instance?: string): ProblemDetails {
    return {
      title: this.name,
      status: this.status,
      code: this.code,
      detail: this.message,
      requestId,
      instance,
      details: this.details,
    };
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST', details?: Record<string, unknown>): ApiError {
  return new ApiError(400, code, message, details);
}

export function unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED'): ApiError {
  return new ApiError(401, code, message);
}

export function forbidden(message = 'Access denied for resource', code = 'FORBIDDEN', details?: Record<string, unknown>): ApiError {
  return new ApiError(403, code, message, details);
}

export function notFound(resource: string, id: string, code = 'NOT_FOUND'): ApiError {
  return new ApiError(404, code, `${resource} with identifier '${id}' was not found.`, { resource, id });
}

export function conflict(message: string, code = 'CONFLICT', details?: Record<string, unknown>): ApiError {
  return new ApiError(409, code, message, details);
}

export function unprocessable(message: string, code = 'UNPROCESSABLE_ENTITY', details?: Record<string, unknown>): ApiError {
  return new ApiError(422, code, message, details);
}

export function internalError(message = 'Internal server error occurred', code = 'INTERNAL_ERROR'): ApiError {
  return new ApiError(500, code, message);
}

/**
 * Creates a standard JSON error Response conforming to RFC 7807 problem details.
 */
export function errorResponse(error: unknown, requestId: string, instance?: string): Response {
  if (error instanceof ApiError) {
    const problem = error.toProblemDetails(requestId, instance);
    return new Response(JSON.stringify(problem), {
      status: error.status,
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Request-Id': requestId,
      },
    });
  }

  const message = error instanceof Error ? error.message : 'Unknown internal error';
  const problem: ProblemDetails = {
    title: 'Internal Server Error',
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: message,
    requestId,
    instance,
  };

  return new Response(JSON.stringify(problem), {
    status: 500,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Request-Id': requestId,
    },
  });
}
