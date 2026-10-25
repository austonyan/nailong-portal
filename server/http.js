// Shared HTTP helpers: typed API errors and small input validators.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code, message) {
  return new ApiError(400, code, message);
}

export function unauthorized(code = 'UNAUTHORIZED', message = code) {
  return new ApiError(401, code, message);
}

export function forbidden(code, message) {
  return new ApiError(403, code, message);
}

export function notFound(message = 'Resource not found') {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function conflict(code, message) {
  return new ApiError(409, code, message);
}

export function readString(value, { name, min = 0, max = 255, trim = true, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest('VALIDATION_ERROR', `${name} is required`);
  }
  if (typeof value !== 'string') {
    throw badRequest('VALIDATION_ERROR', `${name} must be a string`);
  }
  const v = trim ? value.trim() : value;
  if (v.length < min) {
    throw badRequest('VALIDATION_ERROR', `${name} must be at least ${min} characters`);
  }
  if (v.length > max) {
    throw badRequest('VALIDATION_ERROR', `${name} must be at most ${max} characters`);
  }
  return v;
}
