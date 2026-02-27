import { CronJob } from 'cron';
import { sendSmtpUpdate } from './smtpService.js';
import { pool } from '../config/db.js';
import { fetchAndFormatWeather } from '../controllers/weatherController.js';
import { io } from '../index.js';

// Define interfaces to stop the 'any' errors
interface HourlyForecast {
    time: string;
    temp: number;
    rain_prob: number;
    condition: string;
}

interface WeatherData {
    current: {
        temp: number;
        humidity: number;
        rain_prob: number;
        condition: string;
    };
    hourly: HourlyForecast[];
    daily: any[];
}

export const startScheduler = () => {
    console.log("⏳ Weather & Email Scheduler Initialized (Asia/Colombo time)...");
    const timeZone = "Asia/Colombo";

    // ==================================================
    // 📧 EMAIL SCHEDULER (Unchanged)
    // ==================================================
    new CronJob('0 8 * * *', () => sendSmtpUpdate(), null, true, timeZone);
    new CronJob('0 10 * * *', () => sendSmtpUpdate(), null, true, timeZone);
    new CronJob('0 12 * * *', () => sendSmtpUpdate(), null, true, timeZone);
    new CronJob('0 15 * * *', () => sendSmtpUpdate(), null, true, timeZone);
    new CronJob('20 18 * * *', () => sendSmtpUpdate(), null, true, timeZone);

    // ==================================================
    // 1. WEATHER SYNC & RAIN ALERTS (EVERY 15 MINS)
    // ==================================================
   new CronJob('*/15 * * * *', async () => {
        const timestamp = new Date().toLocaleString('en-US', { timeZone });
        console.log(`\n[${timestamp}] 📡 STARTING 15-MINUTE WEATHER FETCH...`);

        try {
            const [locations]: any = await pool.query('SELECT * FROM locations');
            console.log(`   📍 Found ${locations.length} locations to process.`);

            for (const loc of locations) {
                console.log(`   --- Fetching for: ${loc.name} ---`);
                
                // This is where the API call happens
                const weatherData: any = await fetchAndFormatWeather(loc.latitude, loc.longitude, loc.id);
                
                // 📝 CONSOLE LOG THE DATA
                console.log(`   ✅ Data Received for ${loc.name}:`);
                console.log(`      🌡️ Temp: ${weatherData.current?.temp}°C`);
                console.log(`      💧 Rain Chance: ${weatherData.current?.rain_prob}%`);
                console.log(`      ☁️  Condition: ${weatherData.current?.condition}`);
                console.log(`      📊 Hourly Points: ${weatherData.hourly?.length} items fetched.`);

                const now = new Date();
                const futureHours = weatherData.hourly?.filter((h: any) => new Date(h.time) > now) || [];
                const rainRisk = futureHours.slice(0, 2).find((h: any) => h.rain_prob > 15);

                if (rainRisk) {
                    const tLabel = new Date(rainRisk.time).toLocaleTimeString([], { hour: 'numeric', hour12: true });
                    console.log(`   🚨 ALERT TRIGGERED: ${rainRisk.rain_prob}% rain at ${tLabel}`);
                    
                    io.emit('weather_alert', { 
                        title: `🌧️ Rain Alert: ${loc.name}`, 
                        body: `High chance of rain (${rainRisk.rain_prob}%) expected around ${tLabel}.` 
                    });
                } else {
                    console.log(`   🟢 No immediate rain risk (>15%) for ${loc.name}.`);
                }
            }
            console.log(`[${timestamp}] 🏁 15-minute Sync Cycle Complete.\n`);
            
        } catch (e) { 
            console.error(`❌ [${timestamp}] 15min Sync/Alert Error:`, e); 
        }
    }, null, true, timeZone);

    // ==================================================
    // 2. HOURLY STATUS REPORT (Next 6 Hours)
    // ==================================================
    new CronJob('0 * * * *', async () => {
        try {
            const [rows]: any = await pool.query(`
                SELECT l.name, c.weather_data FROM locations l
                JOIN weather_cache c ON l.id = c.location_id
            `);
            const now = new Date();

            for (const row of rows) {
                // FIX: Check if it's already an object, if not, parse it
                const data = typeof row.weather_data === 'string' ? JSON.parse(row.weather_data) : row.weather_data;
                
                const upcoming = (data.hourly || [])
                    .filter((h: any) => new Date(h.time) > now)
                    .slice(0, 6)
                    .map((h: any) => {
                        const t = new Date(h.time).toLocaleTimeString([], { hour: 'numeric', hour12: true });
                        return `${t}: ${h.rain_prob}%`;
                    }).join(' | ');

                if (upcoming) {
                    io.emit('weather_alert', { 
                        title: `🌤️ 6-Hour Outlook: ${row.name}`, 
                        body: upcoming 
                    });
                }
            }
        } catch (e) { console.error("Hourly Job Error:", e); }
    }, null, true, timeZone);

    // ==================================================
    // 3. TESTING NOTIFICATION (Every 2 min & Rain > 2%)
    // ==================================================
    // new CronJob('*/2 * * * *', async () => {
    //     try {
    //         const [rows]: any = await pool.query('SELECT l.name, c.weather_data FROM locations l JOIN weather_cache c ON l.id = c.location_id');
            
    //         for (const row of rows) {
    //             const data = typeof row.weather_data === 'string' ? JSON.parse(row.weather_data) : row.weather_data;
    //             const rainChance = data.current?.rain_prob ?? 0;

    //             if (rainChance > 2) {
    //                 io.emit('weather_alert', { 
    //                     title: "🧪 Test Alert (Rain > 2%)", 
    //                     body: `Location: ${row.name} | Current Rain Prob: ${rainChance}%` 
    //                 });
    //             }
    //         }
    //     } catch (e) { console.error("Test Job Error:", e); }
    // }, null, true, timeZone);
};