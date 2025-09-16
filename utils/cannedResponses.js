const { getLangChainSQLManager } = require("./langchainSQL");

// Global SQL Manager instance
let sqlManager = null;

// Cache cho data từ database
let airlinesCache = [];
let airportsCache = [];
let isCacheLoaded = false;

// Load data từ database using LangChain
async function loadDataFromDatabase() {
  try {
    if (isCacheLoaded) return;

    // Initialize SQL Manager if not already done
    if (!sqlManager) {
      // Import dbPool from config
      const dbConfig = require("../config/database");
      sqlManager = getLangChainSQLManager(dbConfig);
      await sqlManager.initialize();
    }

    // Load airlines using LangChain
    const airlinesQuery =
      "Get all airlines with their id, name, code, and thumbnail";
    const airlinesResult = await sqlManager.executeNaturalLanguageQuery(
      airlinesQuery,
      { userId: "system", entities: {}, message: airlinesQuery }
    );
    if (airlinesResult.success) {
      airlinesCache = airlinesResult.result.map((airline) => ({
        id: airline.airline_id,
        name: airline.airline_name,
        code: airline.airline_code,
        thumbnail: airline.thumbnail || null,
      }));
    }

    // Load airports using LangChain
    const airportsQuery =
      "Get all airports with their id, name, code, and city name";
    const airportsResult = await sqlManager.executeNaturalLanguageQuery(
      airportsQuery,
      { userId: "system", entities: {}, message: airportsQuery }
    );
    if (airportsResult.success) {
      airportsCache = airportsResult.result.map((airport) => ({
        id: airport.airport_id,
        name: airport.airport_name,
        code: airport.airport_code,
        city: airport.city_name,
      }));
    }

    isCacheLoaded = true;
    console.log(
      "📋 Loaded airlines:",
      airlinesCache.length,
      "airports:",
      airportsCache.length
    );
  } catch (error) {
    console.error("❌ Error loading data from database:", error);
  }
}

// Tạo response cho airlines
function generateAirlinesResponse() {
  console.log(
    "🔍 Generating airlines response, cache length:",
    airlinesCache.length
  );
  console.log("🔍 Airlines cache:", airlinesCache.slice(0, 3)); // Log first 3 items

  if (airlinesCache.length === 0) {
    return {
      type: "text",
      message:
        "## ✈️ Các hãng hàng không hợp tác\n\nHiện tại chưa có thông tin hãng hàng không. Vui lòng thử lại sau.",
    };
  }

  const totalAirlines = airlinesCache.length;
  const displayLimit = 10;
  const airlinesToShow = airlinesCache.slice(0, displayLimit);
  const hasMore = totalAirlines > displayLimit;

  let message = `## ✈️ Các hãng hàng không hợp tác\n\n`;
  airlinesToShow.forEach((airline, index) => {
    message += `${index + 1}. **${airline.name} (${airline.code})**\n`;
  });

  if (hasMore) {
    message += `\n*... và ${
      totalAirlines - displayLimit
    } hãng khác. Liên hệ chúng tôi để được tư vấn thêm!*`;
  } else {
    message += `\n*Liên hệ chúng tôi để được tư vấn hãng phù hợp nhất!*`;
  }

  const response = {
    type: "airlines",
    message: message,
    data: {
      airlines: airlinesToShow,
      total: totalAirlines,
      hasMore: hasMore,
    },
  };

  console.log(
    "📤 Generated airlines response:",
    JSON.stringify(response, null, 2)
  );
  return response;
}

// Tạo response cho airports
function generateAirportsResponse() {
  console.log(
    "🔍 Generating airports response, cache length:",
    airportsCache.length
  );
  console.log("🔍 Airports cache:", airportsCache.slice(0, 3)); // Log first 3 items

  if (airportsCache.length === 0) {
    return {
      type: "text",
      message:
        "## 🏢 Danh sách sân bay\n\nHiện tại chưa có thông tin sân bay. Vui lòng thử lại sau.",
    };
  }

  const totalAirports = airportsCache.length;
  const displayLimit = 10;
  const airportsToShow = airportsCache.slice(0, displayLimit);
  const hasMore = totalAirports > displayLimit;

  let message = `## 🏢 Danh sách sân bay chính\n\n`;
  airportsToShow.forEach((airport, index) => {
    message += `${index + 1}. **${airport.name} (${airport.code})** - ${
      airport.city
    }\n`;
  });

  if (hasMore) {
    message += `\n*... và ${
      totalAirports - displayLimit
    } sân bay khác. Liên hệ chúng tôi để được tư vấn thêm!*`;
  } else {
    message += `\n*Liên hệ chúng tôi để được tư vấn về các sân bay!*`;
  }

  const response = {
    type: "airports",
    message: message,
    data: {
      airports: airportsToShow,
      total: totalAirports,
      hasMore: hasMore,
    },
  };

  console.log(
    "📤 Generated airports response:",
    JSON.stringify(response, null, 2)
  );
  return response;
}

