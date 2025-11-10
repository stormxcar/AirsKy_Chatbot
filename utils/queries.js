// utils/queries.js
// Basic query utilities for the chatbot

/**
 * Build flight search query
 * @param {Object} criteria - Search criteria
 * @returns {string} SQL query
 */
function buildFlightQuery(criteria) {
  const { departure, arrival, date } = criteria;

  let query = `
    SELECT
      flights.flight_id,
      flights.flight_number,
      flights.departure_time,
      flights.arrival_time,
      flights.base_price,
      airlines.airline_name,
      da.airport_name AS departure_airport,
      da.airport_code AS departure_code,
      aa.airport_name AS arrival_airport,
      aa.airport_code AS arrival_code
    FROM flights
    JOIN airlines ON flights.airline_id = airlines.airline_id
    JOIN airports da ON flights.departure_airport_id = da.airport_id
    JOIN airports aa ON flights.arrival_airport_id = aa.airport_id
    WHERE 1=1
  `;

  if (departure) {
    query += ` AND da.city_name LIKE '%${departure}%'`;
  }

  if (arrival) {
    query += ` AND aa.city_name LIKE '%${arrival}%'`;
  }

  if (date) {
    query += ` AND DATE(flights.departure_time) = '${date}'`;
  }

  query += ` ORDER BY flights.base_price ASC LIMIT 10`;

  return query;
}

/**
 * Search flights for chatbot - parameterized query
 */
const searchFlightsChatbot = `
  SELECT
    flights.flight_id,
    flights.flight_number,
    flights.departure_time,
    flights.arrival_time,
    flights.base_price,
    flights.trip_type,
    airlines.airline_name,
    airlines.airline_code,
    aircrafts.aircraft_name AS aircraft_name,
    da.airport_name AS departure_airport_name,
    da.airport_code AS departure_airport_code,
    da.city_name AS departure_city,
    aa.airport_name AS arrival_airport_name,
    aa.airport_code AS arrival_airport_code,
    aa.city_name AS arrival_city
  FROM flights
  JOIN airlines ON flights.airline_id = airlines.airline_id
  LEFT JOIN aircrafts ON flights.aircraft_id = aircrafts.aircraft_id
  JOIN airports da ON flights.departure_airport_id = da.airport_id
  JOIN airports aa ON flights.arrival_airport_id = aa.airport_id
  WHERE
    (da.city_name LIKE ? OR da.airport_name LIKE ? OR da.airport_code = ?)
    AND (aa.city_name LIKE ? OR aa.airport_name LIKE ? OR aa.airport_code = ?)
    AND (DATE(flights.departure_time) = ? OR ? IS NULL)
    AND (flights.trip_type = ? OR ? IS NULL)
  ORDER BY flights.base_price ASC, flights.departure_time ASC
  LIMIT 20
`;

/**
 * Search round-trip flights for chatbot - parameterized query
 */
const searchRoundTripFlights = `
  SELECT
    flights.flight_id,
    flights.flight_number,
    flights.departure_time,
    flights.arrival_time,
    flights.base_price,
    flights.trip_type,
    flights.round_trip_group_id,
    airlines.airline_name,
    airlines.airline_code,
    da.airport_name AS departure_airport_name,
    da.airport_code AS departure_airport_code,
    da.city_name AS departure_city,
    aa.airport_name AS arrival_airport_name,
    aa.airport_code AS arrival_airport_code,
    aa.city_name AS arrival_city
  FROM flights
  JOIN airlines ON flights.airline_id = airlines.airline_id
  JOIN airports da ON flights.departure_airport_id = da.airport_id
  JOIN airports aa ON flights.arrival_airport_id = aa.airport_id
  WHERE
    (
      (da.city_name LIKE ? OR da.airport_name LIKE ? OR da.airport_code = ?)
      AND (aa.city_name LIKE ? OR aa.airport_name LIKE ? OR aa.airport_code = ?)
      AND (DATE(flights.departure_time) = ? OR ? IS NULL)
    )
    OR
    (
      (da.city_name LIKE ? OR da.airport_name LIKE ? OR da.airport_code = ?)
      AND (aa.city_name LIKE ? OR aa.airport_name LIKE ? OR aa.airport_code = ?)
      AND (DATE(flights.departure_time) = ? OR ? IS NULL)
    )
    AND flights.round_trip_group_id IS NOT NULL
  ORDER BY flights.base_price ASC, flights.departure_time ASC
  LIMIT 20
`;

/**
 * Search multi-city flights with stops - parameterized query
 */
const searchMultiCityFlights = `
  SELECT
    f.flight_id,
    f.flight_number,
    f.departure_time,
    f.arrival_time,
    f.base_price,
    f.trip_type,
    al.airline_name,
    al.airline_code,
    ac.aircraft_name AS aircraft_name,
    da.airport_name AS departure_airport_name,
    da.airport_code AS departure_airport_code,
    da.city_name AS departure_city,
    aa.airport_name AS arrival_airport_name,
    aa.airport_code AS arrival_airport_code,
    aa.city_name AS arrival_city,
    GROUP_CONCAT(
        CONCAT(
            'Stop ', s.stop_order, ': ',
            sa.airport_name, ' (', sa.airport_code, ') - ',
            s.arrival_time, ' to ', s.departure_time, ' (',
            s.stop_duration, ' mins)'
        )
        ORDER BY s.stop_order
        SEPARATOR ' | '
    ) AS stops_info
  FROM
    flights f
  JOIN
    airlines al ON f.airline_id = al.airline_id
  LEFT JOIN
    aircrafts ac ON f.aircraft_id = ac.aircraft_id
  JOIN
    airports da ON f.departure_airport_id = da.airport_id
  JOIN
    airports aa ON f.arrival_airport_id = aa.airport_id
  LEFT JOIN
    stops s ON f.flight_id = s.flight_id
  LEFT JOIN
    airports sa ON s.airport_id = sa.airport_id
  WHERE
    (da.city_name LIKE ? OR da.airport_name LIKE ? OR da.airport_code = ?)
    AND (aa.city_name LIKE ? OR aa.airport_name LIKE ? OR aa.airport_code = ?)
    AND f.trip_type = 'MULTI_CITY'
    AND (? IS NULL OR EXISTS (
        SELECT 1
        FROM stops s2
        JOIN airports sa2 ON s2.airport_id = sa2.airport_id
        WHERE s2.flight_id = f.flight_id
        AND (sa2.city_name LIKE ? OR sa2.airport_name LIKE ? OR sa2.airport_code = ?)
    ))
  GROUP BY
    f.flight_id, f.flight_number, f.departure_time, f.arrival_time, f.base_price,
    f.trip_type, al.airline_name, al.airline_code,
    da.airport_name, da.airport_code, da.city_name,
    aa.airport_name, aa.airport_code, aa.city_name
  ORDER BY
    f.departure_time ASC, f.base_price ASC
  LIMIT 20
`;

module.exports = {
  buildFlightQuery,
  searchFlightsChatbot,
  searchRoundTripFlights,
  searchMultiCityFlights,
};
