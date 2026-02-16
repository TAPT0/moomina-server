// ============================================================
// Moomina AI Companion – Voice Route (TTS + STT)
// ============================================================
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');

// Groq client for Whisper STT
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const uploadsDir = path.join(__dirname, '..', 'uploads');

/**
 * POST /api/voice/tts
 * Body: { text: string }
 * Returns: audio/mpeg stream
 */
router.post('/tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'ElevenLabs API key not configured' });

        // Use ElevenLabs Sarah voice (warm, friendly)
        const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text: text.substring(0, 1000),
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.3,
                },
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('ElevenLabs error:', err);
            return res.status(500).json({ error: 'TTS failed' });
        }

        res.set('Content-Type', 'audio/mpeg');
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);

    } catch (error) {
        console.error('TTS error:', error);
        res.status(500).json({ error: 'TTS failed' });
    }
});

/**
 * POST /api/voice/stt
 * Body: { audio: base64 string }
 * Returns: { text: string }
 * 
 * Accepts base64-encoded audio data, writes to temp file, sends to Groq Whisper.
 */
router.post('/stt', async (req, res) => {
    let tempFile = null;
    try {
        const { audio } = req.body;
        if (!audio) return res.status(400).json({ error: 'Audio data is required (base64)' });

        // Write base64 audio to temp file
        tempFile = path.join(uploadsDir, `${uuidv4()}.m4a`);
        const audioBuffer = Buffer.from(audio, 'base64');
        fs.writeFileSync(tempFile, audioBuffer);

        console.log(`🎤 STT: Received audio (${audioBuffer.length} bytes), transcribing...`);

        // Groq Whisper transcription
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFile),
            model: 'whisper-large-v3-turbo',
            response_format: 'json',
        });

        console.log(`🎤 STT result: "${transcription.text}"`);

        res.json({ text: transcription.text });

    } catch (error) {
        console.error('STT error:', error?.message || error);
        res.status(500).json({ error: 'Speech-to-text failed' });
    } finally {
        // Clean up temp file
        if (tempFile) fs.unlink(tempFile, () => { });
    }
});

module.exports = router;
