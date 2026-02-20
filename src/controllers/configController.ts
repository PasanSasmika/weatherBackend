import { Request, Response } from 'express';
import { pool } from '../config/db.js';

export const updateMicrosoftConfig = async (req: Request, res: Response) => {
    const { tenantId, clientId, clientSecret, email } = req.body;

    if (!tenantId || !clientId || !clientSecret || !email) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const settings = [
            { key: 'ms_tenant_id', val: tenantId },
            { key: 'ms_client_id', val: clientId },
            { key: 'ms_client_secret', val: clientSecret },
            { key: 'ms_user_email', val: email }
        ];

        // Sequential execution ensures the pool handles each request properly
        for (const setting of settings) {
            await pool.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                [setting.key, setting.val, setting.val]
            );
        }

        res.json({ success: true, message: "Microsoft credentials updated successfully" });
    } catch (error: any) {
        console.error("❌ Config Update Failed:", error.message);
        res.status(500).json({ error: "Failed to update settings" });
    }
};