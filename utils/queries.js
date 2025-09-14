// Database queries for chatbot
const queries = {
  // Tìm kiếm sân bay theo từ khóa (tên sân bay, tên thành phố, mã sân bay)
  searchAirports: `
    SELECT DISTINCT
      airport_id,
      airport_name,
      airport_code,
      city_name
    FROM airports
    WHERE is_deleted = false
    AND (
      LOWER(airport_name) LIKE LOWER(?)
      OR LOWER(city_name) LIKE LOWER(?)
      OR LOWER(airport_code) LIKE LOWER(?)
    )
    ORDER BY
      CASE
        WHEN LOWER(airport_name) LIKE LOWER(?) THEN 1
        WHEN LOWER(city_name) LIKE LOWER(?) THEN 2
        WHEN LOWER(airport_code) = LOWER(?) THEN 3
        ELSE 4
      END
    LIMIT 10
  `,

  // Lấy danh sách sân bay cho context
  getAirportsList: `
    SELECT
      airport_name,
      airport_code,
      city_name
    FROM airports
    WHERE is_deleted = false
    ORDER BY city_name
    LIMIT 20
  `,

  // Query tối ưu cho chatbot - bao gồm tên và mã sân bay (enhanced version)
  searchFlightsChatbot: `
    SELECT
      f.flight_id,
      f.flight_number,
      f.departure_time,
      f.arrival_time,
      f.base_price,
      f.trip_type,
      da.airport_name as departure_airport_name,
      da.airport_code as departure_airport_code,
      da.city_name as departure_city_name,
      aa.airport_name as arrival_airport_name,
      aa.airport_code as arrival_airport_code,
      aa.city_name as arrival_city_name,
      al.airline_name
    FROM flights f
    LEFT JOIN airports da ON f.departure_airport_id = da.airport_id
    LEFT JOIN airports aa ON f.arrival_airport_id = aa.airport_id
    LEFT JOIN airlines al ON f.airline_id = al.airline_id
    WHERE f.status IN ('ON_TIME', 'DELAYED', 'SCHEDULED')
    AND (? IS NULL OR LOWER(da.city_name) LIKE LOWER(?) OR LOWER(da.airport_name) LIKE LOWER(?) OR LOWER(da.airport_code) = LOWER(?))
    AND (? IS NULL OR LOWER(aa.city_name) LIKE LOWER(?) OR LOWER(aa.airport_name) LIKE LOWER(?) OR LOWER(aa.airport_code) = LOWER(?))
    AND (? IS NULL OR DATE(f.departure_time) = ?)
    ORDER BY f.departure_time ASC
    LIMIT 50
  `,

  // Lấy danh sách airlines cho canned responses
  getAirlinesList: `
    SELECT
      airline_id,
      airline_name,
      airline_code
    FROM airlines
    WHERE is_active = true
    ORDER BY airline_name ASC
  `,

  // Lấy danh sách airports cho canned responses
  getAirportsList: `
    SELECT
      airport_id,
      airport_name,
      airport_code,
      city_name
    FROM airports
    WHERE is_deleted = false
    ORDER BY city_name ASC
  `,

  // Debug: Kiểm tra dữ liệu trong database
  debug: {
    countAirports:
      "SELECT COUNT(*) as total FROM airports WHERE is_deleted = false",
    countFlights:
      "SELECT COUNT(*) as total FROM flights WHERE status = 'active'",
    sampleAirports:
      "SELECT airport_name, city_name FROM airports WHERE is_deleted = false LIMIT 5",
    sampleFlights:
      "SELECT flight_number, departure_time FROM flights WHERE status = 'active' LIMIT 3",
  },
};

module.exports = queries;
