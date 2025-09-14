const axios = require("axios");

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_API_KEY = "rfqO8m9lB8sx7FyUVs0Q7Y6mXxWCtaOt";

async function callAPI(prompt) {
  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: "mistral-medium", 
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(
      "❌ Error calling Mistral API:",
      error.response?.data || error.message
    );

    // Fallback response khi API lỗi
    return "Xin lỗi, tôi không thể xử lý yêu cầu của bạn lúc này. Vui lòng thử lại sau.";
  }
}

module.exports = { callGeminiAPI };
