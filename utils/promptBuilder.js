const logger = require("./logger");

// Configuration for query types
const queryTypesConfig = {
  flight_search: {
    keywords: [
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
      "khứ hồi",
      "một chiều",
      "round trip",
      "one way",
    ],
    priorityEntities: ["departure", "arrival", "date"],
  },
  information: {
    keywords: [
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
      "cẩm nang",
      "kinh nghiệm",
      "hướng dẫn",
    ],
  },
  booking: {
    keywords: [
      "đặt vé",
      "mua vé",
      "book vé",
      "đặt chỗ",
      "reservation",
      "thanh toán",
      "payment",
      "pay",
      "thẻ tín dụng",
      "momo",
      "zalopay",
    ],
  },
  cancellation: {
    keywords: [
      "đổi vé",
      "thay đổi vé",
      "chỉnh sửa vé",
      "hủy vé",
      "chính sách",
      "hoàn tiền",
      "refund",
      "trả tiền",
      "hoàn lại",
    ],
  },
  luggage: {
    keywords: ["hành lý", "kiện", "valet", "cân nặng", "quá khổ"],
  },
  delay: {
    keywords: [
      "trễ chuyến",
      "delay",
      "hoãn chuyến",
      "bồi thường",
      "compensation",
    ],
  },
  airline: {
    keywords: [
      "hãng hàng không",
      "airline",
      "vietnam airlines",
      "vietjet",
      "bamboo",
    ],
  },
  airport: {
    keywords: ["sân bay", "airport", "danh sách sân bay", "các sân bay"],
  },
  country: {
    keywords: [
      "quốc gia",
      "countries",
      "điểm đến quốc tế",
      "du lịch nước ngoài",
    ],
  },
  travel_class: {
    keywords: [
      "hạng vé",
      "travel class",
      "economy",
      "business",
      "first class",
      "phổ thông",
      "thương gia",
    ],
  },
  blog: {
    keywords: [
      "blog",
      "tin tức",
      "bài viết",
      "cẩm nang",
      "hướng dẫn",
      "kinh nghiệm",
    ],
  },
  deal: {
    keywords: ["khuyến mãi", "deals", "giảm giá", "ưu đãi", "sale", "discount"],
  },
  aircraft: {
    keywords: ["máy bay", "aircraft", "phi cơ", "loại máy bay"],
  },
  gate: {
    keywords: ["cửa ra máy bay", "gate", "cửa khởi hành", "boarding gate"],
  },
  contact: {
    keywords: ["liên hệ", "hotline", "phone", "điện thoại", "support"],
  },
  working_hours: {
    keywords: ["giờ làm việc", "giờ mở cửa", "thời gian hoạt động", "giờ bay"],
  },
  general: {
    // Default fallback
    keywords: [],
  },
};

/**
 * Detect query type based on message content and entities
 */
function detectQueryType(message, entities = {}) {
  const lowerMessage = message.toLowerCase().trim();

  // Check for entity-based priority (e.g., flight if departure/arrival present)
  for (const [type, config] of Object.entries(queryTypesConfig)) {
    if (
      config.priorityEntities &&
      config.priorityEntities.some((ent) => entities[ent])
    ) {
      logger.info(`🤖 Detected query type via entities: ${type}`);
      return type;
    }
  }

  // Check keywords
  for (const [type, config] of Object.entries(queryTypesConfig)) {
    if (
      config.keywords.some((keyword) =>
        lowerMessage.includes(keyword.toLowerCase())
      )
    ) {
      logger.info(`🤖 Detected query type via keywords: ${type}`);
      return type;
    }
  }

  logger.info(`🤖 Default query type: general`);
  return "general";
}

/**
 * Build rich context for specific query types
 */
