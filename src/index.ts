import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import weatherRoutes from './routes/weatherRoutes.js';
import { startScheduler } from './service/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); 
app.use(cors());

app.use('/api', weatherRoutes);
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startScheduler();
});