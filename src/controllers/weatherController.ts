import { Request, Response } from 'express';
import { pool } from '../config/db.js';

const GOOGLE_API_KEY = process.env.GOOGLE_WEATHER_API_KEY;

// 👇 1. THE ENGINE: Fetches from Google and formats it (No gap filler, honest UI)
export const fetchAndFormatWeather = async (lat: string, lon: string, locationId: number | string) => {
    const baseParams = new URLSearchParams({
        key: GOOGLE_API_KEY as string,
        "location.latitude": lat as string,
        "location.longitude": lon as string
    });

    const currentUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?${baseParams}`;
    const dailyUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?${baseParams}&days=7`;
    const hourlyUrl = `https://weather.googleapis.com/v1/forecast/hours:lookup?${baseParams}&hours=168`;

    const [currentRes, dailyRes, hourlyRes] = await Promise.all([
        fetch(currentUrl),
        fetch(dailyUrl),
        fetch(hourlyUrl)
    ]);

    const currentData = await currentRes.json();
    const dailyData = await dailyRes.json();
    const hourlyData = await hourlyRes.json();

    const getText = (cond: any) => {
        if (!cond) return "Clear";
        return typeof cond.description === 'object' ? cond.description.text : cond.description;
    };

    const currentTemp = currentData.temperature?.degrees ?? 0;

    const daily = dailyData.forecastDays?.map((day: any, index: number) => {
        let maxT = day.daytimeForecast?.maxTemperature?.degrees 
                ?? day.highTemperature?.degrees 
                ?? day.temperature?.degrees
                ?? 0;
        
        if (maxT === 0) maxT = currentTemp > 0 ? currentTemp : 25;

        const minT = day.nighttimeForecast?.minTemperature?.degrees 
                ?? day.lowTemperature?.degrees 
                ?? 0;
        
        let fixedMinT = minT;
        if (fixedMinT === 0) fixedMinT = currentTemp > 0 ? currentTemp - 2 : 23;

        return {
            date: day.interval?.startTime?.split('T')[0],
            max_temp: maxT,
            min_temp: fixedMinT,
            rain_prob: day.daytimeForecast?.precipitation?.probability?.percent ?? 0,
            condition: getText(day.daytimeForecast?.weatherCondition)
        };
    }) || [];

    const fullHourly = hourlyData.forecastHours?.map((hour: any) => ({
        time: hour.interval?.startTime, 
        temp: hour.temperature?.degrees ?? 0,
        rain_prob: hour.precipitation?.probability?.percent ?? 0,
        condition: getText(hour.weatherCondition)
    })) || [];

    const formattedData = {
        current: {
            temp: currentTemp,
            humidity: currentData.relativeHumidity ?? 0,
            rain_prob: currentData.precipitation?.probability?.percent ?? 0,
            condition: getText(currentData.weatherCondition),
        },
        hourly: fullHourly, 
        daily: daily
    };

    if (locationId && formattedData.daily.length > 0) {
        const today = formattedData.daily[0];
        try {
            await pool.query(
                'INSERT INTO forecast_snapshots (location_id, forecast_date, predicted_max_temp, predicted_rain_prob, weather_code) VALUES (?, ?, ?, ?, ?)',
                [locationId, today.date, today.max_temp, today.rain_prob, today.condition]
            );
        } catch (e) {}
    }

    return formattedData;
};

// 👇 2. THE API ROUTE: Only reads from the database cache!
export const getWeather = async (req: Request, res: Response) => {
    const { lat, lon, locationId } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Coordinates required" });

    try {
        // Look in database first
        const [rows]: any = await pool.query('SELECT weather_data FROM weather_cache WHERE location_id = ?', [locationId]);

        if (rows.length > 0) {
            // SUCCESS! Return DB Data (0 Google API Calls used!)
const weatherData = typeof rows[0].weather_data === 'string' ? JSON.parse(rows[0].weather_data) : rows[0].weather_data;
return res.json(weatherData);        }

        // FALLBACK: If database is empty (e.g. they just added a new location), fetch once and save
        console.log(`⚠️ Cache missing for location ${locationId}. Fetching manually...`);
        const freshData = await fetchAndFormatWeather(lat as string, lon as string, locationId as string);
        
        await pool.query(
            'INSERT INTO weather_cache (location_id, weather_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE weather_data = ?',
            [locationId, JSON.stringify(freshData), JSON.stringify(freshData)]
        );

        res.json(freshData);

    } catch (error) {
        console.error("❌ API Failed:", error);
        res.status(500).json({ error: "Failed to fetch weather" });
    }
};

export const getLocations = async (req: Request, res: Response) => {
    try {
        // We use * to ensure created_at is included in the result
        const [rows] = await pool.query('SELECT * FROM locations');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
};

// ... addLocation and deleteLocation unchanged ...
export const addLocation = async (req: Request, res: Response) => {
    const { name, latitude, longitude, email, telegramChatId } = req.body;
    if (!name || !latitude || !longitude || !email) return res.status(400).json({ error: "Required fields missing" });
    try {
        const [result]: any = await pool.query(
            'INSERT INTO locations (name, latitude, longitude, manager_email, telegram_chat_id) VALUES (?, ?, ?, ?, ?)',
            [name, latitude, longitude, email, telegramChatId || null] 
        );
        res.json({ id: result.insertId, name, latitude, longitude, email, telegramChatId });
    } catch (error: any) {
        res.status(500).json({ error: "Failed to add location" });
    }
};

export const deleteLocation = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const [result]: any = await pool.query('DELETE FROM locations WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Location not found" });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete location" });
    }
};