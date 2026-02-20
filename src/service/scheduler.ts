import { CronJob } from 'cron';
import { sendSmtpUpdate } from './smtpService.js';
import { pool } from '../config/db.js';
import { fetchAndFormatWeather } from '../controllers/weatherController.js';

export const startScheduler = () => {
    console.log("⏳ Weather & Email Scheduler Initialized (Asia/Colombo time)...");

    // The timezone string to force all schedules into Sri Lanka time
    const timeZone = "Asia/Colombo";

    // ==================================================
    // 📧 EMAIL SCHEDULER
    // ==================================================
    
    // TESTING
    new CronJob('08 15 * * *', () => {
        console.log("🚀 TESTING: Triggering Email...");
        sendSmtpUpdate();
    }, null, true, timeZone);

    new CronJob('0 8 * * *', () => {
        console.log("⏰ Triggering 8 AM Email...");
        sendSmtpUpdate();
    }, null, true, timeZone);

    new CronJob('0 10 * * *', () => {
        console.log("⏰ Triggering 10 AM Email...");
        sendSmtpUpdate();
    }, null, true, timeZone);

    new CronJob('0 12 * * *', () => {
        console.log("⏰ Triggering 12 PM Email...");
        sendSmtpUpdate();
    }, null, true, timeZone);

    new CronJob('0 15 * * *', () => {
        console.log("⏰ Triggering 3 PM Email...");
        sendSmtpUpdate();
    }, null, true, timeZone);


    // ==================================================
    // 🌤️ WEATHER API CACHE (EVERY 15 MINS)
    // ==================================================
    
    new CronJob('*/15 * * * *', async () => {
        const slTime = new Date().toLocaleString('en-US', { timeZone });
        console.log(`\n[${slTime}] ⏳ Running 15-min Weather Sync for all locations...`);
        
        try {
            // 1. Get all active locations
            const [locations]: any = await pool.query('SELECT * FROM locations');
            
            // 2. Loop through them and fetch updates from Google API
            for (const loc of locations) {
                try {
                    const weatherData = await fetchAndFormatWeather(loc.latitude, loc.longitude, loc.id);
                    
                    // 3. Save to database (Insert if new, Update if already exists)
                    await pool.query(
                        'INSERT INTO weather_cache (location_id, weather_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE weather_data = ?',
                        [loc.id, JSON.stringify(weatherData), JSON.stringify(weatherData)]
                    );
                    console.log(`  ✅ Successfully updated DB cache for: ${loc.name}`);
                } catch (e) {
                    console.error(`  ❌ Failed to update weather for ${loc.name}:`, e);
                }
            }
            console.log(`[${slTime}] 🏁 15-min Weather Sync Complete.\n`);
        } catch (error) {
            console.error("Scheduler database error:", error);
        }
    }, null, true, timeZone); // <-- The "true" starts the job automatically
};