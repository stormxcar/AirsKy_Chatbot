// config/errors.js
class AppError extends Error {
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

// Error Codes and Messages
const ERROR_CODES = {
  // Validation Errors (400-499)
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    message: "Dữ liệu đầu vào không hợp lệ",
    statusCode: 400,
  },
  MISSING_REQUIRED_FIELD: {
    code: "MISSING_REQUIRED_FIELD",
    message: "Thiếu trường bắt buộc",
    statusCode: 400,
  },
  INVALID_FORMAT: {
    code: "INVALID_FORMAT",
    message: "Định dạng không hợp lệ",
    statusCode: 400,
  },

  // Authentication Errors (401)
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "Không có quyền truy cập",
    statusCode: 401,
  },

  // Database Errors (500)
  DATABASE_ERROR: {
    code: "DATABASE_ERROR",
    message: "Lỗi cơ sở dữ liệu",
    statusCode: 500,
  },
  CONNECTION_ERROR: {
    code: "CONNECTION_ERROR",
    message: "Lỗi kết nối",
    statusCode: 500,
  },

  // AI/Service Errors (500)
  AI_SERVICE_ERROR: {
    code: "AI_SERVICE_ERROR",
    message: "Lỗi dịch vụ AI",
    statusCode: 500,
  },
  EXTERNAL_API_ERROR: {
    code: "EXTERNAL_API_ERROR",
    message: "Lỗi dịch vụ bên ngoài",
    statusCode: 500,
  },

  // Business Logic Errors (400)
  NO_FLIGHTS_FOUND: {
    code: "NO_FLIGHTS_FOUND",
    message: "Không tìm thấy chuyến bay phù hợp",
    statusCode: 404,
  },
  INVALID_DATE_RANGE: {
    code: "INVALID_DATE_RANGE",
    message: "Khoảng thời gian không hợp lệ",
    statusCode: 400,
  },
  AIRPORT_NOT_FOUND: {
    code: "AIRPORT_NOT_FOUND",
    message: "Không tìm thấy sân bay",
    statusCode: 404,
  },

  // System Errors (500)
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "Lỗi hệ thống nội bộ",
    statusCode: 500,
  },
  CONFIGURATION_ERROR: {
    code: "CONFIGURATION_ERROR",
    message: "Lỗi cấu hình hệ thống",
    statusCode: 500,
  },
};

// Helper functions to create specific errors
const createError = (errorType, details = null, customMessage = null) => {
  const config = ERROR_CODES[errorType];
  if (!config) {
    throw new Error(`Unknown error type: ${errorType}`);
  }

  const message = customMessage || config.message;
  return new AppError(config.code, message, config.statusCode, details);
};

// Specific error creators
const errors = {
  // Validation errors
  validation: (details, message) =>
    createError("VALIDATION_ERROR", details, message),
  missingField: (field) =>
    createError(
      "MISSING_REQUIRED_FIELD",
      { field },
      `Thiếu trường bắt buộc: ${field}`
    ),
  invalidFormat: (field, expected) =>
    createError(
      "INVALID_FORMAT",
      { field, expected },
      `Định dạng không hợp lệ cho trường: ${field}`
    ),

  // Database errors
  database: (details) => createError("DATABASE_ERROR", details),
  connection: (details) => createError("CONNECTION_ERROR", details),

  // AI/Service errors
  aiService: (details) => createError("AI_SERVICE_ERROR", details),
  externalApi: (details) => createError("EXTERNAL_API_ERROR", details),

  // Business logic errors
  noFlights: (searchCriteria) =>
    createError("NO_FLIGHTS_FOUND", searchCriteria),
  invalidDateRange: (details) => createError("INVALID_DATE_RANGE", details),
  airportNotFound: (airportCode) =>
    createError("AIRPORT_NOT_FOUND", { airportCode }),

  // System errors
  internal: (details) => createError("INTERNAL_ERROR", details),
  config: (details) => createError("CONFIGURATION_ERROR", details),

  // Generic error with custom type
  custom: (errorType, details, message) =>
    createError(errorType, details, message),
};

// Error handler middleware for Express routes
const handleError = (error, req, res, next) => {
  // Log error
  console.error("Error occurred:", {
    message: error.message,
    stack: error.stack,
    code: error.code,
    details: error.details,
    url: req?.url,
    method: req?.method,
    timestamp: new Date().toISOString(),
  });

  // Handle AppError instances
  if (error instanceof AppError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  // Handle ValidationError from utils/validation.js
  if (error.name === "ValidationError") {
    const appError = new AppError("VALIDATION_ERROR", error.message, 400, {
      field: error.field,
    });
    return res.status(400).json(appError.toJSON());
  }

  // Handle other errors as internal server error
  const internalError = new AppError(
    "INTERNAL_ERROR",
    "Đã xảy ra lỗi không mong muốn",
    500,
    process.env.NODE_ENV === "development" ? error.message : undefined
  );

  res.status(500).json(internalError.toJSON());
};

// Async error wrapper for routes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ERROR_CODES,
  createError,
  errors,
  handleError,
  asyncHandler,
};
