const { getLangChainSQLManager } = require("./langchainSQL");

// Configuration for each entity type
const entityConfig = {
  airlines: {
    query: `
      SELECT airline_id, airline_name, airline_code
      FROM airlines
      WHERE is_active = 1 AND is_deleted = 0
      ORDER BY airline_name
    `,
    title: "✈️ Danh sách hãng hàng không",
    formatItem: (item, index) =>
      `${index + 1}. **${item.airline_name}** (${item.airline_code})\n`,
    summary: (total) => `*Tổng cộng ${total} hãng hàng không.*`,
  },
  airports: {
    query: `
      SELECT a.airport_id, a.airport_name, a.airport_code, a.city_name, c.country_name
      FROM airports a
      LEFT JOIN countries c ON a.country_id = c.country_id
      WHERE a.is_active = 1 AND a.is_deleted = 0
      ORDER BY a.city_name, a.airport_name
    `,
    title: "🏢 Danh sách sân bay",
    formatItem: (item, index) =>
      `${index + 1}. **${item.airport_name}** (${item.airport_code}) - ${
        item.city_name
      }\n`,
    summary: (total) => `*Tổng cộng ${total} sân bay.*`,
  },
  countries: {
    query: `
      SELECT country_id, country_name, country_code
      FROM countries
      WHERE is_active = 1 AND is_deleted = 0
      ORDER BY country_name
    `,
    title: "🌍 Danh sách quốc gia",
    formatItem: (item, index) =>
      `${index + 1}. **${item.country_name}** (${item.country_code})\n`,
    summary: (total) => `*Tổng cộng ${total} quốc gia.*`,
  },
  travel_classes: {
    query: `
      SELECT class_id, class_name, benefits, price_multiplier
      FROM travel_classes
      ORDER BY price_multiplier
    `,
    title: "🎫 Danh sách hạng vé",
    formatItem: (item, index) =>
      `${index + 1}. **${item.class_name}**\n   💰 Hệ số giá: ${
        item.price_multiplier
      }x\n   ✅ Lợi ích: ${item.benefits}\n\n`,
  },
  blogs: {
    query: `
      SELECT blog_id, title, excerpt, published_date, view_count, like_count
      FROM blogs
      WHERE is_published = 1
      ORDER BY published_date DESC
    `,
    title: "📝 Cẩm nang du lịch & tin tức",
    formatItem: (item, index) =>
      `${index + 1}. **${item.title}**\n   📅 ${new Date(
        item.published_date
      ).toLocaleDateString("vi-VN")}\n   👁️ ${
        item.view_count
      } lượt xem\n   👍 ${item.like_count} lượt thích\n\n`,
  },
  deals: {
    query: `
      SELECT deal_id, title, deal_code, discount_percentage, valid_from, valid_to
      FROM deals
      WHERE is_active = 1 AND valid_to >= NOW()
      ORDER BY valid_from DESC
    `,
    title: "🔥 Khuyến mãi & ưu đãi",
    formatItem: (item, index) =>
      `${index + 1}. **${item.title}**\n   💰 Giảm: ${
        item.discount_percentage
      }%\n   📅 Đến: ${new Date(item.valid_to).toLocaleDateString(
        "vi-VN"
      )}\n\n`,
  },
  aircrafts: {
    query: `
      SELECT aircraft_id, aircraft_name, aircraft_code, total_seats
      FROM aircrafts
      WHERE is_active = 1 AND is_deleted = 0
      ORDER BY aircraft_name
    `,
    title: "✈️ Danh sách máy bay",
    formatItem: (item, index) =>
      `${index + 1}. **${item.aircraft_name}** (${
        item.aircraft_code
      })\n   💺 Số ghế: ${item.total_seats}\n\n`,
    summary: (total) => `*Tổng cộng ${total} máy bay.*`,
  },
  gates: {
    query: `
      SELECT g.gate_id, g.gate_name, g.terminal, a.airport_name, a.city_name
      FROM gates g
      JOIN airports a ON g.airport_id = a.airport_id
      WHERE g.is_active = 1 AND g.is_deleted = 0
      ORDER BY a.city_name, g.gate_name
    `,
    title: "🚪 Danh sách cửa ra máy bay",
    formatItem: (item, index) =>
      `${index + 1}. **${item.gate_name}**\n   🏢 Terminal: ${
        item.terminal || "N/A"
      }\n   🏙️ ${item.city_name} - ${item.airport_name}\n\n`,
  },
};

