# AirSky Chatbot Server 🚀

Chatbot AI thông minh cho hệ thống đặt vé máy bay AirSky, hỗ trợ tra cứu chuyến bay bằng tiếng Việt tự nhiên.

### ✨ Tính năng chính

- 🤖 **Hiểu ngôn ngữ tự nhiên**
- ✈️ **Tra cứu chuyến bay**
- 🏢 **Thông tin sân bay**
- 📅 **Xử lý ngày tháng**
- 🔍 **Tìm kiếm thông minh**
- 💬 **Trò chuyện tự nhiên**

## 🏗️ Cấu trúc thư mục

```
AirSky_Chatbot/
├── 📁 utils/                    # Các module xử lý chính
│   ├── context.js              # 🚪 Entry point chính + validation
│   ├── entityExtractor.js      # 🧠 Trích xuất entities từ message
│   ├── contextBuilder.js       # 🏗️ Xây dựng context từ DB
│   ├── promptBuilder.js        # 💬 Tạo prompt cho AI
│   ├── config.js              # ⚙️ Cấu hình constants & patterns
│   ├── logger.js              # 📝 Centralized logging
│   ├── cache.js               # 💾 Cache management
│   ├── validation.js          # ✅ Input validation
│   ├── context.test.js        # 🧪 Unit tests
│   └── README.md              # 📖 Tài liệu utils
├── 📄 server.js                # 🚀 Main server (Express + Socket.io)
├── 📄 package.json             # 📦 Dependencies & scripts
├── 📄 package-lock.json        # 🔒 Lock file
├── 📄 .env                     # 🔐 Environment variables
├── 📄 .gitignore               # 🚫 Git ignore rules
└── 📄 README.md                # 📖 Project documentation
```

## 🛠️ Công nghệ sử dụng

### Backend

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.io** - Real-time communication
- **MySQL2** - Database driver
- **Fuse.js** - Fuzzy search library

### AI & NLP

- **Mistral AI** - Entity extraction
- **Gemini AI** - Chat response generation

### Database

- **MySQL/Aiven** - Flight data storage
- **Redis** - Caching (planned)

## 🚀 Cài đặt và chạy

### Yêu cầu hệ thống

- Node.js >= 16.0.0
- MySQL database
- npm hoặc yarn

## 📊 Monitoring & Logging

### Log Format

```
❌ ERROR: Database connection failed
⚠️ WARN: Invalid date format
ℹ️ INFO: User connected: user123
🔍 DEBUG: Entity extraction result: {...}
```

### PM2

```bash
npm install -g pm2
pm2 start server.js --name airsky-chatbot
```

## 🤝 Đóng góp

1. Fork repository
2. Tạo feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Tạo Pull Request

## 📝 License

MIT License - Xem file `LICENSE` để biết thêm chi tiết.

## 📞 Liên hệ

- **Author**: StormX Car
- **Email**: contact@stormx.dev
- **GitHub**: [@stormxcar](https://github.com/stormxcar)

---

**AirSky Chatbot** - Bay cùng trí tuệ nhân tạo! ✈️🤖
