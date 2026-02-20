import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/db.js';

// --- Helper: Fetch Config from Database ---
const getStoredCredentials = async () => {
    const [rows]: any = await pool.query("SELECT * FROM system_settings");
    const config: Record<string, string> = {};
    rows.forEach((row: any) => {
        config[row.setting_key] = row.setting_value;
    });
    return config;
};

// --- Helper: Get Token ---
const getMicrosoftToken = async (config: any) => {
    const url = `https://login.microsoftonline.com/${config.ms_tenant_id}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', config.ms_client_id);
    params.append('client_secret', config.ms_client_secret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    try {
        const response = await axios.post(url, params);
        return response.data.access_token;
    } catch (error: any) {
        throw new Error(`Token Error: ${error.response?.data?.error_description || error.message}`);
    }
};

export const sendAlert = async (req: Request, res: Response) => {
    const { locationName, customMessage, recipients } = req.body;

    try {
        // 1. Fetch Credentials and Token early to validate setup
        const config = await getStoredCredentials();
        const token = await getMicrosoftToken(config);
        const senderEmail = config.ms_user_email; // Use the email stored in settings

        // 2. Validate Recipients
        let toList = [];
        if (recipients && Array.isArray(recipients) && recipients.length > 0) {
            toList = recipients.map((email: string) => ({ emailAddress: { address: email.trim() } }));
        } else {
            return res.status(400).json({ error: "Please provide recipients." });
        }

        // 3. FETCH REAL DATA FROM DATABASE CACHE
        const [dbRows]: any = await pool.query(
            `SELECT w.weather_data 
             FROM weather_cache w 
             JOIN locations l ON w.location_id = l.id 
             WHERE l.name = ?`, 
            [locationName]
        );

        if (dbRows.length === 0) {
            return res.status(404).json({ error: "Weather data not found for this location." });
        }

        // 🛡️ SAFE PARSING: Fixes "[object Object]" error
        const weatherData = typeof dbRows[0].weather_data === 'string' 
            ? JSON.parse(dbRows[0].weather_data) 
            : dbRows[0].weather_data;

        const current = weatherData.current;
        const nextHours = weatherData.hourly ? weatherData.hourly.slice(0, 6) : [];

        // 4. BUILD DYNAMIC HOURLY HTML TABLE
        let hourlyHtmlTable = `
            <h3 style="color: #333; margin-bottom: 10px;">🕒 Next 6 Hours Forecast</h3>
            <table width="100%" style="border-collapse: collapse; font-size: 14px;">
                <tr style="background-color: #f0f8ff; color: #005a9e;">
                    <th style="padding: 10px; border-bottom: 2px solid #0078D4; text-align: left;">Time</th>
                    <th style="padding: 10px; border-bottom: 2px solid #0078D4; text-align: center;">Temp</th>
                    <th style="padding: 10px; border-bottom: 2px solid #0078D4; text-align: center;">Rain Risk</th>
                    <th style="padding: 10px; border-bottom: 2px solid #0078D4; text-align: left;">Condition</th>
                </tr>
        `;

        nextHours.forEach((hour: any) => {
            const timeStr = new Date(hour.time).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true, 
                timeZone: 'Asia/Colombo' 
            });

            const rainRiskColor = hour.rain_prob > 30 ? "color: #d32f2f; font-weight: bold;" : "color: #333;";

            hourlyHtmlTable += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #555;">${timeStr}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">${Math.round(hour.temp)}°C</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; ${rainRiskColor}">${hour.rain_prob}%</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #555;">${hour.condition}</td>
                </tr>
            `;
        });
        hourlyHtmlTable += `</table>`;

        // 5. BUILD FULL EMAIL HTML
        const emailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #0078D4; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🌤️ Weather Update</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 18px;">${locationName}</p>
            </div>
            <div style="padding: 30px;">
              <div style="background-color: #f0f8ff; border-left: 4px solid #0078D4; padding: 15px; margin-bottom: 25px; color: #333;">
                <strong style="color: #005a9e;">Message from Admin:</strong><br/>
                <span style="font-size: 16px;">${customMessage}</span>
              </div>
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px; border: 1px solid #eaeaea;">
                 <table width="100%" style="border-spacing: 0;">
                    <tr>
                        <td align="center" style="padding: 10px; border-right: 1px solid #ddd;">
                            <span style="font-size: 11px; color: #777; text-transform: uppercase;">Condition</span><br/>
                            <strong style="font-size: 18px; color: #333;">${current.condition}</strong>
                        </td>
                        <td align="center" style="padding: 10px; border-right: 1px solid #ddd;">
                            <span style="font-size: 11px; color: #777; text-transform: uppercase;">Temp</span><br/>
                            <strong style="font-size: 20px; color: #333;">${Math.round(current.temp)}°C</strong>
                        </td>
                        <td align="center" style="padding: 10px;">
                            <span style="font-size: 11px; color: #777; text-transform: uppercase;">Rain Risk</span><br/>
                            <strong style="font-size: 20px; color: ${current.rain_prob > 30 ? '#d32f2f' : '#0078D4'};">${current.rain_prob}%</strong>
                        </td>
                    </tr>
                 </table>
              </div>
              <div>${hourlyHtmlTable}</div>
              <p style="text-align: center; color: #888; font-size: 12px; margin-top: 40px;">Sent automatically from SkyLanka Admin Dashboard</p>
            </div>
          </div>
        `;

        // 6. SEND VIA MICROSOFT GRAPH
        await axios.post(
          `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
          {
            message: {
              subject: `Weather Alert: ${locationName} - ${current.condition}`,
              body: { contentType: 'HTML', content: emailHtml },
              toRecipients: toList
            },
            saveToSentItems: "true"
          },
          {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          }
        );

        res.json({ success: true, message: "Emails sent successfully." });

    } catch (error: any) {
        console.error("❌ Send Failed:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to send email", details: error.message });
    }
};