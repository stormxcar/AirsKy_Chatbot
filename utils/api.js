const axios = require("axios");

async function callMistralAPI(prompt) {
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
    return null; // Return null to indicate failure
  }
}

async function callGeminiAPI(prompt) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error(
      "❌ Error calling Gemini API:",
      error.response?.data || error.message
    );
    return null; // Return null to indicate failure
  }
}

async function callAPI(prompt) {
  // Try both APIs in parallel and return the first successful result
  console.log("🔄 Trying both Mistral and Gemini APIs in parallel...");

  return new Promise(async (resolve) => {
    let resolved = false;

    const checkResult = (result, source) => {
      if (!resolved && result) {
        resolved = true;
        console.log(`✅ ${source.toUpperCase()} API successful`);
        resolve(result);
      }
    };

    // Start both API calls
    const mistralPromise = callMistralAPI(prompt).then((result) => {
      checkResult(result, "mistral");
      return result;
    });

    const geminiPromise = callGeminiAPI(prompt).then((result) => {
      checkResult(result, "gemini");
      return result;
    });

    // Wait for both to complete, then check if any succeeded
    Promise.allSettled([mistralPromise, geminiPromise]).then(() => {
      if (!resolved) {
        // Both failed, try fallback approach with simple text processing
        console.log("🔄 Parallel attempt failed, trying simple fallback...");
        console.log("🔍 Prompt type:", typeof prompt, "Prompt value:", prompt);

        // Simple fallback: Basic entity extraction without AI
        const simpleResponse = generateSimpleResponse(prompt);
        if (simpleResponse) {
          console.log("✅ Simple fallback successful");
          resolve(simpleResponse);
        } else {
          console.error("❌ All API attempts failed including simple fallback");
          resolve(
            "Xin lỗi, tôi không thể xử lý yêu cầu của bạn lúc này. Vui lòng thử lại sau hoặc liên hệ hỗ trợ."
          );
        }
      }
    });
  });
}

function generateSimpleResponse(prompt) {
  // Add validation for prompt parameter
  if (!prompt || typeof prompt !== "string") {
    console.error(
      "❌ generateSimpleResponse received invalid prompt:",
      typeof prompt,
      prompt
    );
    return "Xin chào! Tôi có thể giúp bạn tìm kiếm chuyến bay. Hãy cho tôi biết điểm đi, điểm đến, ngày bay và loại vé (một chiều/khứ hồi).";
  }

  // Simple fallback response generation for basic queries
  const lowerPrompt = prompt.toLowerCase();

  // Basic flight search patterns
  if (lowerPrompt.includes("từ") && lowerPrompt.includes("đến")) {
    return 'Để tìm chuyến bay, bạn hãy cho tôi biết ngày bay cụ thể và loại vé (một chiều hoặc khứ hồi). Ví dụ: "từ Hà Nội đến Sài Gòn ngày 15 tháng 11 một chiều".';
  }

  if (lowerPrompt.includes("ngày") || lowerPrompt.includes("tháng")) {
    return "Cảm ơn bạn đã cung cấp thông tin ngày. Bạn muốn bay một chiều hay khứ hồi?";
  }

  if (lowerPrompt.includes("một chiều") || lowerPrompt.includes("khứ hồi")) {
    return "Tôi hiểu yêu cầu của bạn. Tôi sẽ tìm kiếm các chuyến bay phù hợp. Vui lòng đợi trong giây lát...";
  }

  // Default response
  return "Xin chào! Tôi có thể giúp bạn tìm kiếm chuyến bay. Hãy cho tôi biết điểm đi, điểm đến, ngày bay và loại vé (một chiều/khứ hồi).";
}

module.exports = { callAPI, callMistralAPI, callGeminiAPI };
