// ============================================================
// Moomina AI Companion – Semantic Memory Engine
// ============================================================
// Pure JS TF-IDF + cosine similarity for memory search.
// No external vector DB needed.
// ============================================================

/**
 * Tokenize text into lowercase words, removing punctuation.
 */
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);
}

// Common English stop words to ignore
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
    'or', 'if', 'while', 'about', 'up', 'it', 'he', 'she', 'they', 'we',
    'you', 'me', 'him', 'her', 'his', 'my', 'your', 'its', 'our', 'their',
    'this', 'that', 'these', 'those', 'am', 'what', 'which', 'who', 'whom',
    'i', 'like', 'also', 'really', 'know', 'think', 'want', 'get', 'got',
]);

/**
 * Build a term frequency vector for a text string.
 * Returns a Map of word → normalized frequency.
 */
function buildTFVector(text) {
    const words = tokenize(text).filter(w => !STOP_WORDS.has(w));
    const freq = new Map();
    for (const word of words) {
        freq.set(word, (freq.get(word) || 0) + 1);
    }
    // Normalize by document length
    const len = words.length || 1;
    for (const [word, count] of freq) {
        freq.set(word, count / len);
    }
    return freq;
}

/**
 * Compute cosine similarity between two TF vectors.
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [word, weightA] of vecA) {
        normA += weightA * weightA;
        const weightB = vecB.get(word) || 0;
        dotProduct += weightA * weightB;
    }

    for (const [, weightB] of vecB) {
        normB += weightB * weightB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search memories by relevance to a query string.
 * @param {Array} memories - Array of memory objects with { id, content, category, importance }
 * @param {string} query - The search query (usually the user's message)
 * @param {number} topK - Number of results to return
 * @returns {Array} Top-K memories sorted by relevance score
 */
function searchMemories(memories, query, topK = 5) {
    if (!memories.length || !query.trim()) return [];

    const queryVec = buildTFVector(query);
    if (queryVec.size === 0) return [];

    const scored = memories.map(memory => {
        const memVec = buildTFVector(memory.content);
        const similarity = cosineSimilarity(queryVec, memVec);

        // Boost by importance (1-10 scale, default 5)
        const importance = memory.importance || 5;
        const importanceBoost = importance / 10;

        // Combined score: similarity weighted + small importance bonus
        const score = similarity * 0.8 + importanceBoost * 0.2;

        return { ...memory, score };
    });

    return scored
        .filter(m => m.score > 0.05) // Minimum relevance threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

/**
 * Check if a new memory is a near-duplicate of existing ones.
 * @param {Array} existingMemories - Current memories
 * @param {string} newContent - Content of the new memory
 * @param {number} threshold - Similarity threshold (default 0.7)
 * @returns {boolean} True if duplicate found
 */
function isDuplicate(existingMemories, newContent, threshold = 0.7) {
    const newVec = buildTFVector(newContent);
    for (const mem of existingMemories) {
        const memVec = buildTFVector(mem.content);
        if (cosineSimilarity(newVec, memVec) >= threshold) {
            return true;
        }
    }
    return false;
}

/**
 * Format relevant memories for injection into the system prompt.
 * Groups by category and includes importance indicators.
 */
function formatMemoriesForPrompt(memories) {
    if (!memories.length) return '';

    // Group by category
    const grouped = {};
    for (const mem of memories) {
        const cat = mem.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(mem);
    }

    const categoryEmojis = {
        preference: '❤️',
        fact: '📝',
        person: '👤',
        event: '📅',
        emotion: '💭',
        general: '💡',
    };

    let output = '';
    for (const [category, mems] of Object.entries(grouped)) {
        const emoji = categoryEmojis[category] || '💡';
        output += `\n${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)}:\n`;
        for (const m of mems) {
            const star = m.importance >= 8 ? ' ⭐' : '';
            output += `  - ${m.content}${star}\n`;
        }
    }

    return output;
}

module.exports = {
    searchMemories,
    isDuplicate,
    formatMemoriesForPrompt,
    buildTFVector,
    cosineSimilarity,
    tokenize,
};