const cannedResponses = [
  {
    keywords: ["giờ làm việc", "giờ mở cửa", "thời gian hoạt động", "giờ bay"],
    response: {
      type: "text",
      message: `## 🕐 Giờ làm việc của các sân bay chính

**Sân bay Quốc tế Tân Sơn Nhất (SGN):**
- Giờ mở cửa: 24/7
- Counter check-in: 02:00 - 22:00
- Giờ bay cuối: 23:00

**Sân bay Quốc tế Nội Bài (HAN):**
- Giờ mở cửa: 24/7
- Counter check-in: 02:00 - 21:00
- Giờ bay cuối: 22:00

**Sân bay Quốc tế Đà Nẵng (DAD):**
- Giờ mở cửa: 24/7
- Counter check-in: 03:00 - 20:00
- Giờ bay cuối: 21:00

*Lưu ý: Giờ làm việc có thể thay đổi theo mùa vụ và tình hình thực tế.*`,
    },
  },
  {
    keywords: ["đổi vé", "thay đổi vé", "chỉnh sửa vé", "hủy vé", "chính sách"],
    response: {
      type: "text",
      message: `## 🎫 Chính sách đổi/trả vé máy bay

**Thời hạn đổi vé:**
- Vé nội địa: Đổi được trong vòng 4 tiếng sau đặt vé
- Vé quốc tế: Đổi được trong vòng 24-48 tiếng sau đặt vé

**Phí đổi vé:**
- Nội địa: 200.000 - 500.000 VND (tùy hãng)
- Quốc tế: 500.000 - 2.000.000 VND (tùy hãng)

**Điều kiện đổi vé:**
- Vé chưa sử dụng
- Còn hạn sử dụng
- Không quá 24h trước giờ bay

**Lưu ý:** Chính sách có thể khác nhau tùy theo hãng hàng không. Vui lòng liên hệ hotline để được tư vấn cụ thể.`,
    },
  },
  {
    keywords: ["đặt vé", "mua vé", "book vé", "đặt chỗ", "reservation"],
    response: {
      type: "text",
      message: `## 🛒 Hướng dẫn đặt vé máy bay

**Các cách đặt vé:**

1. **Đặt online qua website AirsKy:**
   - Truy cập: www.airsky.vn
   - Chọn điểm đi → điểm đến → ngày bay
   - Điền thông tin hành khách
   - Thanh toán online

2. **Đặt qua App mobile:**
   - Tải app AirsKy trên App Store/Google Play
   - Đăng ký tài khoản
   - Đặt vé mọi lúc mọi nơi

3. **Đặt qua hotline:**
   - Gọi: 1900 XXX XXX
   - Tư vấn viên hỗ trợ 24/7

**Lưu ý:** Đặt vé trước 7-10 ngày để có giá tốt nhất!`,
    },
  },
  {
    keywords: ["hành lý", "kiện", "valet", "cân nặng", "quá khổ"],
    response: {
      type: "text",
      message: `## 🧳 Quy định hành lý

**Hành lý xách tay:**
- Kích thước: 56cm x 36cm x 23cm
- Cân nặng: 7kg (nội địa), 10kg (quốc tế)
- Số lượng: 1 kiện/người

**Hành lý ký gửi:**
- Nội địa: 20kg miễn phí
- Quốc tế: 20-30kg miễn phí (tùy hãng)
- Phụ phí hành lý quá cân: 50.000 - 200.000 VND/kg

**Vật phẩm cấm mang theo:**
- Chất lỏng > 100ml
- Vũ khí, chất nổ
- Đồ dễ cháy

*Lưu ý: Quy định có thể khác nhau tùy hãng hàng không.*`,
    },
  },
  {
    keywords: [
      "trễ chuyến",
      "delay",
      "hoãn chuyến",
      "bồi thường",
      "compensation",
    ],
    response: {
      type: "text",
      message: `## ⏰ Chính sách trễ chuyến

**Mức bồi thường theo thời gian trễ:**

- **Trễ 1-2 tiếng:** Miễn phí nước uống, snack
- **Trễ 2-4 tiếng:** Miễn phí bữa ăn
- **Trễ 4-6 tiếng:** Hoàn tiền 30-50%
- **Trễ >6 tiếng:** Hoàn tiền 100% + vé chuyến sau

**Điều kiện nhận bồi thường:**
- Trễ chuyến do lỗi của hãng
- Có xác nhận trễ chuyến
- Trong vòng 30 ngày sau chuyến bay

**Cách nhận bồi thường:**
- Liên hệ hãng hàng không
- Cung cấp vé + boarding pass
- Thời gian xử lý: 7-30 ngày

*Lưu ý: Chính sách khác nhau tùy hãng.*`,
    },
  },
  {
    keywords: ["trẻ em", "em bé", "infant", "child", "baby"],
    response: {
      type: "text",
      message: `## 👶 Chính sách trẻ em & em bé

**Phân loại theo độ tuổi:**

- **Em bé (<2 tuổi):** Không có ghế ngồi riêng
- **Trẻ em (2-11 tuổi):** Có ghế ngồi riêng, giá vé 75% người lớn
- **Thiếu niên (12-17 tuổi):** Giá vé 100% người lớn

**Điều kiện mang theo em bé:**
- 1 người lớn chỉ mang theo 1 em bé
- Em bé phải ngồi trên đùi người lớn
- Có giấy khai sinh hoặc hộ chiếu

**Phí dịch vụ:**
- Vé em bé: 10% giá vé người lớn
- Ghế ngồi riêng cho em bé: Phụ thu thêm

*Lưu ý: Quy định có thể khác nhau tùy hãng và đường bay.*`,
    },
  },
  {
    keywords: [
      "hãng hàng không",
      "airline",
      "vietnam airlines",
      "vietjet",
      "bamboo",
    ],
    response: "dynamic", // Sẽ được thay thế bằng generateAirlinesResponse()
    generator: generateAirlinesResponse,
  },
  {
    keywords: ["sân bay", "airport", "danh sách sân bay", "các sân bay"],
    response: "dynamic", // Sẽ được thay thế bằng generateAirportsResponse()
    generator: generateAirportsResponse,
  },
  {
    keywords: ["liên hệ", "hotline", "phone", "điện thoại", "support"],
    response: {
      type: "text",
      message: `## 📞 Thông tin liên hệ AirsKy

**Hotline đặt vé:**
- 📱 1900 XXX XXX (24/7)
- ☎️ 028 XXX XXXX (TP.HCM)
- ☎️ 024 XXX XXXX (Hà Nội)

**Email hỗ trợ:**
- ✉️ support@airsky.vn
- ✉️ booking@airsky.vn

**Văn phòng:**
- **TP.HCM:** 123 Đường ABC, Quận 1
- **Hà Nội:** 456 Đường XYZ, Quận Hai Bà Trưng

**Thời gian phục vụ:**
- 🕐 24/7 qua hotline
- 🕐 08:00 - 22:00 tại văn phòng

*Chúng tôi luôn sẵn sàng hỗ trợ bạn!*`,
    },
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
    response: {
      type: "text",
      message: `## 💳 Phương thức thanh toán

**Thanh toán online:**
- ✅ Thẻ tín dụng/ghi nợ (Visa, Mastercard, JCB)
- ✅ Ví điện tử (MoMo, ZaloPay, ViettelPay)
- ✅ Internet Banking
- ✅ QR Code

**Thanh toán tại quầy:**
- ✅ Tiền mặt
- ✅ Thẻ tín dụng
- ✅ Chuyển khoản

**Thanh toán tại sân bay:**
- ✅ Tiền mặt
- ✅ Thẻ tín dụng
- ✅ Ví điện tử

**Lưu ý:**
- Thanh toán online an toàn 100%
- Xác nhận thanh toán ngay lập tức
- Hỗ trợ nhiều ngôn ngữ

*Thanh toán dễ dàng, nhanh chóng với AirsKy!*`,
    },
  },
];

// Hàm kiểm tra xem message có match với canned response nào không
async function findCannedResponse(message, dbPool) {
  if (!message) return null;

  const lowerMessage = message.toLowerCase().trim();

  for (const item of cannedResponses) {
    // Kiểm tra xem message có chứa bất kỳ keyword nào không
    const hasMatch = item.keywords.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    );

    if (hasMatch) {
      console.log("🎯 Found canned response match for:", message);
      console.log("🎯 Response type:", item.response);

      // Nếu là dynamic response, gọi generator function
      if (item.response === "dynamic" && item.generator) {
        console.log("🔄 Calling generator function:", item.generator.name);
        // Load data từ database nếu chưa load
        if (dbPool && !isCacheLoaded) {
          console.log("📥 Loading data from database...");
          await loadDataFromDatabase(dbPool);
        }
        const result = item.generator();
        console.log("📤 Generator result:", JSON.stringify(result, null, 2));
        return result;
      }

      // Trả về response tĩnh
      console.log(
        "📤 Static response:",
        JSON.stringify(item.response, null, 2)
      );
      return item.response;
    }
  }

  return null; // Không tìm thấy canned response phù hợp
}

module.exports = {
  cannedResponses,
  findCannedResponse,
  loadDataFromDatabase,
};
