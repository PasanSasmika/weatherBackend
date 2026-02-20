import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const sendTelegramMessage = async (chatId: string, message: string) => {
    if (!chatId || !TELEGRAM_BOT_TOKEN) return;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML' 
        });
        console.log(`✅ Telegram sent to ${chatId}`);
    } catch (error: any) {
        console.error("❌ Telegram API Error:", error.response?.data || error.message);
    }
};

export const formatTelegramWeatherMsg = (locationName: string, current: any, hourlyData: any) => {
    // Basic Current Weather
    let msg = `<b>🌤️ Weather Update: ${locationName}</b>\n\n`;
    msg += `<b>Condition:</b> ${current.condition}\n`;
    msg += `<b>Temp:</b> ${Math.round(current.temp)}°C\n`;
    msg += `<b>Rain Risk:</b> ${current.rain_prob}%\n\n`;

    // Forecast Header
    msg += `<b>📅 Forecast (Next 6 Hours):</b>\n`;

    // Take the next 6 hours directly from the Google API payload
    const upcoming = hourlyData ? hourlyData.slice(0, 6) : [];

    if (upcoming.length === 0) {
        msg += `<i>No hourly data available.</i>`;
    } else {
        upcoming.forEach((h: any) => {
            // Force Asia/Colombo time formatting
            const timeStr = new Date(h.time).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true, 
                timeZone: 'Asia/Colombo' 
            });
            
            // Add a raindrop emoji if rain chance is high (> 40%)
            const rainIcon = h.rain_prob > 40 ? '🌧️' : '💧';
            
            // Format: 2:00 PM: 30°C | 💧 10%
            msg += `• <b>${timeStr}</b>: ${Math.round(h.temp)}°C | ${rainIcon} ${h.rain_prob}%\n`;
        });
    }

    return msg;
};