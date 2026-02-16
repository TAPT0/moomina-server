// ============================================================
// Moomina AI Companion – Memories Route
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/memories
 * Returns all stored memories
 */
router.get('/', async (req, res) => {
    try {
        const memories = await db.getAllMemories();
        res.json({ memories });
    } catch (error) {
        console.error('Get memories error:', error);
        res.status(500).json({ error: 'Failed to fetch memories' });
    }
});

/**
 * DELETE /api/memories/:id
 * Delete a specific memory
 */
router.delete('/:id', async (req, res) => {
    try {
        const result = await db.deleteMemory(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Memory not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete memory error:', error);
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

/**
 * PUT /api/memories/:id
 * Update a memory's content
 * Body: { content: string }
 */
router.put('/:id', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }
        const result = await db.updateMemory(req.params.id, content);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Memory not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Update memory error:', error);
        res.status(500).json({ error: 'Failed to update memory' });
    }
});

/**
 * GET /api/profile
 * Returns Moomina's state and user profile
 */
router.get('/profile', async (req, res) => {
    try {
        const profile = await db.getUserProfile();
        const state = await db.getMoominaState();
        res.json({ profile, moominaState: state });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * GET /api/messages
 * Returns all chat messages
 */
router.get('/messages', async (req, res) => {
    try {
        const messages = await db.getAllMessages();
        res.json({ messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

module.exports = router;
