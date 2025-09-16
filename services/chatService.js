// services/chatService.js
const { extractEntitiesFromMessage } = require("../utils/entityExtractor");
const { buildSmartContext } = require("../utils/contextBuilder");
const { buildPrompt } = require("../utils/promptBuilder");
const { callAPI } = require("../utils/api");
const { findCannedResponse } = require("../utils/cannedResponses");
const { errors } = require("../config/errors");
const logger = require("../utils/logger");

/**
 * Format price in Vietnamese currency
 * @param {string|number} price - Price value
 * @returns {string} Formatted price
 */
function formatVietnamesePrice(price) {
  if (!price) return "Liên hệ";

  // Remove currency symbol if present
  const numericPrice =
    typeof price === "string"
      ? parseFloat(price.replace(/[^\d.]/g, ""))
      : price;

  if (isNaN(numericPrice)) return price;

  // Format with Vietnamese locale
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericPrice);
}

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
      // Check for canned responses first
      const cannedResponse = await findCannedResponse(message, dbPool);
      logger.info(
        "📋 Canned response result:",
        JSON.stringify(cannedResponse, null, 2)
      );
      if (cannedResponse) {
        logger.info("📋 Using canned response for:", message);

        const response = {
          userId,
          message: cannedResponse.message,
          context: {
            type: cannedResponse.type,
            message: cannedResponse.message,
          },
          data: cannedResponse.data || null,
          timestamp: new Date().toISOString(),
          isCanned: true,
        };

        socket.emit("chat_response", response);
        logger.info(
          "📤 Emitted canned response with type:",
          cannedResponse.type
        );
        return;
      }

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

      // Check if we have flight data - build structured JSON response
      if (
        context.type === "flights" &&
        context.data &&
        context.data.length > 0
      ) {
        logger.info("✈️ Found flights, building structured JSON response");

        // Format flights data with Vietnamese price formatting
        const formattedFlights = context.data.map((flight) => ({
          flightId: flight.flightId,
          flightNumber: flight.flightNumber,
          airline: flight.airline,
          tripType: flight.tripType,
          departureAirport: flight.departureAirport,
          departureCode: flight.departureCode,
          arrivalAirport: flight.arrivalAirport,
          arrivalCode: flight.arrivalCode,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime,
          price: flight.price, // Price already formatted in processFlightResults
        }));

        const responseMessage = `**Chào bạn!**\n\nTuyệt vời! Mình đã tìm thấy **${
          context.data.length
        } chuyến bay** từ **${entities.departure || "N/A"}** đến **${
          entities.arrival || "N/A"
        }** vào **${
          entities.date
            ? new Date(entities.date).toLocaleDateString("vi-VN")
            : "ngày yêu cầu"
        }**.`;

        const response = {
          userId,
          message: responseMessage,
          data: {
            flights: formattedFlights, // Array of flight objects
          },
          context: {
            type: context.type,
            totalFlights: context.data.length,
            searchCriteria: {
              departure: entities.departure,
              arrival: entities.arrival,
              date: entities.date,
            },
          },
          timestamp: new Date().toISOString(),
          isCanned: false,
        };

        socket.emit("chat_response", response);
        logger.info(
          "📤 Emitted flight response with",
          formattedFlights.length,
          "flights"
        );
        logger.info(
          "📤 Full response data:",
          JSON.stringify(response.data, null, 2)
        );
        return;
      }

      // Build prompt for other cases
      const prompt = buildPrompt(message, context, entities);
      logger.debug("🤖 Generated prompt length:", prompt.length);

      // Call AI API
      const aiResponse = await callAPI(prompt);
      logger.info("🤖 AI Response:", aiResponse.substring(0, 100) + "...");

      // Send response back to client
      socket.emit("chat_response", {
        userId,
        message: aiResponse,
        context: context,
        timestamp: new Date().toISOString(),
        isCanned: false,
      });
    } catch (error) {
      logger.error("❌ Error processing message:", error);

      // Create structured error response
      const errorResponse = errors.internal({
        originalError: error.message,
        userId: userId,
        timestamp: new Date().toISOString(),
      });

      socket.emit("chat_response", {
        userId,
        message:
          "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.",
        error: errorResponse.toJSON().error, // Include structured error info
        context: {
          type: "error",
          message: "Lỗi hệ thống",
        },
        timestamp: new Date().toISOString(),
        isCanned: false,
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
  formatVietnamesePrice,
};
