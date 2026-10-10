class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.data = data;
    this.error = null;
    this.message = message;
  }
}

export default ApiResponse;