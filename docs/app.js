
const SUPABASE_URL = 'https://jlqfmqfhsyxxsbteykxz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZtcWZoc3l4eHNidGV5a3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1MzQ0NDUsImV4cCI6MjA1MjExMDQ0NX0.yU6iCVBt_-2lW0WkSNEmcGKyz_R7rN77IRB-ZggH-vE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache to store fetched static data in memory OPTIMIZED
const staticDataCache = new Map();

// Function to fetch static data from SUPABASE with caching OPTIMIZED
async function fetchFromStorage(filePath) {
    try {
        // Check if data is already cached
        if (staticDataCache.has(filePath)) {
            console.log(`Cache hit for ${filePath}`);
            return staticDataCache.get(filePath);
        }

        // Fetch from Supabase Storage
        const { data, error } = await supabase.storage
            .from('static-data') // Use the correct bucket name
            .download(filePath);

        if (error) {
            console.error(`Error fetching ${filePath} from storage:`, error);
            return null;
        }

        const text = await data.text(); // Convert the file content to text
        const jsonData = JSON.parse(text); // Parse the JSON data

        // Cache the fetched data
        staticDataCache.set(filePath, jsonData);

        console.log(`Fetched and cached data from ${filePath}:`, jsonData);
        return jsonData;
    } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return null;
    }
}

// Function to load classes into dropdowns with caching OPTIMIZED
async function loadClassesDropdown(dropdownElement) {
    try {
        // Check if the classes data is already cached
        const cacheKey = 'classes';
        if (staticDataCache.has(cacheKey)) {
            console.log('Cache hit for classes.json');
            populateDropdown(staticDataCache.get(cacheKey), dropdownElement);
            return;
        }

        // Fetch from Supabase Storage
        const classes = await fetchFromStorage('classes.json');

        if (!classes) {
            console.error('Failed to load classes from storage.');
            dropdownElement.innerHTML = '<option value="" disabled>Error loading classes</option>';
            return;
        }

        // Cache the fetched data
        staticDataCache.set(cacheKey, classes);

        // Populate dropdown
        populateDropdown(classes, dropdownElement);
        console.log('Classes dropdown populated successfully and cached.');
    } catch (error) {
        console.error('Error loading classes into dropdown:', error);
        dropdownElement.innerHTML = '<option value="" disabled>Error loading classes</option>';
    }
}

// Helper function to populate the dropdown OPTIMIZED
function populateDropdown(classes, dropdownElement) {
    dropdownElement.innerHTML = '<option value="" disabled selected>Select Class</option>';
    classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id; // Use the ID as the value
        option.textContent = cls.name; // Display only the class name
        dropdownElement.appendChild(option);
    });
}

// Cache for dynamic entities OPTIMIZED
const cache = {
    players: new Map(), // Dynamic, fetched per group or action
    characters: new Map(), // Dynamic, based on player or group context
    groups: new Map() // Dynamic, updated during group operations
};

// Clear Players Cache OPTIMIZED
function clearPlayersCache(groupId = null) {
    if (groupId) {
        // Clear players for a specific group
        cache.players.delete(groupId);
        console.log(`Cleared players cache for group ID ${groupId}`);
    } else {
        // Clear all players cache
        cache.players.clear();
        console.log('Cleared all players cache');
    }
}

// Clear Characters Cache OPTIMIZED
function clearCharactersCache(playerId, groupId = null) {
    if (groupId) {
        // Clear characters for a specific player-group combination
        const cacheKey = `${playerId}-${groupId}`;
        cache.characters.delete(cacheKey);
        console.log(`Cleared characters cache for player ID ${playerId}, group ID ${groupId}`);
    } else {
        // Clear all characters cache
        cache.characters.clear();
        console.log('Cleared all characters cache');
    }
}

// Function to disable already assigned players in relevant groups OPTIMIZED
async function disableAssignedPlayers(groupId) {
    try {
        // Fetch assigned players for the specific group
        const { data: assignedPlayers, error } = await supabase
            .from('group_members')
            .select('player_id')
            .eq('group_id', groupId);

        if (error) {
            console.error('Error fetching assigned players:', error);
            return;
        }

        if (!assignedPlayers || assignedPlayers.length === 0) {
            console.log(`No assigned players found for group ID ${groupId}.`);
            return;
        }

        const assignedPlayerIds = new Set(assignedPlayers.map(p => p.player_id)); // Use Set to avoid duplicates

        // Locate the relevant group element
        const groupElement = document.querySelector(`.raid-group[data-group-id="${groupId}"]`);
        if (!groupElement) {
            console.error(`Group element not found for group ID ${groupId}`);
            return;
        }

        // Disable assigned players in the group's player dropdowns
        const playerOptions = groupElement.querySelectorAll('.player-select option');
        playerOptions.forEach(option => {
            const playerId = parseInt(option.value, 10);
            if (assignedPlayerIds.has(playerId)) {
                option.disabled = true;
                option.textContent = `${option.textContent.split(' - ')[0]} - Already Assigned`;
            } else {
                option.disabled = false; // Re-enable if the player is no longer assigned
                option.textContent = option.textContent.split(' - ')[0]; // Remove "Already Assigned" if present
            }
        });

        console.log(`Updated player dropdowns for group ID ${groupId}.`);
    } catch (error) {
        console.error('Error disabling assigned players:', error);
    }
}

// Function to disable already assigned characters across all groups OPTIMIZED
async function disableAssignedCharacters() {
    try {
        // Fetch assigned characters from Supabase
        const { data: assignedCharacters, error } = await supabase
            .from('group_members')
            .select('character_id');

        if (error) {
            console.error('Error fetching assigned characters:', error);
            return;
        }

        if (!assignedCharacters || assignedCharacters.length === 0) {
            console.log('No assigned characters found.');
            return;
        }

        const assignedCharacterIds = new Set(assignedCharacters.map(c => c.character_id)); // Use Set to avoid duplicates

        // Update all character dropdowns
        const characterDropdowns = document.querySelectorAll('.character-select');
        characterDropdowns.forEach(dropdown => {
            const options = dropdown.querySelectorAll('option');
            options.forEach(option => {
                const charId = parseInt(option.value, 10);
                if (assignedCharacterIds.has(charId)) {
                    option.disabled = true;
                    option.textContent = `${option.textContent.split(' - ')[0]} - Already Assigned`;
                } else {
                    option.disabled = false; // Re-enable if the character is no longer assigned
                    option.textContent = option.textContent.split(' - ')[0]; // Remove "Already Assigned" if present
                }
            });
        });

        console.log('Character dropdowns updated to reflect assigned characters.');
    } catch (error) {
        console.error('Error disabling assigned characters:', error);
    }
}

// Clear Raids Cache OPTIMIZED
function clearRaidsCache() {
    const cacheKey = 'raids';
    if (staticDataCache.has(cacheKey)) {
        staticDataCache.delete(cacheKey); // Remove from in-memory cache
        console.log('Cleared raids cache.');
    } else {
        console.log('No raids cache to clear.');
    }
}

