const queries = require("./queries");
const config = require("./config");
const { extractDate, extractCities } = require("./entityExtractor");

// Hàm xây dựng context
async function buildSmartContext(userId, message, dbPool, entities) {
  const lowerMessage = message.toLowerCase();
  console.log("Building context for message:", message);
  console.log("Entities from Mistral:", entities);

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;
  const extractedDate = entities.date || extractDate(message);

  console.log(
    "🔍 Before extractCities - departure:",
    departureCity,
    "arrival:",
    arrivalCity
  );

  const cities = await extractCities(message, dbPool, entities);
  console.log("🔍 Cities from extractCities:", cities);

  const searchInfo = {
    departureCity: departureCity || cities[0] || null,
    arrivalCity: arrivalCity || cities[1] || cities[0] || null,
    date: extractedDate,
  };

  console.log("🔍 Final search info:", searchInfo);

  // Danh sách tỉnh không có sân bay
  const noAirportCities = config.NO_AIRPORT_CITIES;
  const noAirportSuggestions = config.NO_AIRPORT_SUGGESTIONS;

  if (searchInfo.date || searchInfo.departureCity || searchInfo.arrivalCity) {
    // Kiểm tra tỉnh không có sân bay (chỉ khi có city được chỉ định)
    if (searchInfo.departureCity || searchInfo.arrivalCity) {
      const hasNoAirport =
        noAirportCities.includes(searchInfo.departureCity?.toLowerCase()) ||
        noAirportCities.includes(searchInfo.arrivalCity?.toLowerCase());
      if (hasNoAirport) {
        const city = noAirportCities.includes(
          searchInfo.departureCity?.toLowerCase()
        )
          ? searchInfo.departureCity
          : searchInfo.arrivalCity;
        return {
          type: "flights",
          message: `Không tìm thấy chuyến bay đến/đi từ ${city}. ${
            noAirportSuggestions[city.toLowerCase()] || "Thử sân bay gần nhất."
          }`,
          data: [],
        };
      }
    }

    try {
      const queryParams = [
        searchInfo.departureCity || null,
        searchInfo.departureCity ? `%${searchInfo.departureCity}%` : null,
        searchInfo.departureCity ? `%${searchInfo.departureCity}%` : null,
        searchInfo.departureCity || null,
        searchInfo.arrivalCity || null,
        searchInfo.arrivalCity ? `%${searchInfo.arrivalCity}%` : null,
        searchInfo.arrivalCity ? `%${searchInfo.arrivalCity}%` : null,
        searchInfo.arrivalCity || null,
        searchInfo.date || null,
        searchInfo.date || null,
      ];

      console.log("📝 Query params:", queryParams);

      const [rows] = await dbPool.execute(queries.searchFlights, queryParams);
      console.log("✈️ Flights found:", rows.length, "items");

      const flights = rows.map((flight) => ({
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "Unknown Airline",
        departure: flight.departure_city_name || "N/A",
        arrival: flight.arrival_city_name || "N/A",
        departureTime: flight.departure_time
          ? new Date(flight.departure_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        arrivalTime: flight.arrival_time
          ? new Date(flight.arrival_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        duration: flight.duration
          ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m`
          : "N/A",
        price: flight.base_price
          ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
          : "N/A",
        seats:
          flight.available_seats != null
            ? flight.available_seats.toString()
            : "N/A",
        status: flight.status || "ON_TIME",
        date: flight.departure_time
          ? new Date(flight.departure_time).toLocaleDateString("vi-VN")
          : "N/A",
      }));

      return {
        type: "flights",
        message:
          flights.length > 0
            ? searchInfo.departureCity || searchInfo.arrivalCity
              ? "CÁC CHUYẾN BAY PHÙ HỢP:"
              : `CÁC CHUYẾN BAY VÀO NGÀY ${
                  searchInfo.date
                    ? new Date(searchInfo.date).toLocaleDateString("vi-VN")
                    : "được chọn"
                }:`
            : "Không tìm thấy chuyến bay phù hợp.",
        data: flights,
      };
    } catch (error) {
      console.error("❌ Error fetching flights:", error.message);
      return {
        type: "flights",
        message: "Không thể tìm kiếm chuyến bay. Vui lòng thử lại sau.",
        data: [],
      };
    }
  } else if (
    lowerMessage.includes("sân bay") ||
    lowerMessage.includes("airport")
  ) {
    try {
      console.log("📋 Fetching airports list...");
      const [rows] = await dbPool.execute(queries.getAirportsList);
      console.log("📋 Airports found:", rows.length, "items");

      const airports = rows.map((airport) => ({
        name: airport.airport_name || "N/A",
        code: airport.airport_code || "N/A",
        city: airport.city_name || "N/A",
      }));

      return {
        type: "airports",
        message: "DANH SÁCH SÂN BAY:",
        data: airports,
      };
    } catch (error) {
      console.error("❌ Error fetching airports:", error.message);
      return {
        type: "airports",
        message: "Không thể tải dữ liệu sân bay.",
        data: [],
      };
    }
  }

  return {
    type: "text",
    message: "Vui lòng cung cấp thông tin thành phố hoặc sân bay để tìm kiếm.",
    data: [],
  };
}

module.exports = {
  buildSmartContext,
};
