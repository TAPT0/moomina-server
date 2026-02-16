// ============================================================
// Moomina AI Companion – Server Entry Point
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { initScheduler } = require('./scheduler');

// Ensure uploads directory exists for voice files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/chat', require('./routes/chat'));
app.use('/api/memories', require('./routes/memories'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/image', require('./routes/image'));
app.use('/api/notifications', require('./routes/notifications'));

// Serve TTS audio files statically
app.use('/audio', express.static(uploadsDir));
// Serve uploaded images statically
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', async (req, res) => {
    const state = await db.getMoominaState();
    res.json({
        status: 'ok',
        name: 'Moomina Server',
        mood: state.current_mood,
        energy: state.energy_level,
        uptime: process.uptime(),
    });
});

// Get all messages
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await db.getAllMessages();
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Delete a message
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.deleteMessage(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Get profile + state
app.get('/api/profile', async (req, res) => {
    try {
        const profile = await db.getUserProfile();
        const state = await db.getMoominaState();
        res.json({ profile, moominaState: state });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Initialize DB (async) then start server
async function start() {
    await db.init();
    initScheduler();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n💖 Moomina Server is running on http://0.0.0.0:${PORT}`);
        console.log(`   Local: http://localhost:${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/api/health\n`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
