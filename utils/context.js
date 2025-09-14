const {
  extractEntitiesFromMessage,
  extractCities,
  extractDate,
} = require("./entityExtractor");
const { buildSmartContext } = require("./contextBuilder");
const { buildPrompt } = require("./promptBuilder");
const {
  ValidationError,
  validateMessage,
  validateUserId,
  validateDbPool,
  validateEntities,
} = require("./validation");
const logger = require("./logger");

// Wrapper functions với validation và error handling
async function safeExtractEntitiesFromMessage(message) {
  try {
    const validMessage = validateMessage(message);
    logger.logEntityExtraction(validMessage, "starting");
    const result = await extractEntitiesFromMessage(validMessage);
    logger.logEntityExtraction(validMessage, result);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error(
        "Validation error in extractEntitiesFromMessage:",
        error.message
      );
      throw error;
    }
    logger.error("Error in extractEntitiesFromMessage:", error.message);
    // Return fallback
    return {
      departure: null,
      arrival: null,
      date: extractDate(message),
    };
  }
}

async function safeExtractCities(message, dbPool, entities) {
  try {
    const validMessage = validateMessage(message);
    const validDbPool = validateDbPool(dbPool);
    const validEntities = validateEntities(entities);
    logger.logCitySearch(validMessage, "starting");
    const result = await extractCities(
      validMessage,
      validDbPool,
      validEntities
    );
    logger.logCitySearch(validMessage, result);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error("Validation error in extractCities:", error.message);
      throw error;
    }
    logger.error("Error in extractCities:", error.message);
    return [];
  }
}

function safeExtractDate(message) {
  try {
    const validMessage = validateMessage(message);
    logger.logDateExtraction(validMessage, "starting");
    const result = extractDate(validMessage);
    logger.logDateExtraction(validMessage, result);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error("Validation error in extractDate:", error.message);
      throw error;
    }
    logger.error("Error in extractDate:", error.message);
    return null;
  }
}

async function safeBuildSmartContext(userId, message, dbPool, entities) {
  try {
    const validUserId = validateUserId(userId);
    const validMessage = validateMessage(message);
    const validDbPool = validateDbPool(dbPool);
    const validEntities = validateEntities(entities);
    logger.logContextBuilding(validUserId, validMessage, "starting");
    const result = await buildSmartContext(
      validUserId,
      validMessage,
      validDbPool,
      validEntities
    );
    logger.logContextBuilding(validUserId, validMessage, result);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error("Validation error in buildSmartContext:", error.message);
      throw error;
    }
    logger.error("Error in buildSmartContext:", error.message);
    return {
      type: "error",
      message: "Có lỗi xảy ra khi xử lý yêu cầu của bạn.",
      data: [],
    };
  }
}

function safeBuildPrompt(message, context, entities = {}) {
  try {
    const validMessage = validateMessage(message);
    const validContext = require("./validation").validateContext(context);
    const validEntities = validateEntities(entities);
    logger.logPromptBuilding(validMessage, "starting");
    const result = buildPrompt(validMessage, validContext, validEntities);
    logger.logPromptBuilding(validMessage, result.length);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error("Validation error in buildPrompt:", error.message);
      throw error;
    }
    logger.error("Error in buildPrompt:", error.message);
    return `Bạn là trợ lý AI của AirSky. Có lỗi xảy ra khi xử lý tin nhắn: "${message}"`;
  }
}

module.exports = {
  extractEntitiesFromMessage: safeExtractEntitiesFromMessage,
  extractCities: safeExtractCities,
  buildSmartContext: safeBuildSmartContext,
  buildPrompt: safeBuildPrompt,
  extractDate: safeExtractDate,
  // Export original functions for testing
  _extractEntitiesFromMessage: extractEntitiesFromMessage,
  _extractCities: extractCities,
  _buildSmartContext: buildSmartContext,
  _buildPrompt: buildPrompt,
  _extractDate: extractDate,
};
