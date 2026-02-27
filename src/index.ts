import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http'; // Add this
import { Server } from 'socket.io';  // Add this
import weatherRoutes from './routes/weatherRoutes.js';
import { startScheduler } from './service/scheduler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app); // Wrap express in HTTP server

// Initialize Socket.io
export const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for mobile testing
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

app.use(express.json()); 
app.use(cors());

// Log when a mobile device connects
io.on('connection', (socket) => {
    console.log('📱 A mobile device connected:', socket.id);
});

app.use('/api', weatherRoutes);

// Use httpServer.listen instead of app.listen
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startScheduler();
});