function buildContext(queryType, message, entities = {}, context = {}) {
  let builtContext = "";

  switch (queryType) {
    case "information":
      const locationMatch = message.match(
        /(?:tỉnh|thành phố|địa điểm)?\s*([A-ZÀ-Ỹ][a-zà-ỹ\s]+)(?:là|thế nào|có gì|như thế nào|ra sao)/i
      );
      const location = locationMatch
        ? locationMatch[1].trim()
        : entities.arrival || entities.departure || null;
      if (location) {
        builtContext += `## 📍 Thông tin về ${location}\n\n`;
        builtContext += `Người dùng đang hỏi về: ${location}\n`;
        builtContext += `Cung cấp: Tổng quan, điểm tham quan, đặc sản, thông tin du lịch.\n`;
      }
      break;
    case "flight_search":
      if (context.type === "flights") {
        builtContext += `## ✈️ Kết quả chuyến bay\n`;
        builtContext += `Loại: ${
          entities.trip_type === "ROUND_TRIP" ? "Khứ hồi" : "Một chiều"
        }\n`;
        builtContext += `Tuyến: ${entities.departure || "N/A"} → ${
          entities.arrival || "N/A"
        }\n`;
        builtContext += `Ngày đi: ${entities.date || "Chưa xác định"}\n`;
        if (entities.trip_type === "ROUND_TRIP")
          builtContext += `Ngày về: ${
            entities.return_date || "Chưa xác định"
          }\n`;
        builtContext += `Số chuyến: ${context.data?.length || 0}\n\n`;
        context.data?.forEach((flight, i) => {
          builtContext += `${i + 1}. ${flight.flightNumber} - ${
            flight.airline
          }\n`;
          builtContext += `Từ: ${flight.departure} (${flight.departureAirport} - ${flight.departureCode})\n`;
          builtContext += `Đến: ${flight.arrival} (${flight.arrivalAirport} - ${flight.arrivalCode})\n`;
          builtContext += `Khởi hành: ${flight.departureTime}, Đến: ${flight.arrivalTime}\n`;
          builtContext += `Giá: ${flight.price} VND, Ghế: ${flight.seats}\n\n`;
        });
      } else if (context.type === "airports") {
        builtContext += `## 🏢 Danh sách sân bay\n`;
        context.data?.airports?.forEach((airport) => {
          builtContext += `- ${airport.airport_name} (${airport.airport_code}) - ${airport.city_name}\n`;
        });
      }
      break;
    // Add cases for other types if needed, e.g., airline, airport, etc.
    default:
      builtContext = context.message || "";
  }

  return builtContext;
}

/**
 * Build enhanced prompt based on query type
 */
