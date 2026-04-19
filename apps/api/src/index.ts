import express from 'express';
import cors from 'cors';
import whatsappRoutes from './routes/whatsappRoutes';
import aiRoutes from './routes/aiRoutes';
import agentRoutes from './routes/agentRoutes';
import voiceRoutes from './routes/voiceRoutes';
import authRoutes from './routes/authRoutes';
import fs from 'fs';
import path from 'path';
import { errorHandler } from './middleware/errorMiddleware';
import { authMiddleware } from './middleware/authMiddleware';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Use raw middleware for voice listening to handle audio buffers
app.use('/api/voice/listen', express.raw({ type: 'audio/wav', limit: '10mb' }));
app.use(express.json());

// Create sessions directory if it doesn't exist
const sessionsDir = path.join(__dirname, '../sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);
app.use('/api/agent', authMiddleware, agentRoutes);
app.use('/api/voice', authMiddleware, voiceRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
