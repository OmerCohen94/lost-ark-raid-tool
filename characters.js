const express = require('express');
const router = express.Router();
const db = require('./db'); // Adjust this path if `db.js` is located elsewhere

// GET /api/characters - Fetch characters for a specific player
router.get('/', async (req, res) => {
    const { player_id, group_id } = req.query;

    if (!player_id) {
        return res.status(400).send({ error: 'Player ID is required' });
    }

    try {
        let raid_id, min_item_level;

        // Fetch the raid ID and minimum item level only if group_id is provided
        if (group_id) {
            const groupResult = await db.query(
                `SELECT raid_id, min_item_level FROM groups WHERE id = $1`,
                [group_id]
            );

            if (groupResult.rows.length === 0) {
                return res.status(404).send({ error: 'Group not found' });
            }

            ({ raid_id, min_item_level } = groupResult.rows[0]);
        }

        const charactersQuery = `
            SELECT c.id, c.name, c.item_level, cl.name AS class_name,
                   c.item_level >= $2 AS meets_min_item_level,
                   gm.group_id IS NOT NULL AS assigned_to_group
            FROM characters c
            LEFT JOIN group_members gm ON c.id = gm.character_id
            JOIN classes cl ON c.class_id = cl.id
            WHERE c.player_id = $1
            ORDER BY cl.name
        `;

        const charactersResult = await db.query(charactersQuery, [
            player_id,
            min_item_level || 0,
        ]);

        const characters = charactersResult.rows;

        if (group_id) {
            const assignmentsResult = await db.query(
                `
                SELECT gm.character_id, g.group_name
                FROM group_members gm
                JOIN groups g ON gm.group_id = g.id
                WHERE g.raid_id = $1 AND gm.group_id != $2
                `,
                [raid_id, group_id]
            );

            const assignments = new Map();
            assignmentsResult.rows.forEach(row => {
                assignments.set(row.character_id, row.group_name);
            });

            characters.forEach(character => {
                character.assigned_to_group = assignments.get(character.id) || null;
            });
        }

        res.json(characters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).send('Server error');
    }
});

// Fetch a list of all classes
router.get('/classes', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name FROM classes ORDER BY name ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).send('Server error');
    }
});

// Create new character
router.post('/', async (req, res) => {
    const { player_id, name, item_level, class_id } = req.body;

    // Validate input
    if (!player_id || !name || !item_level || !class_id) {
        return res.status(400).send({ error: 'All fields are required to add a character.' });
    }

    try {
        await db.query(
            `
            INSERT INTO characters (player_id, name, item_level, class_id)
            VALUES ($1, $2, $3, $4)
            `,
            [player_id, name, item_level, class_id]
        );

        res.status(201).send('Character added successfully.');
    } catch (error) {
        console.error('Error adding character:', error);
        res.status(500).send('Server error.');
    }
});

// Delete character
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM characters WHERE id = $1', [id]);
        res.status(200).send('Character deleted successfully');
    } catch (error) {
        console.error('Error deleting character:', error);
        res.status(500).send('Server error');
    }
});

// Update character
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, item_level } = req.body;

    if (!name || !item_level) {
        return res.status(400).send({ error: 'Name and item level are required' });
    }

    try {
        await db.query(
            'UPDATE characters SET name = $1, item_level = $2 WHERE id = $3',
            [name, item_level, id]
        );
        res.status(200).send('Character updated successfully');
    } catch (error) {
        console.error('Error updating character:', error);
        res.status(500).send('Server error');
    }
});

// Fetch all characters
router.get('/all', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.id, c.name, c.item_level, cl.name AS class_name
            FROM characters c
            JOIN classes cl ON c.class_id = cl.id
            ORDER BY c.name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching all characters:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
