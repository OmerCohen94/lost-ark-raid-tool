
const SUPABASE_URL = 'https://jlqfmqfhsyxxsbteykxz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZtcWZoc3l4eHNidGV5a3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1MzQ0NDUsImV4cCI6MjA1MjExMDQ0NX0.yU6iCVBt_-2lW0WkSNEmcGKyz_R7rN77IRB-ZggH-vE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to fetch static data from SUPABASE
async function fetchFromStorage(filePath) {
    try {
        const { data, error } = await supabase.storage
            .from('static-data') // Use the correct bucket name
            .download(filePath);

        if (error) {
            console.error(`Error fetching ${filePath} from storage:`, error);
            return null;
        }

        const text = await data.text(); // Convert the file content to text
        console.log(`Fetched data from ${filePath}:`, text);
        return JSON.parse(text); // Parse and return JSON
    } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return null;
    }
}

// Function to load classes into dropdowns
async function loadClassesDropdown(dropdownElement) {
    const classes = await fetchFromStorage('classes.json'); // Replace with your file path

    if (!classes) {
        dropdownElement.innerHTML = '<option value="" disabled>Error loading classes</option>';
        return;
    }

    dropdownElement.innerHTML = '<option value="" disabled selected>Select Class</option>';
    classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id;
        option.textContent = cls.name;
        dropdownElement.appendChild(option);
    });
}

// Function to load raids into dropdowns
async function fetchRaids() {
    if (cache.raids) return cache.raids; // In-memory cache

    const storedRaids = localStorage.getItem('raids');
    if (storedRaids) {
        cache.raids = JSON.parse(storedRaids);
        return cache.raids;
    }

    try {
        const raids = await fetchFromStorage('raids.json'); // Fetch from Supabase Storage
        if (raids) {
            cache.raids = raids; // Cache in memory
            localStorage.setItem('raids', JSON.stringify(raids)); // Persist to localStorage
        }
        return raids || [];
    } catch (error) {
        console.error('Error fetching raids:', error);
        return [];
    }
}

// Cache
const cache = {
    players: new Map(),
    characters: new Map(),
    raids: null,
    groups: new Map(),
};

// Clear Players Cache
function clearPlayersCache(groupId = null) {
    if (groupId) {
        cache.players.delete(groupId);
        localStorage.removeItem(`players-${groupId}`);
    } else {
        cache.players.clear();
        for (const key in localStorage) {
            if (key.startsWith('players-')) localStorage.removeItem(key);
        }
    }
}

// Clear Characters Cache
function clearCharactersCache(playerId, groupId = null) {
    if (groupId) {
        const cacheKey = `${playerId}-${groupId}`;
        cache.characters.delete(cacheKey);
        localStorage.removeItem(`characters-${cacheKey}`);
    } else {
        cache.characters.clear();
        for (const key in localStorage) {
            if (key.startsWith('characters-')) localStorage.removeItem(key);
        }
    }
}

// Clear Raids Cache
function clearRaidsCache() {
    cache.raids = null;
    localStorage.removeItem('raids');
}

// Clear Groups Cache
function clearGroupsCache(raidId = null) {
    if (raidId) {
        cache.groups.delete(raidId);
    } else {
        cache.groups.clear();
    }
}

