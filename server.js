require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Import configurations
const serverConfig = require("./config/server");
const dbConfig = require("./config/database");
const { handleError } = require("./config/errors");

// Import services
const { initializeSocketHandlers } = require("./services/chatService");

// Import utils
const logger = require("./utils/logger");
const { initializeLangChainSQL } = require("./utils/langchainSQL");

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: serverConfig.CORS_ORIGINS,
    methods: serverConfig.SOCKET_METHODS,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static("."));

// Initialize LangChain SQL Manager
initializeLangChainSQL(dbConfig);

// Initialize socket handlers
initializeSocketHandlers(io, dbConfig);

// Error handling middleware (must be last)
app.use(handleError);

// Start server
const PORT = serverConfig.PORT;
server.listen(PORT, () => {
  logger.info(`🚀 AirsKy Chatbot Server running on port ${PORT}`);
});
