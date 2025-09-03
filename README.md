# Chatbot Server for AirsKy

This is the backend server for the AirsKy chatbot, built with Node.js, Express, Socket.io, Redis, and integrated with Gemini API.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Configure environment variables:

   - Copy `.env` file and update the values:
     - `REDIS_URL`: Your Redis connection URL (default: redis://localhost:6379)
     - `GEMINI_API_KEY`: Your Google Gemini API key
     - `GEMINI_API_URL`: Gemini API endpoint (default provided)
     - `BACKEND_API_URL`: URL to your backend API (e.g., http://localhost:8080/api)
     - `PORT`: Server port (default: 3000)

3. Ensure Redis is running on your system.

4. Start the server:
   ```
   npm start
   ```
   Or for development with auto-reload:
   ```
   npm run dev
   ```

## Features

- Real-time chat using Socket.io
- AI responses powered by Google Gemini
- Context-aware responses based on flight and airport data
- Chat history stored in Redis
- Integration with backend API for dynamic data

## API Endpoints

- WebSocket: Connect to `/` for chat functionality
- Events:
  - `message`: Send user message
  - `response`: Receive AI response
  - `history`: Receive chat history on connection

## Project Structure

- `server.js`: Main server file
- `utils/`
  - `gemini.js`: Gemini API integration
  - `context.js`: Context building and prompt generation
  - `redis.js`: Redis operations for chat history