// Updated fetchEligibleCharacters to handle null playerId
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

        // Fetch eligible characters only if playerId is provided
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

        // Fetch all players and check their eligibility
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('id, username');

        if (playersError) {
            console.error('Error fetching players:', playersError);
            return { eligiblePlayers: [], eligibleCharacters };
        }

        // Disable players who are already selected in the group
        const eligiblePlayers = players.map(player => ({
            ...player,
            isDisabled: eligibleCharacters.some(
                char => char.player_id === player.id && char.is_assigned
            )
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

// Get raids from cache
async function fetchRaids() {
    if (cache.raids) return cache.raids; // In-memory cache

    const storedRaids = localStorage.getItem('raids');
    if (storedRaids) {
        cache.raids = JSON.parse(storedRaids);
        return cache.raids;
    }

    try {
        const raids = await fetchFromStorage('raids.json');
        if (raids) {
            cache.raids = raids;
            localStorage.setItem('raids', JSON.stringify(raids));
        }
        return raids || [];
    } catch (error) {
        console.error('Error fetching raids:', error);
        return [];
    }
}

// Query to get groups
async function fetchGroupsWithSlots(raidId = null) {
    try {
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

        if (raidId) query.eq('raid_id', raidId);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        // Calculate slots for each group
        const groupsWithSlots = data.map(group => ({
            ...group,
            raid_name: group.raids?.name || 'Unknown Raid',
            filled_slots: group.group_members.length || 0,
            total_slots: 8, // Assuming 8 slots per group
        }));

        return groupsWithSlots;
    } catch (error) {
        console.error('Unexpected error fetching groups with slots:', error);
        return [];
    }
}

// Query to add new player
async function addNewPlayer(usernameInput) {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a valid username.');
        return;
    }

    try {
        const result = await addPlayer(username);

        if (result.error) {
            console.error('Error adding player:', result.error);
            alert(`Error: ${result.error}`);
        } else {
            alert('Player added successfully!');
            usernameInput.value = ''; // Clear the input field

            clearPlayersCache(); // Clear players cache to refresh player dropdowns
        }
    } catch (error) {
        console.error('Unexpected error adding player:', error);
        alert('Unexpected error adding player.');
    }
}

// Query to get players for group dropdown
async function fetchPlayersForGroup(groupId) {
    // Check in-memory cache first
    if (cache.players.has(groupId)) {
        console.log(`Cache hit for players in group ${groupId}`);
        return cache.players.get(groupId);
    }

    try {
        // Fetch from database
        const { data, error } = await supabase
            .from('players')
            .select('id, username');

        if (error) {
            console.error('Error fetching players:', error);
            return [];
        }

        // Cache the results in memory and localStorage
        cache.players.set(groupId, data);
        localStorage.setItem(`players-${groupId}`, JSON.stringify(data));

        return data;
    } catch (error) {
        console.error('Unexpected error fetching players:', error);
        return [];
    }
}

// Function to fetch group members
function fetchGroupMembers(groupDiv) {
    const groupId = parseInt(groupDiv.getAttribute('data-group-id'), 10);

    if (isNaN(groupId)) {
        console.error('Invalid group ID:', groupDiv);
        return [];
    }

    const rows = groupDiv.querySelectorAll('.assignment-table tr');
    const members = [];

    rows.forEach(row => {
        const playerSelect = row.querySelector('.player-select');
        const characterSelect = row.querySelector('.character-select');

        if (playerSelect && characterSelect && playerSelect.value && characterSelect.value) {
            members.push({
                player_id: parseInt(playerSelect.value, 10),
                character_id: parseInt(characterSelect.value, 10)
            });
        }
    });

    return members;
}

// Query to save members in specific group
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
        for (const member of members) {
            const { data: conflict, error: conflictError } = await supabase
                .from('group_members')
                .select('group_id, groups(group_name)')
                .eq('character_id', member.character_id)
                .eq('groups.raid_id', raid_id)
                .neq('group_id', group_id)
                .single();

            if (conflictError === null && conflict) {
                return { error: `Character is already assigned to ${conflict.groups.group_name} in this raid.` };
            }
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
                { onConflict: ['group_id', 'player_id'] }
            );

        if (upsertError) {
            console.error('Error updating group members:', upsertError);
            return { error: 'Error updating group members' };
        }

        return { message: 'Group members updated successfully' };
    } catch (error) {
        console.error('Unexpected error updating group members:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to delete group
const deleteGroup = async (group_id) => {
    try {
        // Delete all members associated with the group
        const { error: memberDeleteError } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group_id);

        if (memberDeleteError) {
            console.error('Error deleting group members:', memberDeleteError);
            return { error: 'Error deleting group members' };
        }

        // Delete the group itself
        const { data: deletedGroup, error: groupDeleteError } = await supabase
            .from('groups')
            .delete()
            .eq('id', group_id)
            .select('id')
            .single();

        if (groupDeleteError || !deletedGroup) {
            console.error('Error deleting group:', groupDeleteError || 'Group not found');
            return { error: 'Group not found' };
        }

        return { message: 'Group deleted successfully' };
    } catch (error) {
        console.error('Unexpected error deleting group:', error);
        return { error: 'Unexpected server error' };
    }
};

// Get raids into dropdowns
async function loadRaidsDropdown(raidSelect) {
    try {
        const raids = await fetchRaids(); // Fetch raids from cache or storage

        if (!raids || raids.length === 0) {
            console.warn('No raids available to populate dropdown');
            raidSelect.innerHTML = '<option value="" disabled>No raids available</option>';
            return;
        }

        console.log('Populating raid dropdown with:', raids); // Debug log

        // Populate the dropdown
        raidSelect.innerHTML = '<option value="" disabled selected>Select Raid</option>';
        raids.forEach(raid => {
            const option = document.createElement('option');
            option.value = raid.id; // Ensure `id` matches the raid identifier
            option.setAttribute('data-min-ilvl', raid.min_item_level);
            option.textContent = `${raid.name} (Min IL: ${raid.min_item_level})`;
            raidSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating raid dropdown:', error);
        raidSelect.innerHTML = '<option value="" disabled>Error loading raids</option>';
    }
}

// Helper function to populate the raid dropdown
function populateRaidDropdown(raidSelect, raids) {
    raidSelect.innerHTML = '<option value="" disabled selected>Select Raid</option>';
    raids.forEach(raid => {
        const option = document.createElement('option');
        option.value = raid.id;
        option.setAttribute('data-min-ilvl', raid.min_item_level);
        option.textContent = `${raid.name} (Min IL: ${raid.min_item_level})`;
        raidSelect.appendChild(option);
    });
}


// da fuck 2
async function fetchGroupsForRaid(raidId) {
    if (cache.groups.has(raidId)) return cache.groups.get(raidId);

    try {
        const { data: groups, error } = await supabase
            .from('groups')
            .select('*')
            .eq('raid_id', raidId);

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        cache.groups.set(raidId, groups);
        return groups;
    } catch (error) {
        console.error('Unexpected error fetching groups:', error);
        return [];
    }
}


// Query to get players for add page
const fetchAllPlayers = async () => {
    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('id, username')
            .order('username', { ascending: true });

        if (error) {
            console.error('Error fetching players:', error);
            return { error: 'Error fetching players' };
        }

        return players;
    } catch (error) {
        console.error('Unexpected error fetching players:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to get characters of a specific player
async function fetchCharactersForPlayer(playerId, groupId) {
    const cacheKey = `${playerId}-${groupId}`;

    // Check in-memory cache first
    if (cache.characters.has(cacheKey)) {
        console.log(`Cache hit for characters in player ${playerId}, group ${groupId}`);
        return cache.characters.get(cacheKey);
    }

    try {
        // Fetch from database
        const { data, error } = await supabase
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

        // Cache the results in memory and localStorage
        cache.characters.set(cacheKey, data);
        localStorage.setItem(`characters-${cacheKey}`, JSON.stringify(data));

        return data;
    } catch (error) {
        console.error('Unexpected error fetching characters:', error);
        return [];
    }
}

// Query to create a new character
const createCharacter = async (player_id, name, item_level, class_id) => {
    if (!player_id || !name || !item_level || !class_id) {
        console.error('All fields are required to add a character.');
        return { error: 'All fields are required to add a character.' };
    }

    try {
        const { error } = await supabase
            .from('characters')
            .insert([{ player_id, name, item_level, class_id }]);

        if (error) {
            console.error('Error adding character:', error);
            return { error: 'Error adding character' };
        }

        return { message: 'Character added successfully' };
    } catch (error) {
        console.error('Unexpected error adding character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to delete a character
const deleteCharacter = async (character_id) => {
    try {
        const { error } = await supabase
            .from('characters')
            .delete()
            .eq('id', character_id);

        if (error) {
            console.error('Error deleting character:', error);
            return { error: 'Error deleting character' };
        }

        return { message: 'Character deleted successfully' };
    } catch (error) {
        console.error('Unexpected error deleting character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to update a character
const updateCharacter = async (character_id, name, item_level) => {
    if (!name || !item_level) {
        console.error('Name and item level are required');
        return { error: 'Name and item level are required' };
    }

    try {
        const { error } = await supabase
            .from('characters')
            .update({ name, item_level })
            .eq('id', character_id);

        if (error) {
            console.error('Error updating character:', error);
            return { error: 'Error updating character' };
        }

        return { message: 'Character updated successfully' };
    } catch (error) {
        console.error('Unexpected error updating character:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to get all characters
const fetchAllCharacters = async () => {
    try {
        const { data: characters, error } = await supabase
            .from('characters')
            .select(`
                id,
                name,
                item_level,
                classes ( name )
            `)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching all characters:', error);
            return { error: 'Error fetching all characters' };
        }

        return characters;
    } catch (error) {
        console.error('Unexpected error fetching all characters:', error);
        return { error: 'Unexpected server error' };
    }
};

// Function to populate characters in a dropdown SUPABASE
async function populateCharacterDropdown(playerId, groupId, characterSelect) {
    try {
        const { eligibleCharacters } = await fetchEligibleCharacters(playerId, groupId);

        if (!eligibleCharacters || eligibleCharacters.length === 0) {
            console.warn(`No eligible characters found for Player: ${playerId}, Group: ${groupId}`);
            characterSelect.innerHTML = '<option value="" disabled>No eligible characters</option>';
            characterSelect.disabled = true;
            return;
        }

        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        eligibleCharacters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.character_id;

            if (!character.is_eligible) {
                option.disabled = true;
                option.textContent = `${character.character_name} (${character.item_level}) - Ineligible`;
            } else if (character.is_assigned) {
                option.disabled = true;
                option.textContent = `${character.character_name} (${character.item_level}) - Assigned`;
            } else {
                option.textContent = `${character.character_name} (${character.item_level})`;
            }

            characterSelect.appendChild(option);
        });

        characterSelect.disabled = false;
    } catch (error) {
        console.error('Error populating character dropdown:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        characterSelect.disabled = true;
    }
}

// Function to populate players in a dropdown SUPABASE
async function populatePlayerDropdown(groupId, playerSelect) {
    try {
        const { eligiblePlayers } = await fetchEligibleCharacters(null, groupId);

        if (!eligiblePlayers || eligiblePlayers.length === 0) {
            console.warn(`No eligible players found for Group: ${groupId}`);
            playerSelect.innerHTML = '<option value="" disabled>No eligible players</option>';
            playerSelect.disabled = true;
            return;
        }

        playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';
        eligiblePlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.username;

            if (player.isDisabled) {
                option.disabled = true;
                option.textContent += ' - Already Selected';
            }

            playerSelect.appendChild(option);
        });

        playerSelect.disabled = false;
    } catch (error) {
        console.error('Error populating player dropdown:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
        playerSelect.disabled = true;
    }
}

// And cache player
function populatePlayerDropdownFromCache(players, playerSelect, preselectedPlayerId) {
    playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';

    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.username;

        // Check if the player is already saved to this group
        if (player.has_eligible_characters === false) {
            option.disabled = true;
            option.textContent += ' - Already in group';
        }

        playerSelect.appendChild(option);
    });

    if (preselectedPlayerId) {
        playerSelect.value = preselectedPlayerId;
    }

    playerSelect.disabled = false;
}

// Function to create a raid group SUPABASE
let isCreatingGroup = false; // Prevent duplicate submissions
async function createRaidGroup(raidId, minItemLevel) {
    if (isCreatingGroup) {
        console.warn('A group creation is already in progress. Ignoring this request.');
        return { error: 'A group creation is already in progress' }; // Log a warning, no need for UI alert
    }

    isCreatingGroup = true;

    if (!raidId || minItemLevel === null || minItemLevel === undefined) {
        console.error('Raid ID and minimum item level are required.');
        isCreatingGroup = false; // Reset flag
        return { error: 'Raid ID and minimum item level are required.' };
    }

    try {
        const { count: existingGroupsCount, error: countError } = await supabase
            .from('groups')
            .select('*', { count: 'exact' })
            .eq('raid_id', raidId);

        if (countError) {
            console.error('Error fetching existing groups count:', countError);
            isCreatingGroup = false; // Reset flag
            return { error: 'Error fetching existing groups count.' };
        }

        const groupName = `Group ${existingGroupsCount + 1}`;

        const { data: newGroup, error } = await supabase
            .from('groups')
            .insert([{ raid_id: raidId, min_item_level: minItemLevel, group_name: groupName }])
            .select()
            .single();

        if (error || !newGroup) {
            console.error('Error creating group:', error || 'No data returned');
            isCreatingGroup = false; // Reset flag
            return { error: 'Error creating group.' };
        }

        console.log(`Group "${groupName}" created successfully.`);
        return { success: true };
    } catch (error) {
        console.error('Unexpected error creating group:', error);
        return { error: 'Unexpected error creating group.' };
    } finally {
        isCreatingGroup = false; // Reset flag after process completion
    }
}

// Function to delete a raid group
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
            console.error('Error deleting group members:', membersError);
            return { error: 'Error deleting group members' };
        }

        // Delete the group itself
        const { error: groupError } = await supabase
            .from('groups')
            .delete()
            .eq('id', groupId);

        if (groupError) {
            console.error('Error deleting raid group:', groupError);
            return { error: 'Error deleting raid group' };
        }

        console.log('Raid group and its members deleted successfully.');

        // Refresh groups after deletion
        await loadExistingGroups(raidId); // Refresh the UI with the remaining groups
        return { success: true };
    } catch (error) {
        console.error('Unexpected error deleting raid group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to reset a group
async function resetGroup(groupId) {
    if (!groupId) {
        console.error('Group ID is required to reset the group');
        return { error: 'Group ID is required' };
    }

    try {
// Clear group members in the database
if (!groupId) {
    console.error('Invalid group ID. Cannot clear group members.');
    return { error: 'Invalid group ID' };
}

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

        playerSelects.forEach(playerSelect => {
            playerSelect.value = '';
            playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';
        });

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


// Function to save group members and disable selected options
async function saveGroupMembers(groupId, members) {
    if (!groupId || !members || members.length === 0) {
        console.error('Group ID and valid members data are required');
        return { error: 'Group ID and valid members data are required' };
    }

    try {
        const { error } = await supabase
            .from('group_members')
            .upsert(members, { onConflict: ['group_id', 'player_id', 'character_id'] });

        if (error) {
            console.error('Error saving group members:', error);
            return { error: 'Error saving group members' };
        }

        console.log('Group members saved successfully');

        // Update dropdowns to disable already selected players and characters
        const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
        if (!groupElement) return;

        const playerSelects = groupElement.querySelectorAll('.player-select');
        const characterSelects = groupElement.querySelectorAll('.character-select');

        playerSelects.forEach(playerSelect => {
            const selectedValue = playerSelect.value;
            if (selectedValue) {
                const options = document.querySelectorAll(`.player-select option[value="${selectedValue}"]`);
                options.forEach(option => {
                    if (option.parentElement !== playerSelect) {
                        option.disabled = true;
                    }
                });
            }
        });

        characterSelects.forEach(characterSelect => {
            const selectedValue = characterSelect.value;
            if (selectedValue) {
                const options = document.querySelectorAll(`.character-select option[value="${selectedValue}"]`);
                options.forEach(option => {
                    if (option.parentElement !== characterSelect) {
                        option.disabled = true;
                    }
                });
            }
        });

        return { success: true };
    } catch (error) {
        console.error('Unexpected error saving group members:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to load existing groups SUPABASE
async function loadExistingGroups(raidId = null) {
    try {
        const groups = await fetchGroupsWithSlots(raidId);

        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = ''; // Clear previous content to prevent duplicates

        if (groups.length === 0) {
            console.log('No groups found for the selected raid.');
            return;
        }

        for (const group of groups) {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('raid-group');
            groupDiv.setAttribute('data-group-id', group.id);
            groupDiv.setAttribute('data-raid-id', group.raid_id); // Add raid ID for context

            const groupHeader = document.createElement('div');
            groupHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');

            const headerText = document.createElement('h3');
            headerText.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;

            groupHeader.appendChild(headerText);
            groupDiv.appendChild(groupHeader);

            // Minimize button
            const minimizeButton = document.createElement('button');
            minimizeButton.textContent = '−';
            minimizeButton.classList.add('btn', 'btn-secondary', 'btn-sm', 'ml-auto');
            minimizeButton.onclick = () => {
                const table = groupDiv.querySelector('.assignment-table');
                table.style.display = table.style.display === 'none' ? 'table' : 'none';
                minimizeButton.textContent = table.style.display === 'none' ? '+' : '−';
            };

            // Save button
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save';
            saveButton.classList.add('btn', 'btn-primary', 'btn-sm');
            saveButton.onclick = async () => {
                const groupId = parseInt(groupDiv.getAttribute('data-group-id'), 10);
                const members = fetchGroupMembers(groupDiv);
                if (!groupId || !members.length) {
                    alert('Please select valid players and characters before saving.');
                    return;
                }

                const result = await saveGroupMembers(groupId, members);
                if (result.error) {
                    alert(`Error: ${result.error}`);
                } else {
                    console.log(result.message);
                }

                await updateGroupSlots(groupId, headerText);
                await updatePlayerList(groupId, playerListContainer); // Update player list
            };

            // Clear button
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear';
            clearButton.classList.add('btn', 'btn-warning', 'btn-sm');
            clearButton.onclick = async () => {
                const groupId = parseInt(groupDiv.getAttribute('data-group-id'), 10);
                await resetGroup(groupId);
                await updateGroupSlots(groupId, headerText);
                await updatePlayerList(groupId, playerListContainer); // Clear player list
            };

            // Delete button
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'X';
            deleteButton.classList.add('btn', 'btn-danger', 'btn-sm');
            deleteButton.onclick = async () => {
                const groupId = parseInt(groupDiv.getAttribute('data-group-id'), 10);
                const raidId = parseInt(groupDiv.getAttribute('data-raid-id'), 10);

                if (!groupId || !raidId) {
                    alert('Group ID or Raid ID is missing.');
                    return;
                }

                await deleteRaidGroup(groupId, raidId);
            };

            // Append buttons to header
            groupHeader.appendChild(minimizeButton);
            groupHeader.appendChild(saveButton);
            groupHeader.appendChild(clearButton);
            groupHeader.appendChild(deleteButton);

            // Player list container (Below group name and 0/8 slots)
            const playerListContainer = document.createElement('div');
            playerListContainer.classList.add('player-list', 'mt-2'); // Add margin for spacing
            playerListContainer.textContent = 'No players added yet.'; // Placeholder

            groupDiv.appendChild(groupHeader);
            groupDiv.appendChild(playerListContainer);

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

            groupDiv.appendChild(table);
            groupsContainer.appendChild(groupDiv);

            // Populate Player Dropdowns for Both Parties
            const playerSelects = groupDiv.querySelectorAll('.player-select');
            for (const select of playerSelects) {
                await populatePlayerDropdown(group.id, select);
            }

            // Update player list
            await updatePlayerList(group.id, playerListContainer);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Function to dynamically update the player list
async function updatePlayerList(groupId, container) {
    try {
        const { data: members, error } = await supabase
            .from('group_members')
            .select(`
                players (username),
                characters (name, item_level, classes (name))
            `)
            .eq('group_id', groupId);

        if (error || !members) {
            console.error('Error fetching group members:', error);
            container.textContent = 'No players added yet.';
            return;
        }

        if (members.length === 0) {
            container.textContent = 'No players added yet.';
            return;
        }

        // Format the list as: PlayerName(Classname, ItemLevel), ...
        const playerList = members.map(member => 
            `${member.players.username} (${member.characters.classes.name}, ${member.characters.item_level})`
        );

        container.textContent = playerList.join(', ');
    } catch (error) {
        console.error('Unexpected error updating player list:', error);
        container.textContent = 'Error updating player list.';
    }
}

// Update slots count dynamically SUPABASE
async function updateGroupSlots(groupId, headerTextElement) {
    try {
        const groups = await fetchGroupsWithSlots();

        if (groups.error) {
            console.error('Error fetching group slots:', groups.error);
            return;
        }

        const group = groups.find(g => g.id === groupId);

        if (group) {
            headerTextElement.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;
        }
    } catch (error) {
        console.error('Unexpected error updating group slots:', error);
    }
}

// Function to load players to add players page SUPABASE
async function loadPlayersForAddPage(playerSelect) {
    try {
        const players = await fetchAllPlayers();

        if (!players.error) {
            playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';
            players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.username;
                playerSelect.appendChild(option);
            });
            playerSelect.disabled = false;
        } else {
            console.error('Error fetching players for add page:', players.error);
            playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
        }
    } catch (error) {
        console.error('Unexpected error loading players for add page:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
    }
}

// Function to load classes to add players page SUPABASE
async function loadClassesForAddPage(classSelect) {
    try {
        const classes = await fetchAllClasses();

        if (!classes.error) {
            classSelect.innerHTML = '<option value="" disabled selected>Select Class</option>';
            classes.forEach(characterClass => {
                const option = document.createElement('option');
                option.value = characterClass.id;
                option.textContent = characterClass.name;
                classSelect.appendChild(option);
            });
            classSelect.disabled = false;
        } else {
            console.error('Error fetching classes for add page:', classes.error);
            classSelect.innerHTML = '<option value="" disabled>Error loading classes</option>';
        }
    } catch (error) {
        console.error('Unexpected error loading classes for add page:', error);
        classSelect.innerHTML = '<option value="" disabled>Error loading classes</option>';
    }
}

// Function to load characters of a player in add players page SUPABASE
async function loadCharactersForPlayer(playerId, characterSelect) {
    if (!playerId) {
        characterSelect.innerHTML = '<option value="" disabled selected>Select Player First</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        const characters = await fetchCharactersForPlayer(playerId);

        if (!characters.error) {
            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = `${character.name} (${character.classes.name}, IL: ${character.item_level})`;
                characterSelect.appendChild(option);
            });
            characterSelect.disabled = false;
        } else {
            console.error('Error fetching characters for player:', characters.error);
            characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        }
    } catch (error) {
        console.error('Unexpected error loading characters for player:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
    }
}

// Function to add a new player in add players page SUPABASE
async function addNewPlayer() {
    const usernameInput = document.getElementById('username-input');
    if (!usernameInput) {
        console.error('Username input field not found');
        alert('Error: Username input field is missing!');
        return;
    }

    const username = usernameInput.value.trim();

    if (!username) {
        alert('Please enter a valid username.');
        return;
    }

    try {
        const result = await addPlayer(username);

        if (result.error) {
            console.error('Error adding player:', result.error);
            alert(`Error: ${result.error}`);
        } else {
            alert('Player added successfully!');
            usernameInput.value = ''; // Clear the input field
            // Optionally refresh the player list
        }
    } catch (error) {
        console.error('Unexpected error adding player:', error);
        alert('Unexpected error adding player.');
    }
}

// Function to add a new character to the selected player in add players page SUPABASE
async function addNewCharacter(playerSelect, characterNameInput, itemLevelInput, classSelect) {
    const playerId = playerSelect.value;
    const name = characterNameInput.value.trim();
    const itemLevel = parseInt(itemLevelInput.value, 10);
    const classId = classSelect.value;

    if (!playerId || !name || !itemLevel || !classId) {
        alert('All fields are required to add a character.');
        return;
    }

    try {
        const result = await createCharacter(playerId, name, itemLevel, classId);

        if (result.error) {
            console.error('Error adding character:', result.error);
            alert(`Error: ${result.error}`);
        } else {
            alert('Character added successfully!');
            characterNameInput.value = ''; // Clear the character name input
            itemLevelInput.value = ''; // Clear the item level input
            classSelect.value = ''; // Reset the class select dropdown

            clearCharactersCache(playerId); // Clear the character cache for this player
        }
    } catch (error) {
        console.error('Unexpected error adding character:', error);
        alert('Unexpected error adding character.');
    }
}

// Function to update character in add players page SUPABASE
async function updateCharacterDetails(characterSelect, characterNameInput, itemLevelInput) {
    const characterId = characterSelect.value;
    const name = characterNameInput.value.trim();
    const itemLevel = parseInt(itemLevelInput.value, 10);

    if (!characterId || !name || !itemLevel) {
        alert('All fields are required to update the character.');
        return;
    }

    try {
        const result = await updateCharacter(characterId, name, itemLevel);

        if (result.error) {
            console.error('Error updating character:', result.error);
            alert(`Error: ${result.error}`);
        } else {
            alert('Character updated successfully!');
            const playerId = characterSelect.dataset.playerId; // Ensure playerId is set in the dropdown
            clearCharactersCache(playerId); // Clear the character cache for this player
        }
    } catch (error) {
        console.error('Unexpected error updating character:', error);
        alert('Unexpected error updating character.');
    }
}
// Function to update group UI dynamically
async function updateGroupUI(groupId) {
    const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
    if (!groupElement) return;

    const members = await fetchGroupMembers(groupId); // Fetch updated members
    const memberList = groupElement.querySelector('.member-list');

    if (members.length === 0) {
        memberList.innerHTML = '<p>No members yet.</p>';
        return;
    }

    memberList.innerHTML = ''; // Clear the list
    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.textContent = `${member.player_name} (${member.character_name})`;
        memberList.appendChild(memberItem);
    });
}

// Function to delete character in add players page SUPABASE
async function deleteCharacterFromPlayer(characterSelect) {
    const characterId = characterSelect.value;

    if (!characterId) {
        alert('Please select a character to delete.');
        return;
    }

    if (!confirm('Are you sure you want to delete this character?')) {
        return;
    }

    try {
        const result = await deleteCharacter(characterId);

        if (result.error) {
            console.error('Error deleting character:', result.error);
            alert(`Error: ${result.error}`);
        } else {
            alert('Character deleted successfully!');
            characterSelect.value = ''; // Reset the character select dropdown
            const playerId = characterSelect.dataset.playerId; // Ensure playerId is set in the dropdown
            clearCharactersCache(playerId); // Clear the character cache for this player
        }
    } catch (error) {
        console.error('Unexpected error deleting character:', error);
        alert('Unexpected error deleting character.');
    }
}

// Initialize on DOM content loaded
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

        if (raidSelect) {
            // Raid Organizer Page
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
                const createButton = event.target; // Reference the clicked button
                const selectedOption = raidSelect.options[raidSelect.selectedIndex];

                // Disable the button to prevent duplicate clicks
                createButton.disabled = true;

                if (!selectedOption || !selectedOption.value) {
                    console.error('Please select a raid to create a group.');
                    alert('Please select a raid to create a group.');
                    createButton.disabled = false; // Re-enable the button
                    return;
                }

                const raidId = selectedOption.value;
                const minItemLevel = selectedOption.getAttribute('data-min-ilvl');

                if (!raidId || !minItemLevel) {
                    console.error('Invalid raid selection or missing minimum item level.');
                    alert('Invalid raid selection or missing minimum item level.');
                    createButton.disabled = false; // Re-enable the button
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
                    // Re-enable the button and reset its text
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

        if (playerForm) {
            // Add Player / Character Page
            const playerSelect = document.getElementById('player-select');
            const classSelect = document.getElementById('class-select');
            const characterSelect = document.getElementById('character-select');

            console.log('Initializing player form...');
            await loadClassesDropdown(classSelect); // Load classes from Supabase Storage
            await loadPlayersForAddPage(playerSelect); // Populate players from cache or fetch

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
                clearPlayersCache(); // Clear player cache
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
                clearCharactersCache(playerSelect.value); // Clear character cache for this player
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
                clearCharactersCache(playerSelect.value); // Clear character cache for this player
                await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh character dropdown
            });

            // Delete a character
            document.getElementById('delete-character-btn')?.addEventListener('click', async () => {
                if (!characterSelect.value) {
                    alert('Please select a character to delete.');
                    return;
                }
                await deleteCharacterFromPlayer(characterSelect);
                clearCharactersCache(playerSelect.value); // Clear character cache for this player
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

            // Set loading state
            characterSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
            characterSelect.disabled = true;

            try {
                // Populate the character dropdown
                await populateCharacterDropdown(playerId, groupId, characterSelect);

                // Enable the dropdown after fetching
                characterSelect.disabled = false;
            } catch (error) {
                console.error('Error fetching characters for player selection:', error);
                characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
                characterSelect.disabled = true;
            }
        });
    })();
});
