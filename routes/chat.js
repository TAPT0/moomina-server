// ============================================================
// Moomina AI Companion – Chat Route (Phase 2: RAG-enabled)
// ============================================================
const express = require('express');
const OpenAI = require('openai');
const router = express.Router();
const db = require('../db');
const { buildSystemPrompt, determineMood, clampEnergy } = require('../persona');
const { searchMemories, isDuplicate, formatMemoriesForPrompt } = require('../memory');
const { generateImage } = require('../services/imageGen');

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const fs = require('fs');
const path = require('path');
const uploadsDir = path.join(__dirname, '..', 'uploads');

/**
 * POST /api/chat
 * Body: { message: string }
 * Returns: { reply: string, mood: string, energy: number }
 */
router.post('/', async (req, res) => {
    try {
        const { message, is_voice } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }

        // 1. Save user message
        await db.saveMessage('user', message);

        // 2. Update Moomina's mood based on user message
        const currentState = await db.getMoominaState();
        const { mood: newMood, energyDelta } = determineMood(
            message,
            currentState.current_mood,
            currentState.energy_level
        );
        const newEnergy = clampEnergy(currentState.energy_level + energyDelta);
        await db.updateMoominaState(newMood, newEnergy);

        // 3. Get user profile and updated state
        const userProfile = await db.getUserProfile();
        const updatedState = await db.getMoominaState();

        // 4. RAG: Search for relevant memories based on user message
        const allMemories = await db.getAllMemories();
        const relevantMemories = searchMemories(allMemories, message, 7);
        const memoriesPromptSection = formatMemoriesForPrompt(relevantMemories);

        // 5. Build system prompt with relevant memories
        const systemPrompt = buildSystemPrompt(userProfile, updatedState, [], memoriesPromptSection);

        // 6. Get recent conversation history
        const recentMessages = await db.getRecentMessages(20);
        const conversationHistory = recentMessages.map(m => ({
            role: m.role,
            content: m.content,
        }));

        // 7. Call Groq (LLaMA 3.3 70B) — very low tokens for short replies
        // Implement Fallback for 429 Rate Limit
        let completion;
        try {
            completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                ],
                temperature: 0.92,
                max_tokens: 120,
            });
        } catch (err) {
            if (err.status === 429 || err.code === 'rate_limit_exceeded') {
                console.warn('⚠️ Groq 70B Rate Limit! Falling back to 8B model...');
                completion = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...conversationHistory,
                    ],
                    temperature: 0.92,
                    max_tokens: 120,
                });
            } else {
                throw err;
            }
        }

        const rawReply = completion.choices[0]?.message?.content || "hmm 🫣";

        // 8. Handle burst messaging — split on ||BURST|| marker
        const parts = rawReply.split('||BURST||').map(p => p.trim()).filter(Boolean);
        let reply = parts.join(' '); // Combined for DB storage

        // 9. Check for Photo Generation Tag
        const photoMatch = reply.match(/\[SEND_PHOTO:\s*(.*?)\]/i);
        let generatedImageUrl = null;

        if (photoMatch) {
            const photoPrompt = photoMatch[1];
            console.log('📸 generating photo:', photoPrompt);

            // Remove tag from reply visible to user
            reply = reply.replace(photoMatch[0], '').trim();

            // Generate image (async but we await it for simplicity here, or fire & forget if slow)
            // For now await to return in same response
            generatedImageUrl = await generateImage(photoPrompt);
        }

        // 10. Save assistant message
        await db.saveMessage('assistant', reply, newMood, !!generatedImageUrl, generatedImageUrl);

        // 10. Auto-extract memories every 5 messages
        const msgCount = await db.getMessageCount();
        if (msgCount % 5 === 0 && msgCount > 0) {
            extractMemories().catch(err => console.error('Memory extraction error:', err));
        }

        // 11. Generate TTS audio ONLY for voice message replies
        let audio_url = null;
        if (is_voice) {
            try {
                audio_url = await generateTTS(reply);
                console.log('🔊 Voice reply generated for voice message');
            } catch (ttsErr) {
                console.log('TTS generation skipped:', ttsErr.message);
            }
        }

        // 12. Return response
        res.json({
            reply,
            parts: parts.length > 1 ? parts : undefined,
            mood: updatedState.current_mood,
            energy: newEnergy,
            timestamp: new Date().toISOString(),
            audio_url,
            image_url: generatedImageUrl,
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Something went wrong',
            reply: "Sorry jaan, my brain froze for a sec 🥺 Try again?",
            mood: 'Concerned',
        });
    }
});
/**
 * Generate TTS audio from text using ElevenLabs
 * Returns the audio URL path (relative to server)
 */
async function generateTTS(text) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('No ElevenLabs API key set');

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    console.log(`🔊 Generating TTS (${text.length} chars)...`);

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
        const errText = await response.text();
        console.error('❌ ElevenLabs TTS error:', response.status, errText);
        throw new Error(`TTS API failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`✅ TTS saved: ${filename} (${buffer.length} bytes)`);
    return `/audio/${filename}`;
}

/**
 * Auto-extract categorized facts from recent conversation.
 * Phase 2 upgrade: structured categories + importance scores + deduplication.
 */
async function extractMemories() {
    const recentMessages = await db.getRecentMessages(10);
    if (recentMessages.length < 3) return; // Need enough context

    const conversation = recentMessages
        .map(m => `${m.role === 'user' ? 'Aahil' : 'Moomina'}: ${m.content}`)
        .join('\n');

    const extraction = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant', // Use smaller model for background tasks to save limits
        messages: [
            {
                role: 'system',
                content: `You are a memory extraction system for a personal AI companion. Analyze the conversation and extract important facts about the user (Aahil).

Return ONLY a valid JSON array of objects. Each object must have:
- "content": A short, clear fact (e.g. "Loves biryani", "Has an exam on Friday")
- "category": One of: "preference", "fact", "person", "event", "emotion"
- "importance": A number 1-10 (10 = critical life fact, 1 = trivial mention)

Category guide:
- preference: likes, dislikes, favorites, interests
- fact: personal details, habits, daily life
- person: people mentioned (family, friends)
- event: upcoming or past events, plans, deadlines
- emotion: emotional states, feelings, moods expressed

If there are no new facts worth remembering, return an empty array [].
Return ONLY valid JSON, nothing else. No markdown formatting.`,
            },
            { role: 'user', content: conversation },
        ],
        temperature: 0.3,
        max_tokens: 500,
    });

    try {
        let raw = extraction.choices[0]?.message?.content || '[]';
        // Strip markdown code fences if present
        raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const facts = JSON.parse(raw);

        if (Array.isArray(facts)) {
            const existingMemories = await db.getAllMemories();
            let stored = 0;

            for (const fact of facts) {
                if (!fact.content || typeof fact.content !== 'string') continue;

                const content = fact.content.trim();
                const category = ['preference', 'fact', 'person', 'event', 'emotion'].includes(fact.category)
                    ? fact.category
                    : 'general';
                const importance = Math.max(1, Math.min(10, fact.importance || 5));

                // Skip duplicates
                if (isDuplicate(existingMemories, content)) {
                    continue;
                }

                await db.saveMemory(content, category, importance);
                existingMemories.push({ content, category, importance }); // Update local list
                stored++;
            }

            if (stored > 0) {
                console.log(`🧠 Extracted ${stored} new memories (${facts.length - stored} duplicates skipped)`);
            }
        }
    } catch (e) {
        console.error('Failed to parse extracted memories:', e.message);
    }
}

module.exports = router;