// Clear Groups Cache OPTIMIZED
function clearGroupsCache(raidId = null) {
    if (raidId) {
        // Clear cache for a specific raid
        if (cache.groups.has(raidId)) {
            cache.groups.delete(raidId);
            console.log(`Cleared groups cache for raid ID ${raidId}`);
        } else {
            console.log(`No groups cache found for raid ID ${raidId}`);
        }
    } else {
        // Clear all groups cache
        cache.groups.clear();
        console.log('Cleared all groups cache');
    }
}

// Fetch eligible characters and players for a group OPTIMIZED
async function fetchEligibleCharacters(playerId, groupId) {
    try {
        // Fetch the group to determine raid_id
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('raid_id')
            .eq('id', groupId)
            .single();

        if (groupError || !group) {
            console.error('Error fetching group details for eligibility:', groupError || 'Group not found');
            return { eligiblePlayers: [], eligibleCharacters: [] };
        }

        const raidId = group.raid_id;

        // Fetch eligible characters for the given playerId
        let eligibleCharacters = [];
        if (playerId) {
            const { data: characters, error: charactersError } = await supabase
                .from('eligible_characters')
                .select('*')
                .eq('player_id', playerId)
                .eq('raid_id', raidId);

            if (charactersError) {
                console.error('Error fetching eligible characters:', charactersError);
            } else {
                eligibleCharacters = characters;
            }
        }

        // Fetch all players
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('id, username');

        if (playersError) {
            console.error('Error fetching players:', playersError);
            return { eligiblePlayers: [], eligibleCharacters };
        }

        // Extract player IDs with assigned characters
        const assignedPlayerIds = new Set(
            eligibleCharacters.filter(char => char.is_assigned).map(char => char.player_id)
        );

        // Mark players as disabled if their characters are already assigned in the group
        const eligiblePlayers = players.map(player => ({
            ...player,
            isDisabled: assignedPlayerIds.has(player.id) // Mark player as disabled if any character is assigned
        }));

        console.log(
            `Fetched eligible characters for Player: ${playerId || 'All Players'}, Raid: ${raidId}`,
            eligibleCharacters
        );

        return { eligiblePlayers, eligibleCharacters };
    } catch (error) {
        console.error('Unexpected error fetching eligible characters:', error);
        return { eligiblePlayers: [], eligibleCharacters: [] };
    }
}

// Query to get groups with calculated slots OPTIMIZED
async function fetchGroupsWithSlots(raidId = null) {
    try {
        // Build the query for fetching groups and their related data
        const query = supabase
            .from('groups')
            .select(`
                id,
                group_name,
                min_item_level,
                raid_id,
                raids (name),
                group_members (id)
            `);

        // Add filtering by raidId if provided
        if (raidId) query.eq('raid_id', raidId);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        if (!data || data.length === 0) {
            console.log('No groups found.');
            return [];
        }

        // Calculate slots for each group
        const groupsWithSlots = data.map(group => ({
            ...group,
            raid_name: group.raids?.name || 'Unknown Raid',
            filled_slots: group.group_members?.length || 0, // Count members in the group
            total_slots: 8, // Assuming 8 slots per group
        }));

        console.log('Fetched groups with slots:', groupsWithSlots);
        return groupsWithSlots;
    } catch (error) {
        console.error('Unexpected error fetching groups with slots:', error);
        return [];
    }
}

// Query to add a new player OPTIMIZED
async function addNewPlayer(usernameInput) {
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Please enter a valid username.');
        return;
    }

    try {
        // Insert the new player into the database
        const { data, error } = await supabase
            .from('players')
            .insert([{ username }])
            .select()
            .single();

        if (error) {
            console.error('Error adding player:', error);
            alert(`Error: ${error.message}`);
            return;
        }

        alert('Player added successfully!');
        usernameInput.value = ''; // Clear the input field

        // Clear players cache to refresh dropdowns dynamically
        clearPlayersCache();

        console.log('New player added:', data);
    } catch (error) {
        console.error('Unexpected error adding player:', error);
        alert('Unexpected error adding player.');
    }
}

// Query to get players for group dropdown OPTIMIZED
async function fetchPlayersForGroup(groupId) {
    // Check in-memory cache first
    if (cache.players.has(groupId)) {
        console.log(`Cache hit for players in group ${groupId}`);
        return cache.players.get(groupId);
    }

    try {
        // Fetch all players from the database
        const { data: players, error } = await supabase
            .from('players')
            .select('id, username');

        if (error) {
            console.error('Error fetching players:', error);
            return [];
        }

        // Cache the results in memory
        cache.players.set(groupId, players);

        console.log(`Fetched players for group ${groupId}:`, players);
        return players;
    } catch (error) {
        console.error('Unexpected error fetching players:', error);
        return [];
    }
}

// Function to fetch group members from the UI OPTIMIZED
function fetchGroupMembers(groupDiv) {
    const groupId = parseInt(groupDiv.getAttribute('data-group-id'), 10);

    if (isNaN(groupId)) {
        console.error('Invalid group ID:', groupDiv);
        return [];
    }

    const rows = groupDiv.querySelectorAll('.assignment-table tr');
    const members = [];

    rows.forEach((row, index) => {
        const playerSelect = row.querySelector('.player-select');
        const characterSelect = row.querySelector('.character-select');

        if (playerSelect && characterSelect) {
            const playerId = parseInt(playerSelect.value, 10);
            const characterId = parseInt(characterSelect.value, 10);

            if (!isNaN(playerId) && !isNaN(characterId)) {
                members.push({
                    player_id: playerId,
                    character_id: characterId
                });
            } else {
                console.warn(
                    `Invalid selection in row ${index + 1}: Player ID or Character ID missing or invalid.`
                );
            }
        } else {
            console.warn(`Missing player or character dropdown in row ${index + 1}`);
        }
    });

    console.log(`Fetched members for group ID ${groupId}:`, members);
    return members;
}

