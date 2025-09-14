// services/chatService.js
const { extractEntitiesFromMessage } = require("../utils/entityExtractor");
const { buildSmartContext } = require("../utils/contextBuilder");
const { buildPrompt } = require("../utils/promptBuilder");
const { callAPI } = require("../utils/api");
const logger = require("../utils/logger");

/**
 * Handle chat message from socket
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - Socket connection
 * @param {Object} dbPool - Database connection pool
 */
function handleChatMessage(io, socket, dbPool) {
  socket.on("chat_message", async (data) => {
    const { userId, message } = data;
    logger.info(`💬 Message from ${userId}:`, message);

    try {
      // Extract entities from message
      const entities = await extractEntitiesFromMessage(message);
      logger.debug("🤖 Extracted entities:", entities);

      // Build context using database
      const context = await buildSmartContext(
        userId,
        message,
        dbPool,
        entities
      );
      logger.debug("🤖 Built context:", context);

      // Build prompt
      const prompt = buildPrompt(message, context, entities);
      logger.debug("🤖 Generated prompt length:", prompt.length);

      // Call AI API
      const aiResponse = await callAPI(prompt);
      logger.info("🤖 AI Response:", aiResponse.substring(0, 100) + "...");

      // Send response back to client
      socket.emit("chat_response", {
        message: aiResponse,
        context: context,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error("❌ Error processing message:", error);

      socket.emit("chat_response", {
        message: "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.",
        context: {
          type: "error",
          message: "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.",
        },
        timestamp: new Date(),
      });
    }
  });
}

/**
 * Handle socket join event
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - Socket connection
 */
function handleJoin(io, socket) {
  socket.on("join", (userId) => {
    socket.join(userId);
    logger.info(`👤 User ${userId} joined room`);
  });
}

/**
 * Handle socket disconnect
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - Socket connection
 */
function handleDisconnect(io, socket) {
  socket.on("disconnect", () => {
    logger.info("👤 User disconnected:", socket.id);
  });
}

/**
 * Initialize all socket handlers
 * @param {Object} io - Socket.io instance
 * @param {Object} dbPool - Database connection pool
 */
function initializeSocketHandlers(io, dbPool) {
  io.on("connection", (socket) => {
    logger.info("👤 User connected:", socket.id);

    // Send empty chat history for now
    socket.emit("chat_history", []);

    // Attach event handlers
    handleJoin(io, socket);
    handleChatMessage(io, socket, dbPool);
    handleDisconnect(io, socket);
  });
}

module.exports = {
  initializeSocketHandlers,
  handleChatMessage,
  handleJoin,
  handleDisconnect,
};
