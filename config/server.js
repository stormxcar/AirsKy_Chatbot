// config/server.js
module.exports = {
  PORT: process.env.PORT || 3000,
  CORS_ORIGINS: [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
  ],
  SOCKET_METHODS: ["GET", "POST"],
};
