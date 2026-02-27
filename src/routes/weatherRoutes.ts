import { Router } from 'express';
import { addLocation, deleteLocation, getLocations, getWeather } from '../controllers/weatherController.js';
import { checkFeedbackStatus, getAllFeedback, submitFeedback } from '../controllers/feedbackController.js';
import { updateMicrosoftConfig } from '../controllers/configController.js';
import { sendAlert } from '../controllers/emailController.js';
import { io } from '../index.js';
const router = Router();

// Weather Routes
router.get('/locations', getLocations);
router.get('/forecast', getWeather);
router.post('/locations', addLocation);
// Feedback Route
router.post('/feedback', submitFeedback);
router.delete('/locations/:id', deleteLocation);
router.post('/config/microsoft', updateMicrosoftConfig);
router.post('/notify', sendAlert); 
router.get('/feedback/check', checkFeedbackStatus); // 👈 THIS IS PROBABLY MISSING
router.get('/feedback', getAllFeedback);


router.post('/notify-manual', (req, res) => {
    const { title, body } = req.body;
    io.emit('weather_alert', { title, body });
    res.json({ success: true });
});
export default router;