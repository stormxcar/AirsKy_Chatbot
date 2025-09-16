// utils/promptBuilder.js
const logger = require("./logger");

/**
 * Detect query type based on message content
 */
function detectQueryType(message, entities = {}) {
  const lowerMessage = message.toLowerCase();

  // Flight search keywords
  const flightKeywords = [
    "tìm chuyến bay",
    "chuyến bay",
    "bay từ",
    "bay đến",
    "đặt vé",
    "giá vé",
    "khởi hành",
    "flight",
    "book",
    "reservation",
  ];

  // Information/general keywords
  const infoKeywords = [
    "thông tin",
    "giới thiệu",
    "mô tả",
    "tỉnh",
    "thành phố",
    "địa điểm",
    "du lịch",
    "khách sạn",
    "ẩm thực",
    "đặc sản",
    "lịch sử",
    "văn hóa",
    "thắng cảnh",
    "biên giới",
    "địa lý",
    "dân số",
    "kinh tế",
  ];

  // Check for flight search
  const hasFlightKeywords = flightKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  // Check for information query
  const hasInfoKeywords = infoKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  // If has entities (departure/arrival), likely flight search
  if (entities.departure || entities.arrival) {
    return "flight_search";
  }

  // If explicit flight keywords, flight search
  if (hasFlightKeywords) {
    return "flight_search";
  }

  // If information keywords, information query
  if (hasInfoKeywords) {
    return "information";
  }

  // Default to general conversation
  return "general";
}

/**
 * Build rich context for information queries
 */
function buildInformationContext(message, entities = {}) {
  let context = "";

  // Extract location from message or entities
  const locationMatch = message.match(
    /(?:tỉnh|thành phố|địa điểm)?\s*([A-ZÀ-Ỹ][a-zà-ỹ\s]+)(?:là|thế nào|có gì|như thế nào|ra sao)/i
  );
  const location = locationMatch
    ? locationMatch[1].trim()
    : entities.arrival || entities.departure || null;

  if (location) {
    context += `## 📍 Thông tin về ${location}\n\n`;
    context += `Người dùng đang hỏi về thông tin địa điểm: ${location}\n\n`;
    context += `Hãy cung cấp thông tin hữu ích về ${location} bao gồm:\n`;
    context += `- Mô tả tổng quan về địa điểm\n`;
    context += `- Các điểm tham quan nổi tiếng\n`;
    context += `- Đặc sản địa phương\n`;
    context += `- Thông tin du lịch hữu ích\n\n`;
  }

  return context;
}

/**
 * Build enhanced prompt based on query type
 */