// Generic query function for all entities
async function queryEntity(dbPool, entityType) {
  const config = entityConfig[entityType];
  if (!config) {
    return { type: "text", message: "Không hỗ trợ loại dữ liệu này." };
  }

  try {
    const [rows] = await dbPool.execute(config.query);

    return {
      type: entityType,
      message: `## ${config.title}\n\nDưới đây là danh sách ${entityType} có sẵn:`,
      data: { [entityType]: rows, total: rows.length },
    };
  } catch (error) {
    console.error(`❌ Error querying ${entityType}:`, error);
    return {
      type: "text",
      message: `Xin lỗi, không thể tải danh sách ${entityType} lúc này.`,
    };
  }
}

// Static canned responses
const staticResponses = {
  working_hours: {
    type: "text",
    message: `## 🕐 Giờ làm việc của các sân bay chính
- **Sân bay Quốc tế Tân Sơn Nhất (SGN):** 24/7, check-in: 02:00-22:00, chuyến cuối: 23:00
- **Sân bay Quốc tế Nội Bài (HAN):** 24/7, check-in: 02:00-21:00, chuyến cuối: 22:00
- **Sân bay Quốc tế Đà Nẵng (DAD):** 24/7, check-in: 03:00-20:00, chuyến cuối: 21:00
*Lưu ý: Giờ làm việc có thể thay đổi theo mùa vụ.*`,
  },
  ticket_change: {
    type: "text",
    message: `## 🎫 Chính sách đổi/trả vé
- **Thời hạn:** Nội địa (4h sau đặt), quốc tế (24-48h sau đặt)
- **Phí đổi vé:** Nội địa (200.000-500.000 VND), quốc tế (500.000-2.000.000 VND)
- **Điều kiện:** Vé chưa sử dụng, còn hạn, không quá 24h trước bay
*Lưu ý: Chính sách khác nhau tùy hãng.*`,
  },
  booking: {
    type: "text",
    message: `## 🛒 Hướng dẫn đặt vé
1. **Online:** www.airsky.vn, chọn điểm đi/đến, thanh toán
2. **App:** Tải AirsKy trên App Store/Google Play
3. **Hotline:** 1900 XXX XXX (24/7)
*Lưu ý: Đặt trước 7-10 ngày để có giá tốt!*`,
  },
  luggage: {
    type: "text",
    message: `## 🧳 Quy định hành lý
- **Xách tay:** 7kg (nội địa), 10kg (quốc tế), 56x36x23cm
- **Ký gửi:** 20kg (nội địa), 20-30kg (quốc tế), phí quá cân: 50.000-200.000 VND/kg
- **Cấm mang:** Chất lỏng >100ml, vũ khí, đồ dễ cháy
*Lưu ý: Quy định khác nhau tùy hãng.*`,
  },
  delay: {
    type: "text",
    message: `## ⏰ Chính sách trễ chuyến
- **1-2h:** Nước, snack miễn phí
- **2-4h:** Bữa ăn miễn phí
- **4-6h:** Hoàn 30-50%
- **>6h:** Hoàn 100% + vé chuyến sau
- **Điều kiện:** Lỗi của hãng, xác nhận trễ, trong 30 ngày
*Liên hệ hãng để nhận bồi thường.*`,
  },
  payment: {
    type: "text",
    message: `## 💳 Phương thức thanh toán
- **Online:** Thẻ (Visa, Mastercard, JCB), ví (MoMo, ZaloPay), Internet Banking, QR
- **Quầy:** Tiền mặt, thẻ, chuyển khoản
- **Sân bay:** Tiền mặt, thẻ, ví
*Lưu ý: Thanh toán online an toàn, xác nhận ngay!*`,
  },
  refund: {
    type: "text",
    message: `## 💰 Chính sách hoàn tiền
- **Điều kiện:** Hủy chuyến do hãng, trễ >6h
- **Thời gian:** Online (7-14 ngày), quầy (24-48h), sân bay (ngay)
- **Phương thức:** Thẻ (3-5 ngày), chuyển khoản (7-10 ngày), tiền mặt
*Liên hệ hotline để hỗ trợ nhanh.*`,
  },
  contact: {
    type: "text",
    message: `## 📞 Liên hệ AirsKy
- **Hotline:** 1900 XXX XXX (24/7)
- **Email:** support@airsky.vn, booking@airsky.vn
- **Văn phòng:** TP.HCM (123 ABC, Q1), Hà Nội (456 XYZ, Hai Bà Trưng)
- **Thời gian:** 24/7 (hotline), 08:00-22:00 (văn phòng)`,
  },
};

