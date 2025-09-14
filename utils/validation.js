// utils/validation.js
const logger = require("./logger");

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

function validateMessage(message) {
  if (!message || typeof message !== "string") {
    throw new ValidationError("Message must be a non-empty string", "message");
  }

  if (message.length > 1000) {
    throw new ValidationError(
      "Message is too long (max 1000 characters)",
      "message"
    );
  }

  return message.trim();
}

function validateUserId(userId) {
  if (!userId || typeof userId !== "string") {
    throw new ValidationError("UserId must be a non-empty string", "userId");
  }

  return userId.trim();
}

function validateDbPool(dbPool) {
  if (!dbPool || typeof dbPool.execute !== "function") {
    throw new ValidationError("Invalid database pool", "dbPool");
  }

  return dbPool;
}

function validateEntities(entities) {
  if (!entities || typeof entities !== "object") {
    throw new ValidationError("Entities must be an object", "entities");
  }

  // Validate date format if present
  if (entities.date && !/^\d{4}-\d{2}-\d{2}$/.test(entities.date)) {
    throw new ValidationError(
      "Date must be in YYYY-MM-DD format",
      "entities.date"
    );
  }

  return entities;
}

function validateContext(context) {
  if (!context || typeof context !== "object") {
    throw new ValidationError("Context must be an object", "context");
  }

  if (
    !context.type ||
    !["flights", "airports", "text", "error"].includes(context.type)
  ) {
    throw new ValidationError("Invalid context type", "context.type");
  }

  if (!context.message || typeof context.message !== "string") {
    throw new ValidationError(
      "Context message must be a string",
      "context.message"
    );
  }

  return context;
}

module.exports = {
  ValidationError,
  validateMessage,
  validateUserId,
  validateDbPool,
  validateEntities,
  validateContext,
};
