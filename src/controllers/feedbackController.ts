import { Request, Response } from 'express';
import { pool } from '../config/db.js';

export const submitFeedback = async (req: Request, res: Response) => {
    // 👇 Added workerName and workerId
    const { locationId, date, accuracyPercentage, selectedReason, workerName, workerId } = req.body;

    try {
        await pool.query(
            'INSERT INTO user_feedback (location_id, worker_name, worker_id, feedback_date, accuracy_percentage, selected_reason) VALUES (?, ?, ?, ?, ?, ?)',
            [locationId, workerName, workerId, date, accuracyPercentage, selectedReason]
        );
        res.json({ success: true, message: "Feedback recorded" });
    } catch (error) {
        console.error("Feedback DB Error:", error);
        res.status(500).json({ error: "Failed to save feedback" });
    }
};

export const checkFeedbackStatus = async (req: Request, res: Response) => {
    // 👇 Added workerId to the query params
    const { locationId, date, workerId } = req.query;

    try {
        const [rows]: any = await pool.query(
            'SELECT id FROM user_feedback WHERE location_id = ? AND feedback_date = ? AND worker_id = ?',
            [locationId, date, workerId]
        );
        res.json({ submitted: rows.length > 0 }); 
    } catch (error) {
        res.status(500).json({ error: "Failed to check status" });
    }
};


export const getAllFeedback = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(`
            SELECT f.*, l.name as location_name 
            FROM user_feedback f 
            LEFT JOIN locations l ON f.location_id = l.id 
            ORDER BY f.feedback_date DESC, f.id DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Fetch Feedback Error:", error);
        res.status(500).json({ error: "Failed to fetch feedback data" });
    }
};