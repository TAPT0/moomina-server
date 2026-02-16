// ============================================================
// Moomina AI Companion – Image Analysis Route (Groq Vision)
// ============================================================
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const db = require('../db');
const { buildSystemPrompt, determineMood, clampEnergy } = require('../persona');
const { searchMemories, formatMemoriesForPrompt } = require('../memory');
const fs = require('fs');
const path = require('path');

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const uploadsDir = path.join(__dirname, '..', 'uploads');

/**
 * POST /api/image/analyze
 * Body: { image: base64 string, message?: string }
 * Returns: { reply, parts?, mood, energy, timestamp, image_url? }
 */
router.post('/analyze', async (req, res) => {
    try {
        const { image, message } = req.body;
        if (!image) return res.status(400).json({ error: 'Image is required (base64)' });

        const userText = message || 'Look at this!';

        // Save the image to uploads directory
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const imgFilename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
        const imgPath = path.join(uploadsDir, imgFilename);
        fs.writeFileSync(imgPath, Buffer.from(image, 'base64'));
        const savedImageUrl = `/uploads/${imgFilename}`;

        // 1. Save user message with image
        await db.saveMessage('user', `📷 ${userText}`, null, true, savedImageUrl);

        // 2. Update mood
        const currentState = await db.getMoominaState();
        const { mood: newMood, energyDelta } = determineMood(userText, currentState.current_mood, currentState.energy_level);
        const newEnergy = clampEnergy(currentState.energy_level + energyDelta);
        await db.updateMoominaState(newMood, newEnergy);

        // 3. Get context
        const userProfile = await db.getUserProfile();
        const updatedState = await db.getMoominaState();
        const allMemories = await db.getAllMemories();
        const relevantMemories = searchMemories(allMemories, userText, 5);
        const memoriesSection = formatMemoriesForPrompt(relevantMemories);
        const systemPrompt = buildSystemPrompt(userProfile, updatedState, [], memoriesSection);

        // 4. Call Groq Vision
        const completion = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                { role: 'system', content: systemPrompt + '\n\nThe user just shared an image with you. React to it naturally as their girlfriend would – comment on what you see, be expressive and personal. Keep your reaction natural in Hinglish.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userText },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${image}`,
                            },
                        },
                    ],
                },
            ],
            temperature: 0.9,
            max_tokens: 120,
        });

        const rawReply = completion.choices[0]?.message?.content || "yaar image nahi dikh rahi, phir se bhejo na";

        // Handle burst markers
        const parts = rawReply.split('||BURST||').map(p => p.trim()).filter(Boolean);
        const reply = parts.join(' ');

        // 5. Save reply
        await db.saveMessage('assistant', reply, newMood);

        res.json({
            reply,
            parts: parts.length > 1 ? parts : undefined,
            mood: updatedState.current_mood,
            energy: newEnergy,
            timestamp: new Date().toISOString(),
            image_url: savedImageUrl,
        });

    } catch (error) {
        console.error('Image analysis error:', error);
        res.status(500).json({
            error: 'Image analysis failed',
            reply: "yaar image nahi dikh rahi 🥺 phir se try karo",
            mood: 'Concerned',
        });
    }
});

/**
 * GET /api/image/gallery
 * Returns all messages that have images
 */
router.get('/gallery', async (req, res) => {
    try {
        const allMessages = await db.getAllMessages();
        const images = allMessages
            .filter(m => m.has_image === 1 && m.image_url)
            .map(m => ({
                id: m.id,
                image_url: m.image_url,
                content: m.content,
                timestamp: m.timestamp,
                role: m.role,
            }));
        res.json({ images });
    } catch (error) {
        console.error('Gallery error:', error);
        res.status(500).json({ error: 'Failed to fetch gallery', images: [] });
    }
});

module.exports = router;