// Canned responses with keywords
const cannedResponses = [
  {
    keywords: ["giờ làm việc", "giờ mở cửa", "thời gian hoạt động", "giờ bay"],
    response: staticResponses.working_hours,
  },
  {
    keywords: ["đổi vé", "thay đổi vé", "chỉnh sửa vé", "hủy vé", "chính sách"],
    response: staticResponses.ticket_change,
  },
  {
    keywords: ["đặt vé", "mua vé", "book vé", "đặt chỗ", "reservation"],
    response: staticResponses.booking,
  },
  {
    keywords: ["hành lý", "kiện", "valet", "cân nặng", "quá khổ"],
    response: staticResponses.luggage,
  },
  {
    keywords: [
      "trễ chuyến",
      "delay",
      "hoãn chuyến",
      "bồi thường",
      "compensation",
    ],
    response: staticResponses.delay,
  },
  {
    keywords: [
      "thanh toán",
      "payment",
      "pay",
      "thẻ tín dụng",
      "momo",
      "zalopay",
    ],
    response: staticResponses.payment,
  },
  {
    keywords: ["hoàn tiền", "refund", "trả tiền", "hoàn lại"],
    response: staticResponses.refund,
  },
  {
    keywords: [
      "hãng hàng không",
      "airline",
      "vietnam airlines",
      "vietjet",
      "bamboo",
    ],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "airlines"),
  },
  {
    keywords: ["sân bay", "airport", "danh sách sân bay", "các sân bay"],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "airports"),
  },
  {
    keywords: [
      "quốc gia",
      "countries",
      "điểm đến quốc tế",
      "du lịch nước ngoài",
    ],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "countries"),
  },
  {
    keywords: [
      "hạng vé",
      "travel class",
      "economy",
      "business",
      "first class",
      "phổ thông",
      "thương gia",
    ],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "travel_classes"),
  },
  {
    keywords: [
      "blog",
      "tin tức",
      "bài viết",
      "cẩm nang",
      "hướng dẫn",
      "kinh nghiệm",
    ],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "blogs"),
  },
  {
    keywords: ["khuyến mãi", "deals", "giảm giá", "ưu đãi", "sale", "discount"],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "deals"),
  },
  {
    keywords: ["máy bay", "aircraft", "phi cơ", "loại máy bay"],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "aircrafts"),
  },
  {
    keywords: ["cửa ra máy bay", "gate", "cửa khởi hành", "boarding gate"],
    response: "dynamic",
    generator: (dbPool) => queryEntity(dbPool, "gates"),
  },
];

// Find matching canned response
async function findCannedResponse(message, dbPool) {
  if (!message) return null;

  const lowerMessage = message.toLowerCase().trim();
  const match = cannedResponses.find((item) =>
    item.keywords.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    )
  );

  if (!match) return null;

  console.log("🎯 Found canned response match for:", message);
  if (match.response === "dynamic" && match.generator) {
    if (!dbPool) {
      console.error("❌ No dbPool available for dynamic response");
      return {
        type: "text",
        message: "Xin lỗi, không thể tải dữ liệu lúc này.",
      };
    }
    const result = await match.generator(dbPool);
    console.log("📤 Generator result:", JSON.stringify(result, null, 2));
    return result;
  }

  console.log("📤 Static response:", JSON.stringify(match.response, null, 2));
  return match.response;
}

module.exports = { cannedResponses, findCannedResponse, queryEntity };