// Query to save members in a specific group OPTIMIZED
const updateGroupMembers = async (group_id, members) => {
    if (!Array.isArray(members) || members.length === 0) {
        console.error('Invalid or empty members data');
        return { error: 'Invalid or empty members data' };
    }

    try {
        // Fetch the raid_id for the current group
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('raid_id')
            .eq('id', group_id)
            .single();

        if (groupError || !group) {
            console.error('Group not found:', groupError || 'Group not found');
            return { error: 'Group not found' };
        }

        const { raid_id } = group;

        // Validate that no character is already assigned to another group in the same raid
        const conflictingCharacters = [];
        for (const member of members) {
            const { data: conflict, error: conflictError } = await supabase
                .from('group_members')
                .select('group_id, groups(group_name)')
                .eq('character_id', member.character_id)
                .eq('groups.raid_id', raid_id)
                .neq('group_id', group_id)
                .single();

            if (conflictError) {
                console.error(`Error checking character ${member.character_id} assignment:`, conflictError);
                return { error: `Error checking character assignment for character ID ${member.character_id}` };
            }

            if (conflict) {
                conflictingCharacters.push({
                    character_id: member.character_id,
                    group_name: conflict.groups.group_name,
                });
            }
        }

        if (conflictingCharacters.length > 0) {
            return {
                error: `One or more characters are already assigned to other groups: ${conflictingCharacters
                    .map(c => `${c.character_id} (${c.group_name})`)
                    .join(', ')}`,
            };
        }

        // Upsert members into group_members table
        const { error: upsertError } = await supabase
            .from('group_members')
            .upsert(
                members.map(member => ({
                    group_id,
                    player_id: member.player_id,
                    character_id: member.character_id,
                })),
                { onConflict: ['group_id', 'player_id', 'character_id'] } // Avoid duplicate records
            );

        if (upsertError) {
            console.error('Error updating group members:', upsertError);
            return { error: 'Error updating group members' };
        }

        console.log('Group members updated successfully:', members);
        return { message: 'Group members updated successfully' };
    } catch (error) {
        console.error('Unexpected error updating group members:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to delete a group and its associated members OPTIMIZED
const deleteGroup = async (group_id) => {
    try {
        // Validate the group ID
        if (!group_id) {
            console.error('Invalid group ID provided for deletion.');
            return { error: 'Invalid group ID' };
        }

        // Delete all members associated with the group
        const { error: memberDeleteError } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group_id);

        if (memberDeleteError) {
            console.error('Error deleting group members:', memberDeleteError);
            return { error: 'Error deleting group members' };
        }

        console.log(`All members of group ID ${group_id} deleted successfully.`);

        // Delete the group itself
        const { data: deletedGroup, error: groupDeleteError } = await supabase
            .from('groups')
            .delete()
            .eq('id', group_id)
            .select('id, group_name, raid_id') // Include raid_id for cache invalidation
            .single();

        if (groupDeleteError || !deletedGroup) {
            console.error('Error deleting group:', groupDeleteError || 'Group not found');
            return { error: 'Group not found' };
        }

        console.log(`Group ID ${group_id} (${deletedGroup.group_name}) deleted successfully.`);

        // Clear the groups cache for the associated raid
        clearGroupsCache(deletedGroup.raid_id);
        console.log(`Cache cleared for raid ID ${deletedGroup.raid_id}.`);

        return { message: `Group "${deletedGroup.group_name}" deleted successfully` };
    } catch (error) {
        console.error('Unexpected error deleting group:', error);
        return { error: 'Unexpected server error' };
    }
};

// Populate raid dropdown from Supabase Storage OPTIMIZED
async function loadRaidsDropdown(raidSelect) {
    try {
        // Fetch raids from Supabase Storage using fetchFromStorage
        const raids = await fetchFromStorage('raids.json');

        if (!raids || raids.length === 0) {
            console.warn('No raids available to populate dropdown.');
            raidSelect.innerHTML = '<option value="" disabled>No raids available</option>';
            return;
        }

        console.log('Populating raid dropdown with:', raids);

        // Populate the dropdown
        raidSelect.innerHTML = '<option value="" disabled selected>Select Raid</option>';
        raids.forEach(raid => {
            const option = document.createElement('option');
            option.value = raid.id; // Use raid ID as the value
            option.setAttribute('data-min-ilvl', raid.min_item_level); // Attach min item level as an attribute
            option.textContent = `${raid.name} (Min IL: ${raid.min_item_level})`;
            raidSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating raid dropdown:', error);
        raidSelect.innerHTML = '<option value="" disabled>Error loading raids</option>';
    }
}

// Generic helper function to populate dropdowns OPTIMIZED
function populateDropdown(dropdownElement, options, placeholder = 'Select an option') {
    dropdownElement.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
    options.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.id;
        if (optionData.dataAttributes) {
            // Add additional attributes dynamically
            Object.entries(optionData.dataAttributes).forEach(([key, value]) => {
                option.setAttribute(key, value);
            });
        }
        option.textContent = optionData.text;
        dropdownElement.appendChild(option);
    });
}

// Fetch groups for a specific raid with caching OPTIMIZED
async function fetchGroupsForRaid(raidId) {
    if (!raidId) {
        console.error('Invalid raid ID provided for fetching groups.');
        return [];
    }

    // Check in-memory cache
    if (cache.groups.has(raidId)) {
        console.log(`Cache hit for groups in raid ID ${raidId}`);
        return cache.groups.get(raidId);
    }

    try {
        // Fetch groups from Supabase
        const { data: groups, error } = await supabase
            .from('groups')
            .select('*')
            .eq('raid_id', raidId);

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        // Cache the fetched groups
        cache.groups.set(raidId, groups);
        console.log(`Groups fetched and cached for raid ID ${raidId}:`, groups);

        return groups;
    } catch (error) {
        console.error('Unexpected error fetching groups:', error);
        return [];
    }
}

// Fetch all players with caching OPTIMIZED
const fetchAllPlayers = async () => {
    const cacheKey = 'all-players';

    // Check in-memory cache first
    if (staticDataCache.has(cacheKey)) {
        console.log('Cache hit for all players.');
        return staticDataCache.get(cacheKey);
    }

    try {
        // Fetch players from Supabase
        const { data: players, error } = await supabase
            .from('players')
            .select('id, username')
            .order('username', { ascending: true });

        if (error) {
            console.error('Error fetching players:', error);
            return { error: 'Error fetching players' };
        }

        // Cache the fetched players in memory
        staticDataCache.set(cacheKey, players);

        console.log('Fetched and cached all players:', players);
        return players;
    } catch (error) {
        console.error('Unexpected error fetching players:', error);
        return { error: 'Unexpected server error' };
    }
};

// Fetch characters of a specific player for a group with caching OPTIMIZED
async function fetchCharactersForPlayer(playerId, groupId) {
    if (!playerId) {
        console.error('Player ID is required to fetch characters.');
        return [];
    }

    const cacheKey = `${playerId}-${groupId}`;

    // Check in-memory cache first
    if (cache.characters.has(cacheKey)) {
        console.log(`Cache hit for characters in player ${playerId}, group ${groupId}`);
        return cache.characters.get(cacheKey);
    }

    try {
        // Fetch characters from the database
        const { data: characters, error } = await supabase
            .from('characters')
            .select(`
                id,
                name,
                item_level,
                classes ( name )
            `)
            .eq('player_id', playerId);

        if (error) {
            console.error('Error fetching characters:', error);
            return [];
        }

        // Cache the fetched characters in memory
        cache.characters.set(cacheKey, characters);

        console.log(`Fetched and cached characters for player ${playerId}, group ${groupId}:`, characters);
        return characters;
    } catch (error) {
        console.error('Unexpected error fetching characters:', error);
        return [];
    }
}

// Query to create a new character OPTIMIZED
const createCharacter = async (player_id, name, item_level, class_id) => {
    // Validate required fields
    if (!player_id || !name || !item_level || !class_id) {
        console.error('All fields are required to add a character.');
        return { error: 'All fields are required to add a character.' };
    }

    try {
        // Insert the new character into the database
        const { data, error } = await supabase
            .from('characters')
            .insert([{ player_id, name, item_level, class_id }])
            .select()
            .single();

        if (error) {
            console.error('Error adding character:', error);
            return { error: 'Error adding character' };
        }

        console.log('Character added successfully:', data);

        // Clear character cache for the associated player
        clearCharactersCache(player_id);

        return { message: 'Character added successfully', character: data };
    } catch (error) {
        console.error('Unexpected error adding character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to delete a character OPTIMIZED
const deleteCharacter = async (character_id, player_id) => {
    if (!character_id || !player_id) {
        console.error('Character ID and Player ID are required to delete a character.');
        return { error: 'Character ID and Player ID are required.' };
    }

    try {
        // Delete the character from the database
        const { data, error } = await supabase
            .from('characters')
            .delete()
            .eq('id', character_id)
            .select('id, name, player_id')
            .single();

        if (error) {
            console.error('Error deleting character:', error);
            return { error: 'Error deleting character' };
        }

        console.log(`Character deleted successfully:`, data);

        // Clear the character cache for the associated player
        clearCharactersCache(player_id);

        return { message: `Character "${data.name}" deleted successfully` };
    } catch (error) {
        console.error('Unexpected error deleting character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to update a character OPTIMIZED
const updateCharacter = async (character_id, player_id, name, item_level) => {
    if (!character_id || !player_id || !name || !item_level) {
        console.error('Character ID, Player ID, Name, and Item Level are required.');
        return { error: 'Character ID, Player ID, Name, and Item Level are required.' };
    }

    try {
        // Update the character in the database
        const { data, error } = await supabase
            .from('characters')
            .update({ name, item_level })
            .eq('id', character_id)
            .select('id, name, item_level, player_id')
            .single();

        if (error) {
            console.error('Error updating character:', error);
            return { error: 'Error updating character' };
        }

        console.log(`Character updated successfully:`, data);

        // Clear the character cache for the associated player
        clearCharactersCache(player_id);

        return { message: `Character "${data.name}" updated successfully`, character: data };
    } catch (error) {
        console.error('Unexpected error updating character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Function to populate characters in a dropdown SUPABASE OPTIMIZED THIS MIGHT BE A CUNT HERE YO
async function populateCharacterDropdown(playerId, groupId, characterSelect) {
    if (!playerId || !groupId) {
        console.error('Player ID and Group ID are required');
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        // Fetch eligible characters from Supabase
        const { data: eligibleCharacters, error } = await supabase
            .from('eligible_characters')
            .select('*')
            .eq('player_id', playerId)
            .eq('group_id', groupId);

        if (error) {
            console.error('Error fetching eligible characters:', error);
            characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
            characterSelect.disabled = true;
            return;
        }

        if (!eligibleCharacters || eligibleCharacters.length === 0) {
            console.warn(`No eligible characters found for player ${playerId} in group ${groupId}`);
            characterSelect.innerHTML = '<option value="" disabled>No eligible characters available</option>';
            characterSelect.disabled = true;
            return;
        }

        // Populate the dropdown
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        eligibleCharacters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.character_id;

            // Determine the character's status
            if (!character.is_eligible) {
                option.disabled = true;
                option.textContent = `${character.character_name} (${character.item_level}) - Ineligible`;
            } else if (character.is_assigned) {
                option.disabled = true;
                option.textContent = `${character.character_name} (${character.item_level}) - Already Assigned`;
            } else {
                option.textContent = `${character.character_name} (${character.item_level})`;
            }

            characterSelect.appendChild(option);
        });

        characterSelect.disabled = false;
    } catch (error) {
        console.error('Unexpected error populating character dropdown:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        characterSelect.disabled = true;
    }
}

// Function to populate players in a dropdown OPTIMIZED
async function populatePlayerDropdown(groupId, playerSelect) {
    if (!groupId) {
        console.error('Group ID is required to populate player dropdown.');
        playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';
        playerSelect.disabled = true;
        return;
    }

    try {
        // Fetch eligible players for the group
        const { eligiblePlayers } = await fetchEligibleCharacters(null, groupId);

        if (!eligiblePlayers || eligiblePlayers.length === 0) {
            console.warn(`No eligible players found for Group: ${groupId}`);
            playerSelect.innerHTML = '<option value="" disabled>No eligible players</option>';
            playerSelect.disabled = true;
            return;
        }

        console.log(`Populating player dropdown for group ${groupId} with players:`, eligiblePlayers);

        // Use the generic helper function to populate the dropdown
        populateDropdown(
            playerSelect,
            eligiblePlayers.map(player => ({
                id: player.id,
                text: player.isDisabled ? `${player.username} - Already Selected` : player.username,
                dataAttributes: { disabled: player.isDisabled ? 'true' : null },
            })),
            'Select Player'
        );

        playerSelect.disabled = false;
    } catch (error) {
        console.error('Error populating player dropdown:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
        playerSelect.disabled = true;
    }
}

let isCreatingGroup = false; // Prevent duplicate submissions
// Function to create a new raid group OPTIMIZED
async function createRaidGroup(raidId, minItemLevel) {
    if (isCreatingGroup) {
        console.warn('A group creation is already in progress.');
        return { error: 'A group creation is already in progress' };
    }
    isCreatingGroup = true;

    try {
        if (!raidId || minItemLevel === null || minItemLevel === undefined) {
            console.error('Raid ID and minimum item level are required.');
            return { error: 'Raid ID and minimum item level are required' };
        }

        // Fetch existing groups to determine the next group name
        const { count: existingGroups, error: countError } = await supabase
            .from('groups')
            .select('*', { count: 'exact' })
            .eq('raid_id', raidId);

        if (countError) {
            console.error('Error counting existing groups:', countError);
            return { error: 'Error counting existing groups' };
        }

        const nextGroupNumber = (existingGroups || 0) + 1;
        const groupName = `Group ${nextGroupNumber}`;

        // Insert the new group into the database
        const { data: newGroup, error: insertError } = await supabase
            .from('groups')
            .insert([{ raid_id: raidId, group_name: groupName, min_item_level: minItemLevel }])
            .select()
            .single();

        if (insertError || !newGroup) {
            console.error('Error creating group:', insertError || 'No data returned');
            return { error: 'Error creating group' };
        }

        console.log(`Group "${newGroup.group_name}" created successfully.`);

        // Clear the groups cache and refresh the UI
        clearGroupsCache(raidId);
        await loadExistingGroups(raidId);
        await disableAssignedCharacters(); // Ensure assigned characters are disabled across all groups

        return { group_name: newGroup.group_name };
    } catch (error) {
        console.error('Unexpected error creating group:', error);
        return { error: 'Unexpected error creating group' };
    } finally {
        isCreatingGroup = false; // Reset the flag to allow further group creation
    }
}

// Function to delete a raid group OPTIMIZED
async function deleteRaidGroup(groupId, raidId) {
    if (!groupId) {
        console.error('Group ID is required to delete a group.');
        return { error: 'Group ID is required' };
    }

    try {
        // Delete all members associated with the group
        const { error: membersError } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId);

        if (membersError) {
            console.error(`Error deleting members for group ID ${groupId}:`, membersError);
            return { error: 'Error deleting group members' };
        }

        console.log(`All members of group ID ${groupId} deleted successfully.`);

        // Delete the group itself
        const { data: deletedGroup, error: groupError } = await supabase
            .from('groups')
            .delete()
            .eq('id', groupId)
            .select('id, group_name')
            .single();

        if (groupError || !deletedGroup) {
            console.error(`Error deleting group ID ${groupId}:`, groupError || 'Group not found');
            return { error: 'Error deleting raid group' };
        }

        console.log(`Raid group "${deletedGroup.group_name}" deleted successfully.`);

        // Clear cache and refresh UI
        clearGroupsCache(raidId); // Invalidate the cache for the associated raid
        await loadExistingGroups(raidId); // Refresh the UI with updated group data

        return { success: true, message: `Group "${deletedGroup.group_name}" deleted successfully` };
    } catch (error) {
        console.error('Unexpected error deleting raid group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to reset a group OPTIMIZED
async function resetGroup(groupId) {
    if (!groupId) {
        console.error('Group ID is required to reset the group');
        return { error: 'Group ID is required' };
    }

    try {
        // Clear group members in the database
        const { error } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId);

        if (error) {
            console.error('Error clearing group members:', error);
            return { error: 'Error clearing group members' };
        }

        console.log(`Group members for group ID ${groupId} cleared successfully.`);

        // Reset dropdowns in the UI
        const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
        if (!groupElement) return;

        const playerSelects = groupElement.querySelectorAll('.player-select');
        const characterSelects = groupElement.querySelectorAll('.character-select');

        for (const playerSelect of playerSelects) {
            await populatePlayerDropdown(groupId, playerSelect);
        }

        characterSelects.forEach(characterSelect => {
            characterSelect.value = '';
            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
            characterSelect.disabled = true;
        });

        return { success: true };
    } catch (error) {
        console.error('Unexpected error resetting group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to save group members and prevent duplicate character assignments OPTIMIZED
async function saveGroupMembers(groupId, members) {
    if (!groupId || !members || members.length === 0) {
        console.error('Group ID and valid members data are required');
        return { error: 'Group ID and valid members data are required' };
    }

    try {
        // Fetch the group to determine raid_id
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('raid_id')
            .eq('id', groupId)
            .single();

        if (groupError) {
            console.error('Error fetching group details:', groupError);
            return { error: 'Error fetching group details' };
        }

        if (!group) {
            console.error('Group not found.');
            return { error: 'Group not found' };
        }

        const raidId = group.raid_id;

        // Validate that no character is already assigned to another group in the same raid
        const assignedCharacterIds = new Set();

        for (const member of members) {
            const { data: conflicts, error: conflictError } = await supabase
                .from('group_members')
                .select('group_id, groups(group_name)')
                .eq('character_id', member.character_id)
                .eq('groups.raid_id', raidId)
                .neq('group_id', groupId);

            if (conflictError) {
                console.error('Error checking character assignments:', conflictError);
                return { error: 'Error checking character assignments' };
            }

            if (conflicts && conflicts.length > 0) {
                assignedCharacterIds.add(member.character_id);
                return { error: `Character is already assigned to ${conflicts[0].groups.group_name} in this raid.` };
            }
        }

        if (assignedCharacterIds.size > 0) {
            console.warn('Some characters are already assigned and cannot be added:', [...assignedCharacterIds]);
            return { error: 'Some characters are already assigned and cannot be added to this group.' };
        }

        // Add group_id to each member before upserting
        const membersWithGroupId = members.map(member => ({
            ...member,
            group_id: groupId, // Ensure group_id is included
        }));

        const { error } = await supabase
            .from('group_members')
            .upsert(membersWithGroupId, { onConflict: ['group_id', 'player_id', 'character_id'] });

        if (error) {
            console.error('Error saving group members:', error);
            return { error: 'Error saving group members' };
        }

        console.log('Group members saved successfully');

        // Disable dropdown options for already assigned characters
        await disableAssignedCharacters();

        return { success: true };
    } catch (error) {
        console.error('Unexpected error saving group members:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to load existing groups SUPABASE OPTIMIZED
async function loadExistingGroups(raidId = null) {
    try {
        // Fetch groups with slots
        const groups = await fetchGroupsWithSlots(raidId);

        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = ''; // Clear previous content to prevent duplicates

        if (!groups || groups.length === 0) {
            console.log('No groups found for the selected raid.');
            return;
        }

        for (const group of groups) {
            // Create group container
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('raid-group');
            groupDiv.setAttribute('data-group-id', group.id);
            groupDiv.setAttribute('data-raid-id', group.raid_id);

            // Create group header
            const groupHeader = createGroupHeader(group, groupDiv);
            groupDiv.appendChild(groupHeader);

            // Add player list container
            const playerListContainer = document.createElement('div');
            playerListContainer.classList.add('player-list', 'mt-2');
            playerListContainer.textContent = 'Loading players...';
            groupDiv.appendChild(playerListContainer);

            // Create assignment table
            const table = createAssignmentTable(group.id);
            groupDiv.appendChild(table);

            groupsContainer.appendChild(groupDiv);

            // Populate player dropdowns
            const playerSelects = groupDiv.querySelectorAll('.player-select');
            for (const select of playerSelects) {
                await populatePlayerDropdown(group.id, select);
            }

            // Populate character dropdowns
            const characterSelects = groupDiv.querySelectorAll('.character-select');
            for (const select of characterSelects) {
                await populateCharacterDropdown(null, group.id, select);
            }

            // Update player list and disable already assigned players/characters
            await updatePlayerList(group.id, playerListContainer);
        }

        // Disable already assigned characters across all groups
        await disableAssignedCharacters();
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Function to create group header - might need to move to storage
function createGroupHeader(group, groupDiv) {
    const groupHeader = document.createElement('div');
    groupHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');

    const headerText = document.createElement('h3');
    headerText.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;
    groupHeader.appendChild(headerText);

    const minimizeButton = document.createElement('button');
    minimizeButton.textContent = '−';
    minimizeButton.classList.add('btn', 'btn-secondary', 'btn-sm', 'ml-auto');
    minimizeButton.onclick = () => {
        const table = groupDiv.querySelector('.assignment-table');
        table.style.display = table.style.display === 'none' ? 'table' : 'none';
        minimizeButton.textContent = table.style.display === 'none' ? '+' : '−';
    };
    groupHeader.appendChild(minimizeButton);

    addGroupButtons(group, groupDiv, groupHeader);

    return groupHeader;
}

// Function to add group buttons - might need to move to storage
function addGroupButtons(group, groupDiv, groupHeader) {
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.classList.add('btn', 'btn-primary', 'btn-sm');
    saveButton.onclick = async () => handleSaveGroup(group.id, groupDiv);
    groupHeader.appendChild(saveButton);

    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear';
    clearButton.classList.add('btn', 'btn-warning', 'btn-sm');
    clearButton.onclick = async () => resetGroup(group.id, groupDiv);
    groupHeader.appendChild(clearButton);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.classList.add('btn', 'btn-danger', 'btn-sm');
    deleteButton.onclick = async () => deleteGroup(group.id, group.raid_id);
    groupHeader.appendChild(deleteButton);
}
// Function to create table - might need to move to storage
function createAssignmentTable(groupId) {
    const table = document.createElement('table');
    table.classList.add('assignment-table');

    // Add Party Headers
    const partyHeaderRow = document.createElement('tr');
    partyHeaderRow.innerHTML = `
        <th colspan="3">Party 1</th>
        <th colspan="3">Party 2</th>
    `;
    table.appendChild(partyHeaderRow);

    // Add Roles for Players and Characters
    const roleHeaderRow = document.createElement('tr');
    roleHeaderRow.innerHTML = `
        <th>Player</th>
        <th>Character</th>
        <th>Role</th>
        <th>Player</th>
        <th>Character</th>
        <th>Role</th>
    `;
    table.appendChild(roleHeaderRow);

    // Add Rows for Party 1 and Party 2
    for (let i = 0; i < 4; i++) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <select class="player-select form-control">
                    <option value="" disabled selected>Select Player</option>
                </select>
            </td>
            <td>
                <select class="character-select form-control" disabled>
                    <option value="" disabled selected>Select Character</option>
                </select>
            </td>
            <td>${i < 3 ? 'DPS' : 'Support'}</td>
            <td>
                <select class="player-select form-control">
                    <option value="" disabled selected>Select Player</option>
                </select>
            </td>
            <td>
                <select class="character-select form-control" disabled>
                    <option value="" disabled selected>Select Character</option>
                </select>
            </td>
            <td>${i < 3 ? 'DPS' : 'Support'}</td>
        `;
        table.appendChild(row);
    }

    return table;
}

// Function to dynamically update the player list OPTIMIZED
async function updatePlayerList(groupId, container) {
    if (!groupId) {
        console.error('Group ID is required to update the player list.');
        container.textContent = 'Error: Invalid group ID.';
        return;
    }

    try {
        // Fetch group members from the database
        const { data: members, error } = await supabase
            .from('group_members')
            .select(`
                players (username),
                characters (name, item_level, classes (name))
            `)
            .eq('group_id', groupId);

        if (error) {
            console.error(`Error fetching group members for group ID ${groupId}:`, error);
            container.textContent = 'Error fetching player list.';
            return;
        }

        if (!members || members.length === 0) {
            container.textContent = 'No players added yet.';
            return;
        }

        // Format the player list as: PlayerName(Classname, ItemLevel), ...
        const playerList = members.map(member => {
            const username = member.players?.username || 'Unknown Player';
            const className = member.characters?.classes?.name || 'Unknown Class';
            const itemLevel = member.characters?.item_level || 'N/A';
            return `${username} (${className}, ${itemLevel})`;
        });

        // Update the container with the formatted list
        container.textContent = playerList.join(', ');
        console.log(`Player list updated for group ID ${groupId}:`, playerList);
    } catch (error) {
        console.error(`Unexpected error updating player list for group ID ${groupId}:`, error);
        container.textContent = 'Error updating player list.';
    }
}

// Update slots count dynamically SUPABASE OPTIMIZED
async function updateGroupSlots(groupId, headerTextElement) {
    if (!groupId || !headerTextElement) {
        console.error('Group ID and header text element are required to update group slots.');
        return;
    }

    try {
        // Fetch the specific group data with slots
        const { data: group, error } = await supabase
            .from('groups')
            .select(`
                id,
                group_name,
                min_item_level,
                raid_id,
                raids (name),
                group_members (id)
            `)
            .eq('id', groupId)
            .single();

        if (error) {
            console.error(`Error fetching group details for group ID ${groupId}:`, error);
            return;
        }

        if (!group) {
            console.warn(`Group ID ${groupId} not found.`);
            return;
        }

        // Calculate the filled and total slots
        const filledSlots = group.group_members.length || 0;
        const totalSlots = 8; // Assuming each group has 8 slots

        // Update the header text element
        headerTextElement.textContent = `${group.raids.name || 'Unknown Raid'} (Min IL: ${group.min_item_level}) - ${group.group_name} (${filledSlots}/${totalSlots})`;

        console.log(`Group slots updated for group ID ${groupId}: ${filledSlots}/${totalSlots}`);
    } catch (error) {
        console.error(`Unexpected error updating slots for group ID ${groupId}:`, error);
    }
}

// Function to load players to add players page SUPABASE OPTIMIZED
async function loadPlayersForAddPage(playerSelect) {
    if (!playerSelect) {
        console.error('Player select element is required to load players.');
        return;
    }

    try {
        // Fetch eligible players (all players in this context)
        const { data: players, error } = await supabase
            .from('players')
            .select('id, username')
            .order('username', { ascending: true });

        if (error) {
            console.error('Error fetching players for add page:', error);
            playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
            playerSelect.disabled = true;
            return;
        }

        if (!players || players.length === 0) {
            console.warn('No players available to populate dropdown.');
            playerSelect.innerHTML = '<option value="" disabled>No players available</option>';
            playerSelect.disabled = true;
            return;
        }

        console.log('Populating players dropdown for add page:', players);

        // Use the generic dropdown helper to populate
        populateDropdown(
            playerSelect,
            players.map(player => ({
                id: player.id,
                text: player.username,
            })),
            'Select Player'
        );

        playerSelect.disabled = false;
    } catch (error) {
        console.error('Unexpected error loading players for add page:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
        playerSelect.disabled = true;
    }
}

// Function to load classes to add players page SUPABASE OPTIMIZED
async function loadClassesForAddPage(classSelect) {
    if (!classSelect) {
        console.error('Class select element is required to load classes.');
        return;
    }

    try {
        // Fetch classes from static-data bucket
        const classes = await fetchFromStorage('classes.json');

        if (!classes || classes.length === 0) {
            console.warn('No classes available to populate dropdown.');
            classSelect.innerHTML = '<option value="" disabled>No classes available</option>';
            classSelect.disabled = true;
            return;
        }

        console.log('Populating classes dropdown for add page:', classes);

        // Use the generic dropdown helper to populate
        populateDropdown(
            classSelect,
            classes.map(characterClass => ({
                id: characterClass.id,
                text: characterClass.name,
            })),
            'Select Class'
        );

        classSelect.disabled = false;
    } catch (error) {
        console.error('Unexpected error loading classes for add page:', error);
        classSelect.innerHTML = '<option value="" disabled>Error loading classes</option>';
        classSelect.disabled = true;
    }
}

// Function to load characters of a player in add players page SUPABASE OPTIMIZED
async function loadCharactersForPlayer(playerId, characterSelect) {
    if (!playerId) {
        console.error('Player ID is required to load characters.');
        characterSelect.innerHTML = '<option value="" disabled selected>Select Player First</option>';
        characterSelect.disabled = true;
        return;
    }

    if (!characterSelect) {
        console.error('Character select element is required to load characters.');
        return;
    }

    try {
        // Fetch characters for the selected player
        const characters = await fetchCharactersForPlayer(playerId);

        if (!characters || characters.length === 0) {
            console.warn(`No characters found for player ID ${playerId}.`);
            characterSelect.innerHTML = '<option value="" disabled>No characters available</option>';
            characterSelect.disabled = true;
            return;
        }

        console.log(`Populating characters dropdown for player ID ${playerId}:`, characters);

        // Use the generic dropdown helper to populate
        populateDropdown(
            characterSelect,
            characters.map(character => ({
                id: character.id,
                text: `${character.name} (${character.classes.name}, IL: ${character.item_level})`,
            })),
            'Select Character'
        );

        characterSelect.disabled = false;
    } catch (error) {
        console.error(`Unexpected error loading characters for player ID ${playerId}:`, error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        characterSelect.disabled = true;
    }
}

// Function to add a new player in add players page SUPABASE OPTIMIZED
async function addNewPlayer() {
    const usernameInput = document.getElementById('username-input');
    if (!usernameInput) {
        console.error('Username input field not found.');
        alert('Error: Username input field is missing!');
        return;
    }

    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a valid username.');
        return;
    }

    try {
        // Add player to the database
        const { data, error } = await supabase
            .from('players')
            .insert([{ username }])
            .select()
            .single();

        if (error) {
            console.error('Error adding player:', error);
            alert('Error adding player.');
            return;
        }

        console.log(`Player "${username}" added successfully:`, data);

        // Clear the input field
        usernameInput.value = '';

        // Optionally refresh the player dropdown
        const playerSelect = document.getElementById('player-select');
        if (playerSelect) {
            await loadPlayersForAddPage(playerSelect); // Refresh the dropdown
        }

        alert('Player added successfully!');
    } catch (error) {
        console.error('Unexpected error adding player:', error);
        alert('Unexpected error adding player.');
    }
}

// Function to add a new character to the selected player in add players page SUPABASE OPTIMIZED
async function addNewCharacter(playerSelect, characterNameInput, itemLevelInput, classSelect) {
    const playerId = playerSelect?.value;
    const name = characterNameInput?.value.trim();
    const itemLevel = parseInt(itemLevelInput?.value, 10);
    const classId = classSelect?.value;

    if (!playerId || !name || isNaN(itemLevel) || !classId) {
        alert('All fields are required to add a character.');
        return;
    }

    try {
        // Add the character to the database
        const { data, error } = await supabase
            .from('characters')
            .insert([{ player_id: playerId, name, item_level: itemLevel, class_id: classId }])
            .select()
            .single();

        if (error) {
            console.error('Error adding character:', error);
            alert('Error adding character.');
            return;
        }

        console.log(`Character "${name}" added successfully for Player ID ${playerId}:`, data);

        // Clear input fields and reset dropdowns
        characterNameInput.value = '';
        itemLevelInput.value = '';
        classSelect.value = '';
        playerSelect.value = playerId; // Retain the selected player in the dropdown

        // Clear the character cache and refresh the dropdown
        clearCharactersCache(playerId);
        const characterSelect = document.getElementById('character-select');
        if (characterSelect) {
            await loadCharactersForPlayer(playerId, characterSelect); // Refresh the dropdown
        }

        alert('Character added successfully!');
    } catch (error) {
        console.error('Unexpected error adding character:', error);
        alert('Unexpected error adding character.');
    }
}

// Function to update character in add players page SUPABASE OPTIMIZED
async function updateCharacterDetails(characterSelect, characterNameInput, itemLevelInput) {
    const characterId = characterSelect?.value;
    const name = characterNameInput?.value.trim();
    const itemLevel = parseInt(itemLevelInput?.value, 10);

    if (!characterId || !name || isNaN(itemLevel)) {
        alert('All fields are required to update the character.');
        return;
    }

    try {
        // Update the character in the database
        const { error } = await supabase
            .from('characters')
            .update({ name, item_level: itemLevel })
            .eq('id', characterId);

        if (error) {
            console.error('Error updating character:', error);
            alert('Error updating character.');
            return;
        }

        console.log(`Character ID ${characterId} updated successfully with Name: "${name}", IL: ${itemLevel}.`);

        // Clear character cache and refresh the dropdown
        const playerId = characterSelect.dataset.playerId || characterSelect.getAttribute('data-player-id');
        if (playerId) {
            clearCharactersCache(playerId);
            const characterDropdown = document.getElementById('character-select');
            if (characterDropdown) {
                await loadCharactersForPlayer(playerId, characterDropdown);
            }
        }

        alert('Character updated successfully!');
    } catch (error) {
        console.error('Unexpected error updating character:', error);
        alert('Unexpected error updating character.');
    }
}

// Function to update group UI dynamically OPTIMIZED
async function updateGroupUI(groupId) {
    if (!groupId) {
        console.error('Group ID is required to update the group UI.');
        return;
    }

    const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
    if (!groupElement) {
        console.warn(`Group element for group ID ${groupId} not found in the UI.`);
        return;
    }

    try {
        // Fetch updated group members
        const { data: members, error } = await supabase
            .from('group_members')
            .select(`
                players (username),
                characters (name, item_level, classes (name))
            `)
            .eq('group_id', groupId);

        if (error) {
            console.error(`Error fetching members for group ID ${groupId}:`, error);
            const memberList = groupElement.querySelector('.member-list');
            if (memberList) memberList.innerHTML = '<p>Error loading members.</p>';
            return;
        }

        const memberList = groupElement.querySelector('.member-list');
        if (!members || members.length === 0) {
            if (memberList) memberList.innerHTML = '<p>No members yet.</p>';
            return;
        }

        console.log(`Updating group UI for group ID ${groupId} with members:`, members);

        // Clear the member list and repopulate it
        if (memberList) {
            memberList.innerHTML = '';
            members.forEach(member => {
                const memberItem = document.createElement('div');
                const username = member.players?.username || 'Unknown Player';
                const characterName = member.characters?.name || 'Unknown Character';
                const className = member.characters?.classes?.name || 'Unknown Class';
                const itemLevel = member.characters?.item_level || 'N/A';

                memberItem.textContent = `${username} (${characterName}, ${className}, IL: ${itemLevel})`;
                memberList.appendChild(memberItem);
            });
        }

        // Optional: Update any other UI elements related to the group
    } catch (error) {
        console.error(`Unexpected error updating group UI for group ID ${groupId}:`, error);
        const memberList = groupElement.querySelector('.member-list');
        if (memberList) memberList.innerHTML = '<p>Error loading members.</p>';
    }
}

// Function to delete character in add players page SUPABASE OPTIMIZED
async function deleteCharacterFromPlayer(characterSelect) {
    const characterId = characterSelect?.value;

    if (!characterId) {
        alert('Please select a character to delete.');
        return;
    }

    if (!confirm('Are you sure you want to delete this character?')) {
        return;
    }

    try {
        // Delete the character from the database
        const { error } = await supabase
            .from('characters')
            .delete()
            .eq('id', characterId);

        if (error) {
            console.error(`Error deleting character ID ${characterId}:`, error);
            alert('Error deleting character.');
            return;
        }

        console.log(`Character ID ${characterId} deleted successfully.`);

        // Clear character select and refresh the dropdown
        const playerId = characterSelect.dataset.playerId || characterSelect.getAttribute('data-player-id');
        if (playerId) {
            clearCharactersCache(playerId); // Clear the cache for this player
            const characterDropdown = document.getElementById('character-select');
            if (characterDropdown) {
                await loadCharactersForPlayer(playerId, characterDropdown); // Refresh the dropdown
            }
        }

        alert('Character deleted successfully!');
    } catch (error) {
        console.error(`Unexpected error deleting character ID ${characterId}:`, error);
        alert('Unexpected error deleting character.');
    }
}

// Initialize on DOM content loaded OPTIMIZED
document.addEventListener('DOMContentLoaded', () => {
    // Async wrapper for initialization logic
    (async function initialize() {
        // Initialize caches from localStorage on page load
        const initializeCache = () => {
            for (const key in localStorage) {
                if (key.startsWith('players-')) {
                    const groupId = key.split('-')[1];
                    cache.players.set(groupId, JSON.parse(localStorage.getItem(key)));
                }
                if (key.startsWith('characters-')) {
                    const cacheKey = key.split('-').slice(1).join('-');
                    cache.characters.set(cacheKey, JSON.parse(localStorage.getItem(key)));
                }
            }
            const storedRaids = JSON.parse(localStorage.getItem('raids'));
            if (storedRaids) cache.raids = storedRaids;

            console.log('Caches initialized:', cache);
        };

        initializeCache();

        // Identify the page by checking for specific elements
        const raidSelect = document.getElementById('raid-select'); // For the Raid Organizer page
        const playerForm = document.getElementById('player-form'); // For the Add Player / Character page

        // Raid Organizer Page
        if (raidSelect) {
            console.log('Initializing raid dropdown...');
            await loadRaidsDropdown(raidSelect); // Load raids from Supabase Storage
            await loadExistingGroups(); // Load groups initially

            // Refresh groups based on raid selection
            raidSelect.addEventListener('change', async () => {
                const selectedRaidId = raidSelect.value || null;
                console.log('Raid changed. Loading groups for raid:', selectedRaidId);
                await loadExistingGroups(selectedRaidId);
            });

            // Create a new raid group
            document.getElementById('create-raid-btn')?.addEventListener('click', async (event) => {
                event.preventDefault();
                const createButton = event.target;
                const selectedOption = raidSelect.options[raidSelect.selectedIndex];

                createButton.disabled = true; // Prevent duplicate submissions

                if (!selectedOption || !selectedOption.value) {
                    alert('Please select a raid to create a group.');
                    createButton.disabled = false;
                    return;
                }

                const raidId = selectedOption.value;
                const minItemLevel = selectedOption.getAttribute('data-min-ilvl');

                if (!raidId || !minItemLevel) {
                    alert('Invalid raid selection or missing minimum item level.');
                    createButton.disabled = false;
                    return;
                }

                try {
                    createButton.textContent = 'Creating...';
                    const result = await createRaidGroup(raidId, parseInt(minItemLevel, 10));

                    if (result.error) {
                        console.error(`Error creating group: ${result.error}`);
                    } else {
                        await loadExistingGroups();
                    }
                } catch (error) {
                    console.error('Unexpected error creating group:', error);
                } finally {
                    createButton.disabled = false;
                    createButton.textContent = 'Create Raid Group';
                }
            });

            // Realtime listener for groups
            supabase
                .channel('groups-realtime')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'groups' },
                    payload => {
                        console.log('Groups table changed:', payload);
                        loadExistingGroups(payload.new?.raid_id || null);
                    }
                )
                .subscribe();
        }

        // Add Player / Character Page
        if (playerForm) {
            const playerSelect = document.getElementById('player-select');
            const classSelect = document.getElementById('class-select');
            const characterSelect = document.getElementById('character-select');

            console.log('Initializing player form...');
            await loadClassesForAddPage(classSelect); // Load classes from Supabase Storage
            await loadPlayersForAddPage(playerSelect); // Populate players

            // Load characters for selected player
            playerSelect?.addEventListener('change', async (event) => {
                await loadCharactersForPlayer(event.target.value, characterSelect);
            });

            // Add a new player
            document.getElementById('add-player-btn')?.addEventListener('click', async () => {
                const usernameInput = document.getElementById('username-input');
                if (usernameInput.value.trim() === '') {
                    alert('Please enter a valid username.');
                    return;
                }
                await addNewPlayer(usernameInput);
                await loadPlayersForAddPage(playerSelect); // Refresh player dropdown
            });

            // Add a new character
            document.getElementById('add-character-btn')?.addEventListener('click', async () => {
                const characterNameInput = document.getElementById('character-name-input');
                const itemLevelInput = document.getElementById('item-level-input');
                if (!playerSelect.value || !characterNameInput.value || !itemLevelInput.value) {
                    alert('Please fill in all fields to add a character.');
                    return;
                }
                await addNewCharacter(playerSelect, characterNameInput, itemLevelInput, classSelect);
                await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh character dropdown
            });

            // Update character details
            document.getElementById('update-character-btn')?.addEventListener('click', async () => {
                const characterNameInput = document.getElementById('character-name-input');
                const itemLevelInput = document.getElementById('item-level-input');
                if (!characterSelect.value || !characterNameInput.value || !itemLevelInput.value) {
                    alert('Please select a character and provide updated details.');
                    return;
                }
                await updateCharacterDetails(characterSelect, characterNameInput, itemLevelInput);
                await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh character dropdown
            });

            // Delete a character
            document.getElementById('delete-character-btn')?.addEventListener('click', async () => {
                if (!characterSelect.value) {
                    alert('Please select a character to delete.');
                    return;
                }
                await deleteCharacterFromPlayer(characterSelect);
                await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh character dropdown
            });

            // Realtime listener for group members
            supabase
                .channel('group-members-realtime')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'group_members' },
                    payload => {
                        console.log('Group members table changed:', payload);
                        updateGroupUI(payload.new?.group_id || payload.old?.group_id);
                    }
                )
                .subscribe();
        }

        // Dynamic event binding for player-select in raid groups
        document.addEventListener('change', async (event) => {
            const playerSelect = event.target.closest('.player-select');
            if (!playerSelect) return;

            const playerId = playerSelect.value;
            const groupElement = playerSelect.closest('.raid-group');
            const groupId = groupElement?.getAttribute('data-group-id');
            const characterSelect = playerSelect.closest('td')?.nextElementSibling?.querySelector('.character-select');

            if (!groupId || !characterSelect) {
                console.error('Invalid group or character dropdown context');
                return;
            }

            characterSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
            characterSelect.disabled = true;

            try {
                await populateCharacterDropdown(playerId, groupId, characterSelect);
                characterSelect.disabled = false;
            } catch (error) {
                console.error('Error fetching characters for player selection:', error);
                characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
                characterSelect.disabled = true;
            }
        });
    })();
});
