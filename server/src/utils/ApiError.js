class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;  
    this.success = false;

    
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;