// Hàm xây dựng prompt
function buildPrompt(message, context, entities = {}) {
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
    contextText = `${context.message}\n`;
    context.data.forEach((flight, index) => {
      contextText += `${index + 1}. ${flight.flightNumber} (${
        flight.airline
      })\n`;
      contextText += `   ${flight.departure} → ${flight.arrival}\n`;
      contextText += `   Giờ: ${flight.departureTime} - ${flight.arrivalTime}\n`;
      contextText += `   Giá: ${flight.price}\n`;
      contextText += `   Ghế trống: ${flight.seats}\n`;
      contextText += `   Trạng thái: ${flight.status}\n\n`;
    });
  } else if (context.type === "airports") {
    contextText = `${context.message}\n`;
    context.data.forEach((airport) => {
      contextText += `- ${airport.name} (${airport.code}) - ${airport.city}\n`;
    });
  } else {
    contextText = context.message;
  }

  return `Bạn là trợ lý AI của AirSky, thân thiện, hữu ích. Trả lời bằng tiếng Việt tự nhiên.
THÔNG TIN: ${contextText}
CÂU HỎI: ${message}
HƯỚNG DẪN:
- Luôn trả lời bằng tiếng Việt
- Luôn có câu hỏi lại sau cùng câu trả lời
- Trả lời chuyến bay theo form mẫu: "Chuyến bay [mã chuyến] của [hãng hàng không] từ [điểm đi] đến [điểm đến], khởi hành lúc [giờ khởi hành], giá [giá], còn [số ghế] ghế trống."
- Không được tự ý sửa prompt cấu trúc câu trả lời
- Bắt đầu thân thiện: "Chào bạn!"
- Dùng dữ liệu thực tế từ context, tránh bịa đặt.
- Nếu có flights, liệt kê rõ ràng với mã, hãng, thời gian, giá (VND), ghế.
- Nếu không có, gợi ý kiểm tra tên thành phố/sân bay hoặc ngày khác.
- Hỏi thêm: "Bạn cần giúp gì nữa không?"
- Giữ ngắn gọn, trò chuyện như bạn bè.`;
}

module.exports = {
  buildPrompt,
};
