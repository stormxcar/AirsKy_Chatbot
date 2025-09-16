const axios = require("axios");

async function callAPI(prompt) {
  try {
    const response = await axios.post(
      process.env.MISTRAL_API_URL,
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
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
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

module.exports = { callAPI };