function buildPrompt(message, context, entities = {}) {
  const queryType = detectQueryType(message, entities);
  logger.info(`🤖 Detected query type: ${queryType}`);

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;

  // Handle text context (no flight data)
  if (context.type === "text") {
    const dateStr = entities.date
      ? new Date(entities.date).toLocaleDateString("vi-VN")
      : "đó";

    if (queryType === "information") {
      // Rich information query
      const infoContext = buildInformationContext(message, entities);
      return `Bạn là trợ lý AI của AirSky, chuyên về du lịch và đặt vé máy bay Việt Nam.

${infoContext}

CÂU HỎI CỦA KHÁCH: "${message}"

HƯỚNG DẪN TRẢ LỜI:
- Bắt đầu bằng lời chào thân thiện: "Chào bạn!" hoặc "Xin chào bạn!"
- Mô tả địa điểm một cách sinh động, hấp dẫn
- Kết hợp thông tin du lịch với gợi ý về chuyến bay nếu phù hợp
- Giữ giọng điệu thân thiện, như bạn bè chia sẻ kinh nghiệm du lịch
- Nếu đề cập đến chuyến bay: "Nếu bạn muốn đi du lịch ${
        entities.arrival || "địa điểm này"
      }, mình có thể giúp tìm vé máy bay phù hợp nhé!"
- Kết thúc bằng câu hỏi để tiếp tục cuộc trò chuyện: "Bạn có muốn biết thêm thông tin gì không?" hoặc "Mình có thể hỗ trợ gì thêm cho chuyến đi của bạn?"`;
    }

    return `Bạn là trợ lý AI của AirSky. Người dùng hỏi: "${message}"

Thông tin hiện có: ${context.message}

Hãy trả lời trực tiếp bằng tiếng Việt, bắt đầu bằng "Chào bạn!", giải thích rằng để tìm chuyến bay cần biết thành phố đi và đến, và hỏi cụ thể: "Bạn muốn bay từ thành phố nào đến thành phố nào vào ngày ${dateStr}?" Luôn có câu hỏi lại sau câu trả lời.`;
  }

  // Build context based on type
  let contextText = "";
  let promptType = "general";

  if (context.type === "flights") {
    promptType = "flight_results";
    contextText = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
    contextText += `**Loại chuyến bay:** ${
      entities.trip_type === "ROUND_TRIP" ? "Khứ hồi" : "Một chiều"
    }\n`;
    contextText += `**Tuyến bay:** ${departureCity || "N/A"} → ${
      arrivalCity || "N/A"
    }\n`;

    if (entities.trip_type === "ROUND_TRIP") {
      contextText += `**Ngày đi:** ${entities.date || "Chưa xác định"}\n`;
      if (entities.return_date) {
        contextText += `**Ngày về:** ${entities.return_date}\n`;
      }
      contextText += `\n`;
    } else {
      contextText += `**Ngày bay:** ${entities.date || "Chưa xác định"}\n\n`;
    }

    contextText += `**Số chuyến bay tìm thấy:** ${context.data.length}\n\n`;

    if (context.data.length > 0) {
      contextText += `### 📋 Danh sách chuyến bay:\n\n`;
      context.data.forEach((flight, index) => {
        contextText += `**${index + 1}. ${flight.flightNumber}** - ${
          flight.airline
        }\n`;
        contextText += `- **Từ:** ${flight.departure} (${flight.departureAirport} - ${flight.departureCode})\n`;
        contextText += `- **Đến:** ${flight.arrival} (${flight.arrivalAirport} - ${flight.arrivalCode})\n`;
        contextText += `- **Giờ khởi hành:** ${flight.departureTime}\n`;
        contextText += `- **Giờ đến:** ${flight.arrivalTime}\n`;
        contextText += `- **Giá vé:** ${flight.price}\n`;
        contextText += `- **Ghế trống:** ${flight.seats}\n\n`;
      });
    }
  } else if (context.type === "airports") {
    promptType = "airport_info";
    contextText = `${context.message}\n`;
    context.data.forEach((airport) => {
      contextText += `- ${airport.name} (${airport.code}) - ${airport.city}\n`;
    });
  } else {
    contextText = context.message;
  }

  // Enhanced prompts based on query type and context
  if (queryType === "information" && context.type === "flights") {
    // Information query with flight results - combine both
    const infoContext = buildInformationContext(message, entities);
    return `Bạn là trợ lý AI của AirSky, chuyên về du lịch và đặt vé máy bay Việt Nam.

${infoContext}

THÔNG TIN CHUYẾN BAY TÌM THẤY: ${contextText}

CÂU HỎI CỦA KHÁCH: "${message}"

HƯỚNG DẪN TRẢ LỜI:
- Bắt đầu bằng lời chào thân thiện và giới thiệu về địa điểm
- Mô tả địa điểm một cách sinh động, hấp dẫn
- Chuyển tiếp tự nhiên sang thông tin chuyến bay: "Ngoài ra, mình cũng tìm được một số chuyến bay đến ${
      arrivalCity || "địa điểm này"
    } phù hợp với lịch trình của bạn:"
- Liệt kê chuyến bay với format rõ ràng, dễ đọc
- Kết hợp thông tin du lịch với practical advice về đi lại
- Giữ giọng điệu thân thiện, chuyên nghiệp
- Kết thúc bằng câu hỏi: "Bạn muốn đặt vé chuyến bay nào?" hoặc "Mình có thể hỗ trợ gì thêm cho chuyến đi của bạn?"`;
  }

  if (queryType === "information") {
    // Pure information query
    const infoContext = buildInformationContext(message, entities);
    return `Bạn là trợ lý AI của AirSky, chuyên về du lịch và đặt vé máy bay Việt Nam.

${infoContext}

CÂU HỎI CỦA KHÁCH: "${message}"

HƯỚNG DẪN TRẢ LỜI:
- Bắt đầu bằng lời chào thân thiện
- Cung cấp thông tin phong phú về địa điểm
- Gợi ý về du lịch, ăn uống, tham quan
- Nếu phù hợp, đề cập đến việc đi lại bằng máy bay: "Để đến ${
      entities.arrival || "địa điểm này"
    }, bạn có thể bay từ các sân bay lớn như Tân Sơn Nhất, Nội Bài..."
- Giữ cuộc trò chuyện tự nhiên, hấp dẫn
- Kết thúc bằng câu hỏi để tiếp tục: "Bạn có kế hoạch du lịch đến đây không?"`;
  }

  // Default flight/general response
  return `Bạn là trợ lý AI của AirSky, chuyên về đặt vé máy bay. Trả lời bằng tiếng Việt tự nhiên, thân thiện.

THÔNG TIN CHUYẾN BAY: ${contextText}

CÂU HỎI CỦA KHÁCH: ${message}

HƯỚNG DẪN TRẢ LỜI:
- Sử dụng format Markdown cho chuyến bay (giống như thông tin cung cấp)
- Nếu là vé khứ hồi: Đề cập rõ "Đây là các chuyến bay khứ hồi" và giải thích về ngày đi/ngày về
- Nếu có chuyến bay: Liệt kê với đầy đủ thông tin sân bay (tên sân bay - mã sân bay)
- Format: "**Chuyến bay [mã]** của **[hãng]** từ **[thành phố]** (**[tên sân bay]** - **[mã]**) đến **[thành phố]** (**[tên sân bay]** - **[mã]**), khởi hành **[giờ]**, giá **[giá]** VND, còn **[ghế]** ghế."
- Cho khứ hồi: Gợi ý chọn chuyến bay đi và chuyến bay về phù hợp
- Nếu không có: Gợi ý kiểm tra tên thành phố khác hoặc ngày khác
- Luôn hỏi thêm: "Bạn cần hỗ trợ gì thêm không?" hoặc "Bạn muốn đặt vé chuyến bay nào?"
- Giữ cuộc trò chuyện tự nhiên, như bạn bè
- Sử dụng dữ liệu thực tế, không bịa đặt thông tin`;
}

module.exports = {
  buildPrompt,
  detectQueryType,
  buildInformationContext,
};
