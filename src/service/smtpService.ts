import nodemailer from 'nodemailer';
import { pool } from '../config/db.js';
import path from 'path'; 
import dotenv from 'dotenv';
import { formatTelegramWeatherMsg, sendTelegramMessage } from './telegramService.js';
dotenv.config(); 

const SMTP_CONFIG = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

const generateHourlyTable = (hourlyData: any) => {
    // Grab the next 6 hours from the Google payload
    const upcomingHours = hourlyData ? hourlyData.slice(0, 6) : [];

    if (upcomingHours.length === 0) return "<p style='color:#64748b; font-size:14px; text-align:center; padding: 20px;'>🌙 No hourly data available.</p>";

    let html = `
      <div style="margin-top: 25px;">
          <h3 style="color: #1e293b; font-size: 16px; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">📅 Forecast for Next 6 Hours</h3>
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: separate; border-spacing: 0; font-size: 14px; text-align: left; width: 100%;">
            <thead>
                <tr style="background-color: #f8fafc;">
                    <th style="padding: 12px 15px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Time</th>
                    <th style="padding: 12px 15px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Condition</th>
                    <th style="padding: 12px 15px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Temp</th>
                    <th style="padding: 12px 15px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Rain Chance</th>
                </tr>
            </thead>
            <tbody>
    `;

    upcomingHours.forEach((h: any, index: number) => {
      // Force Asia/Colombo time for emails
      const timeStr = new Date(h.time).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit', hour12: true, timeZone: 'Asia/Colombo'});
      const bgStyle = index % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #fcfcfc;'; 
      const rainColor = h.rain_prob > 40 ? '#ef4444' : '#3b82f6'; 

      html += `
        <tr style="${bgStyle}">
          <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #334155; font-weight: 500;">${timeStr}</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #334155;">${h.condition}</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700;">${Math.round(h.temp)}°C</td>
          <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: ${rainColor}; font-weight: 600;">${h.rain_prob}%</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    return html;
};

export const sendSmtpUpdate = async () => {
    try {
        console.log("⏰ Starting Scheduled Batch Email...");

        // 👇 FETCH COMBINED LOCATIONS AND CACHED GOOGLE DATA!
        const [rows]: any = await pool.query(`
            SELECT l.*, w.weather_data 
            FROM locations l
            LEFT JOIN weather_cache w ON l.id = w.location_id
        `);
        
        if (rows.length === 0) {
            console.log("⚠️ No locations found in DB.");
            return;
        }

        const transporter = nodemailer.createTransport(SMTP_CONFIG);
        const logoPath = path.join(process.cwd(), 'assets', 'logo.png');

        for (const loc of rows) {
            
            if (!loc.manager_email) {
                console.warn(`⚠️ Skipping ${loc.name}: No manager email found.`);
                continue; 
            }

            if (!loc.weather_data) {
                console.warn(`⚠️ Skipping ${loc.name}: No weather data cached yet.`);
                continue; 
            }

            console.log(`Processing ${loc.name}...`);

            // 1. Parse the saved Google data from the database
            const weatherData = typeof loc.weather_data === 'string' ? JSON.parse(loc.weather_data) : loc.weather_data;
            const current = weatherData.current;
            const hourly = weatherData.hourly;

            // 2. Build HTML and Telegram text
            const hourlyHtml = generateHourlyTable(hourly);
            const telegramMsg = formatTelegramWeatherMsg(loc.name, current, hourly);
            
            // 3. Send Telegram
            if (loc.telegram_chat_id) {
                await sendTelegramMessage(loc.telegram_chat_id, telegramMsg);
            }

            // 4. Send Email
            await transporter.sendMail({
                from: `"Meteoscope Bot" <${SMTP_CONFIG.auth.user}>`,
                to: loc.manager_email, 
                subject: `📢 Weather Alert: ${loc.name} Report`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        
                        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                            
                            <div style="background: linear-gradient(135deg, #23529cff 0%, #0f172a 100%); padding: 30px 20px; text-align: center;">
                                
                                <img src="cid:company-logo" alt="Company Logo" style="height: 50px; margin-bottom: 15px; display: inline-block;">
                                
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">${loc.name} Weather</h1>
                                <p style="color: #94a3b8; margin: 5px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Daily Manager Report</p>
                            </div>

                            <div style="padding: 30px;">
                                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                    <div style="text-align: center; width: 48%; border-right: 1px solid #e2e8f0;">
                                        <p style="margin: 0; color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600;">Temperature</p>
                                        <p style="margin: 5px 0 0; color: #0f172a; font-size: 28px; font-weight: 800;">${Math.round(current.temp)}°C</p>
                                    </div>
                                    <div style="text-align: center; width: 48%;">
                                        <p style="margin: 0; color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600;">Rain Chance</p>
                                        <p style="margin: 5px 0 0; color: ${current.rain_prob > 30 ? '#ef4444' : '#3b82f6'}; font-size: 28px; font-weight: 800;">${current.rain_prob}%</p>
                                    </div>
                                </div>
                                <div style="text-align: center; margin-bottom: 20px;">
                                    <span style="background-color: #e2e8f0; color: #334155; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">Condition: ${current.condition}</span>
                                </div>

                                ${hourlyHtml}

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
                                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                                        Sent automatically to <a href="mailto:${loc.manager_email}" style="color: #3b82f6; text-decoration: none;">${loc.manager_email}</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                attachments: [
                    {
                        filename: 'logo.png',
                        path: logoPath,
                        cid: 'company-logo' 
                    }
                ]
            });

            console.log(`✅ Sent to ${loc.manager_email} for ${loc.name}`);
        }

        console.log("🏁 Batch Email Run Complete.");

    } catch (error) {
        console.error("❌ Batch Email Error:", error);
    }
};