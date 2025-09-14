// utils/logger.js
class Logger {
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
    };
    this.currentLevel = process.env.LOG_LEVEL
      ? this.levels[process.env.LOG_LEVEL.toUpperCase()]
      : this.levels.INFO;
  }

  error(message, ...args) {
    if (this.currentLevel >= this.levels.ERROR) {
      console.error(`❌ ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.currentLevel >= this.levels.WARN) {
      console.warn(`⚠️ ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.currentLevel >= this.levels.INFO) {
      console.info(`ℹ️ ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (this.currentLevel >= this.levels.DEBUG) {
      console.debug(`🔍 ${message}`, ...args);
    }
  }

  logEntityExtraction(message, entities) {
    this.debug("Entity extraction:", { message, entities });
  }

  logDateExtraction(message, date) {
    this.debug("Date extraction:", { message, date });
  }

  logCitySearch(message, cities) {
    this.debug("City search:", { message, cities });
  }

  logContextBuilding(userId, message, context) {
    this.debug("Context building:", {
      userId,
      message,
      contextType: context.type,
    });
  }

  logPromptBuilding(message, promptLength) {
    this.debug("Prompt building:", {
      message: message.substring(0, 50) + "...",
      promptLength,
    });
  }
}

module.exports = new Logger();