function buildPrompt(message, context, entities = {}) {
  const queryType = detectQueryType(message, entities);
  const builtContext = buildContext(queryType, message, entities, context);
  const dateStr = entities.date
    ? new Date(entities.date).toLocaleDateString("vi-VN")
    : "đó";
  const location = entities.arrival || entities.departure || "địa điểm này";

  let basePrompt = `Bạn là trợ lý AI của AirSky, chuyên về du lịch và đặt vé máy bay Việt Nam. Trả lời bằng tiếng Việt tự nhiên, thân thiện, như bạn bè chia sẻ.

THÔNG TIN HIỆN CÓ: ${builtContext}

CÂU HỎI: "${message}"

QUAN TRỌNG VỀ THỜI GIAN:
- NGÀY HIỆN TẠI LÀ: ${new Date().toLocaleDateString(
    "vi-VN"
  )} (${new Date().toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
  })})
- LUÔN SỬ DỤNG NĂM HIỆN TẠI HOẶC TƯƠNG LAI CHO CÁC NGÀY TƯƠNG LAI
- Nếu đề cập "thứ hai tuần sau" → tính là ${new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toLocaleDateString("vi-VN")}
- Nếu đề cập "tuần sau" → tính từ ngày ${new Date().toLocaleDateString("vi-VN")}
- Nếu đề cập "cuối tuần" → tính từ ngày ${new Date().toLocaleDateString(
    "vi-VN"
  )}

QUAN TRỌNG VỀ NGUỒN THÔNG TIN:
- CHỈ SỬ DỤNG DỮ LIỆU TỪ HỆ THỐNG AIRSKY - KHÔNG TÌM KIẾM BÊN NGOÀI
- KHÔNG ĐỀ CẬP HOẶC GỠI Ý CÁC NỀN TẢNG ĐẶT VÉ KHÁC
- KHÔNG TẠO LINK HOẶC HƯỚNG DẪN TRUY CẬP WEBSITE BÊN NGOÀI
- Nếu không có thông tin: Xin lỗi và hướng dẫn liên hệ hotline hoặc kiểm tra lại
- Tập trung hỗ trợ đặt vé qua hệ thống AirSky của chúng ta

HƯỚNG DẪN: `;

  switch (queryType) {
    case "flight_search":
      basePrompt += `- CHỈ HIỂN THỊ CHUYẾN BAY TỪ HỆ THỐNG AIRSKY - KHÔNG ĐỀ CẬP CÁC HÃNG KHÁC
- Nếu không có chuyến bay: Xin lỗi và gợi ý ngày khác hoặc liên hệ hotline 1900 XXX XXX
- Không gợi ý tìm trên website Vietjet, Vietnam Airlines, hoặc các nền tảng khác
- Không tạo link hoặc hướng dẫn truy cập website bên ngoài
- Tập trung giới thiệu các chuyến bay có sẵn trong hệ thống AirSky
- Sử dụng Markdown cho danh sách chuyến bay.
- Nếu khứ hồi: Gợi ý chọn chuyến đi/về phù hợp.
- Nếu cần thêm info: Hỏi "Bạn muốn bay từ thành phố nào đến thành phố nào vào ngày ${dateStr}?"
- Kết thúc bằng: "Bạn muốn đặt vé nào?" hoặc "Cần hỗ trợ thêm không?"
- Không bịa đặt dữ liệu.`;
      break;
    case "information":
      basePrompt += `- Mô tả địa điểm sinh động: Tổng quan, tham quan, đặc sản, du lịch.
- Kết hợp gợi ý chuyến bay: "Để đến ${location}, bạn có thể bay từ Tân Sơn Nhất hoặc Nội Bài."
- Kết thúc bằng: "Bạn có kế hoạch du lịch không?" hoặc "Biết thêm gì không?"`;
      break;
    case "booking":
      basePrompt += `- Hướng dẫn đặt vé: Online qua web/app, hotline.
- Đề cập thanh toán: Thẻ, ví điện tử, tiền mặt.
- Kết thúc bằng: "Bạn muốn đặt vé ngay không?"`;
      break;
    case "cancellation":
      basePrompt += `- Giải thích chính sách đổi/hủy: Thời hạn, phí, điều kiện.
- Kết thúc bằng: "Bạn cần hỗ trợ hủy vé cụ thể không?"`;
      break;
    case "luggage":
      basePrompt += `- Quy định hành lý: Xách tay (7-10kg), ký gửi (20-30kg), cấm mang.
- Kết thúc bằng: "Còn thắc mắc gì về hành lý?"`;
      break;
    case "delay":
      basePrompt += `- Chính sách bồi thường: Thời gian trễ, mức hoàn tiền.
- Kết thúc bằng: "Bạn đang gặp vấn đề trễ chuyến?"`;
      break;
    case "airline":
    case "airport":
    case "country":
    case "travel_class":
    case "blog":
    case "deal":
    case "aircraft":
    case "gate":
      basePrompt += `- Liệt kê thông tin từ dữ liệu có sẵn.
- Nếu không có: Gợi ý tìm kiếm thêm.
- Kết thúc bằng: "Bạn cần danh sách chi tiết hơn?"`;
      break;
    case "contact":
      basePrompt += `- Cung cấp hotline, email, văn phòng.
- Kết thúc bằng: "Bạn muốn liên hệ ngay?"`;
      break;
    case "working_hours":
      basePrompt += `- Giờ làm việc sân bay chính: SGN, HAN, DAD.
- Kết thúc bằng: "Còn sân bay nào bạn quan tâm?"`;
      break;
    default: // general
      basePrompt += `- Trả lời chung, hỏi thêm chi tiết nếu cần.
- Kết thúc bằng: "Mình có thể giúp gì thêm?"`;
  }

  basePrompt += `\n- CHỈ SỬ DỤNG THÔNG TIN TỪ HỆ THỐNG AIRSKY - KHÔNG TÌM KIẾM TỪ NGUỒN BÊN NGOÀI
- Nếu không có thông tin trong hệ thống: Xin lỗi và gợi ý liên hệ hotline hoặc kiểm tra lại thông tin
- Không đề cập hoặc gợi ý các nền tảng đặt vé khác (Vietjet, Vietnam Airlines website, etc.)
- Không tạo link hoặc hướng dẫn click sang website khác
- Tập trung vào việc hỗ trợ đặt vé qua hệ thống AirSky của chúng ta
- Giữ cuộc trò chuyện hấp dẫn, luôn hỏi lại để tiếp tục.`;

  return basePrompt;
}

module.exports = {
  buildPrompt,
  detectQueryType,
  buildContext,
};
