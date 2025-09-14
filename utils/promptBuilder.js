// Hàm xây dựng prompt
function buildPrompt(message, context, entities = {}) {
  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;

  if (context.type === "text") {
    const dateStr = entities.date
      ? new Date(entities.date).toLocaleDateString("vi-VN")
      : "đó";
    return `Bạn là trợ lý AI của AirSky. Người dùng hỏi: "${message}"

Thông tin hiện có: ${context.message}

Hãy trả lời trực tiếp bằng tiếng Việt, bắt đầu bằng "Chào bạn!", giải thích rằng để tìm chuyến bay cần biết thành phố đi và đến, và hỏi cụ thể: "Bạn muốn bay từ thành phố nào đến thành phố nào vào ngày ${dateStr}?" Luôn có câu hỏi lại sau câu trả lời.`;
  }

  let contextText = "";

  if (context.type === "flights") {
    contextText = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
    contextText += `**Tuyến bay:** ${departureCity || "N/A"} → ${
      arrivalCity || "N/A"
    }\n`;
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
    contextText = `${context.message}\n`;
    context.data.forEach((airport) => {
      contextText += `- ${airport.name} (${airport.code}) - ${airport.city}\n`;
    });
  } else {
    contextText = context.message;
  }

  return `Bạn là trợ lý AI của AirSky, chuyên về đặt vé máy bay. Trả lời bằng tiếng Việt tự nhiên, thân thiện.

THÔNG TIN CHUYẾN BAY: ${contextText}

CÂU HỎI CỦA KHÁCH: ${message}

HƯỚNG DẪN TRẢ LỜI:
- Luôn bắt đầu bằng "Chào bạn!" hoặc "Xin chào!"
- Sử dụng format Markdown cho chuyến bay (giống như thông tin cung cấp)
- Nếu có chuyến bay: Liệt kê với đầy đủ thông tin sân bay (tên sân bay - mã sân bay)
- Format: "**Chuyến bay [mã]** của **[hãng]** từ **[thành phố]** (**[tên sân bay]** - **[mã]**) đến **[thành phố]** (**[tên sân bay]** - **[mã]**), khởi hành **[giờ]**, giá **[giá]** VND, còn **[ghế]** ghế."
- Nếu không có: Gợi ý kiểm tra tên thành phố khác hoặc ngày khác
- Luôn hỏi thêm: "Bạn cần hỗ trợ gì thêm không?" hoặc "Bạn muốn đặt vé chuyến bay nào?"
- Giữ cuộc trò chuyện tự nhiên, như bạn bè
- Sử dụng dữ liệu thực tế, không bịa đặt thông tin`;
}

module.exports = {
  buildPrompt,
};
