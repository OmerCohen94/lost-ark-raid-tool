// Updated groups.js

const express = require('express');
const router = express.Router();
const db = require('./db');

// Get all groups with filled slots count
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                g.id, 
                g.group_name, 
                g.min_item_level, 
                r.name AS raid_name,
                COALESCE((SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id), 0) AS filled_slots,
                8 AS total_slots -- Assuming each group has 8 slots
            FROM groups g
            JOIN raids r ON g.raid_id = r.id
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).send('Server error');
    }
});

// Create new group
router.post('/', async (req, res) => {
    const { raid_id, min_item_level } = req.body;

    if (!raid_id || !min_item_level) {
        return res.status(400).send({ error: 'raid_id and min_item_level are required' });
    }

    try {
        // Fetch the raid name and calculate the next group number for this raid
        const raidResult = await db.query('SELECT name FROM raids WHERE id = $1', [raid_id]);
        if (raidResult.rows.length === 0) {
            return res.status(404).send({ error: 'Raid not found' });
        }

        const raidName = raidResult.rows[0].name;

        const countResult = await db.query(
            'SELECT COUNT(*) AS group_count FROM groups WHERE raid_id = $1',
            [raid_id]
        );

        const nextGroupNumber = parseInt(countResult.rows[0].group_count, 10) + 1;
        const groupName = `Group ${nextGroupNumber}`;

        // Insert the new group
        const result = await db.query(
            'INSERT INTO groups (raid_id, group_name, min_item_level) VALUES ($1, $2, $3) RETURNING id',
            [raid_id, groupName, min_item_level]
        );

        res.status(201).json({
            id: result.rows[0].id,
            group_name: groupName,
            raid_name: raidName,
            min_item_level,
        });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).send('Server error');
    }
});

// Add new player
router.post('/players', async (req, res) => {
    const { username } = req.body;

    // Validate input
    if (!username || username.trim() === '') {
        return res.status(400).send({ error: 'Username is required.' });
    }

    try {
        // Insert the new player into the database
        await db.query(
            `INSERT INTO players (username) VALUES ($1)`,
            [username.trim()]
        );

        res.status(201).send('Player added successfully.');
    } catch (error) {
        console.error('Error adding player:', error);
        res.status(500).send('Server error.');
    }
});

//Get players
router.get('/players', async (req, res) => {
    const { group_id } = req.query;

    if (!group_id) {
        return res.status(400).send({ error: 'Group ID is required' });
    }

    try {
        // Fetch the raid ID and minimum item level for the group
        const groupResult = await db.query(
            `SELECT raid_id, min_item_level FROM groups WHERE id = $1`,
            [group_id]
        );

        if (groupResult.rows.length === 0) {
            return res.status(404).send({ error: 'Group not found' });
        }

        const { raid_id, min_item_level } = groupResult.rows[0];

        // Fetch players with eligible characters for the raid
        const playersResult = await db.query(
            `
            SELECT DISTINCT p.id, p.username, 
       EXISTS (
           SELECT 1 
           FROM characters c
           WHERE c.player_id = p.id 
             AND c.item_level >= $1
             AND c.id NOT IN (
                 SELECT character_id 
                 FROM group_members 
                 WHERE group_id != $2
             )
       ) AS has_eligible_characters
FROM players p
ORDER BY p.username;

            `,
            [min_item_level, raid_id]
        );

        res.json(playersResult.rows);
    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).send('Server error');
    }
});

//Get raids
router.get('/raids', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, min_item_level FROM raids');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching raids:', error);
        res.status(500).send('Server error');
    }
});

// Get members of a specific group
router.get('/:id/members', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT gm.group_id, p.username, c.name AS character_name, c.item_level
            FROM group_members gm
            JOIN players p ON gm.player_id = p.id
            JOIN characters c ON gm.character_id = c.id
            WHERE gm.group_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching group members:', error);
        res.status(500).send('Server error');
    }
});

// Save members in a specific group
router.post('/:id/members', async (req, res) => {
    const { id } = req.params;
    const { members } = req.body;

    if (!Array.isArray(members) || members.length === 0) {
        return res.status(400).send({ error: 'Invalid or empty members data' });
    }

    try {
        // Fetch the raid_id for the current group
        const groupResult = await db.query('SELECT raid_id FROM groups WHERE id = $1', [id]);
        if (groupResult.rows.length === 0) {
            return res.status(404).send({ error: 'Group not found' });
        }
        const { raid_id } = groupResult.rows[0];

        // Validate that no character is already assigned to another group in the same raid
        for (const member of members) {
            const conflictCheck = await db.query(
                `
                SELECT gm.group_id, g.group_name
                FROM group_members gm
                JOIN groups g ON gm.group_id = g.id
                WHERE gm.character_id = $1 AND g.raid_id = $2 AND gm.group_id != $3
                `,
                [member.character_id, raid_id, id]
            );

            if (conflictCheck.rows.length > 0) {
                return res.status(400).send({
                    error: `Character is already assigned to ${conflictCheck.rows[0].group_name} in this raid.`,
                });
            }
        }

        // Insert or update members (Upsert)
        for (const member of members) {
            await db.query(
                `
                INSERT INTO group_members (group_id, player_id, character_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (group_id, player_id) DO UPDATE
                SET character_id = EXCLUDED.character_id
                `,
                [id, member.player_id, member.character_id]
            );
        }

        res.status(201).send('Group members updated successfully');
    } catch (error) {
        console.error('Error saving group members:', error);
        res.status(500).send('Server error');
    }
});

// Clear group members
router.delete('/:id/members', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM group_members WHERE group_id = $1', [id]);
        res.status(200).send('Group members cleared successfully');
    } catch (error) {
        console.error('Error clearing group members:', error);
        res.status(500).send('Server error');
    }
});

// Delete group
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // First, delete all members associated with the group
        await db.query('DELETE FROM group_members WHERE group_id = $1', [id]);

        // Then, delete the group itself
        const result = await db.query('DELETE FROM groups WHERE id = $1 RETURNING id', [id]);

        if (result.rowCount === 0) {
            return res.status(404).send('Group not found');
        }

        res.status(200).send('Group deleted successfully');
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).send('Server error');
    }
});

// Get players for add page purposes
router.get('/players/all', async (req, res) => {
    try {
        const result = await db.query('SELECT id, username FROM players ORDER BY username ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;