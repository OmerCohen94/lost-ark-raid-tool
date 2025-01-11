
const SUPABASE_URL = 'https://jlqfmqfhsyxxsbteykxz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZtcWZoc3l4eHNidGV5a3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1MzQ0NDUsImV4cCI6MjA1MjExMDQ0NX0.yU6iCVBt_-2lW0WkSNEmcGKyz_R7rN77IRB-ZggH-vE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to fetch static data from SUPABASE
async function fetchFromStorage(filePath) {
    const { data, error } = await supabase.storage
        .from('static-data') // Replace with your bucket name
        .download(filePath);

    if (error) {
        console.error('Error fetching from storage:', error);
        return null;
    }

    try {
        const text = await data.text(); // Convert the file content to text
        return JSON.parse(text); // Parse and return JSON data
    } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
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
    // Check in-memory cache first
    if (cache.raids) {
        console.log('Using cached raids');
        return cache.raids;
    }

    // Check localStorage cache
    const storedRaids = localStorage.getItem('raids');
    if (storedRaids) {
        console.log('Using raids from localStorage');
        cache.raids = JSON.parse(storedRaids);
        return cache.raids;
    }

    try {
        // Fetch raids from Supabase Storage
        const raids = await fetchFromStorage('raids.json');
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

// Function to get eligible characters
async function fetchEligibleCharacters(playerId, groupId) {
    if (!playerId || !groupId) {
        console.error('Player ID and Group ID are required');
        return [];
    }

    try {
        const { data, error } = await supabase
            .from('eligible_characters')
            .select('*')
            .eq('player_id', playerId)
            .eq('group_id', groupId);

        if (error) {
            console.error('Error fetching eligible characters:', error);
            return [];
        }

        if (!data || data.length === 0) {
            console.warn(`No eligible characters found for player ${playerId} in group ${groupId}`);
        }

        return data;
    } catch (error) {
        console.error('Unexpected error fetching eligible characters:', error);
        return [];
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
const fetchGroupsWithSlots = async () => {
    try {
        const { data: groups, error } = await supabase
            .from('groups')
            .select(`
                id,
                group_name,
                min_item_level,
                raids (name),
                group_members!group_members_group_id_fkey (id)
            `);

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        return groups.map(group => ({
            id: group.id,
            group_name: group.group_name,
            min_item_level: group.min_item_level,
            raid_name: group.raids?.name || 'Unknown Raid',
            filled_slots: group.group_members?.length || 0,
            total_slots: 8, // Assuming fixed slots
        }));
    } catch (error) {
        console.error('Unexpected error fetching groups:', error);
        return [];
    }
};

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

// Query to get members of specific group
async function fetchGroupMembers(groupId) {
    try {
        const { data: members, error } = await supabase
            .from('group_members')
            .select('player_id, players(username), characters(name, item_level)')
            .eq('group_id', groupId);

        if (error) {
            console.error('Error fetching group members:', error);
            return [];
        }

        return members.map(member => ({
            player_name: member.players.username,
            character_name: member.characters.name,
            item_level: member.characters.item_level,
        }));
    } catch (error) {
        console.error('Unexpected error fetching group members:', error);
        return [];
    }
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

// da fuck
async function loadRaidsDropdown(raidSelect) {
    // Check in-memory cache first
    if (cache.raids) {
        console.log('Using cached raids');
        populateRaidDropdown(raidSelect, cache.raids);
        return;
    }

    try {
        const raids = await fetchFromStorage('raids.json'); // Fetch from Supabase Storage
        if (raids) {
            cache.raids = raids; // Store in cache
            localStorage.setItem('raids', JSON.stringify(raids)); // Persist to localStorage
            populateRaidDropdown(raidSelect, raids); // Populate dropdown
        } else {
            raidSelect.innerHTML = '<option value="" disabled>Error loading raids</option>';
        }
    } catch (error) {
        console.error('Error loading raids:', error);
        raidSelect.innerHTML = '<option value="" disabled>Error loading raids</option>';
    }
}

// Helper function to populate the dropdown
async function populateRaidDropdown(raidSelect) {
    const raids = await fetchRaids();
    if (!raids || raids.length === 0) {
        raidSelect.innerHTML = '<option value="" disabled>Error loading raids</option>';
        return;
    }

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


// Function to get raid minimum item level
 let selectedMinItemLevel = null; // Store the minimum item level for the selected raid
window.setMinItemLevel = async () => {
    const raidSelect = document.getElementById('raid-select');
    const raid_id = raidSelect.value;

    if (!raid_id) {
        console.error('No raid selected');
        return;
    }

    try {
        const { data: raid, error } = await supabase
            .from('raids')
            .select('min_item_level')
            .eq('id', raid_id)
            .single();

        if (error || !raid) {
            console.error('Error fetching minimum item level:', error || 'Raid not found');
            alert('Error fetching minimum item level for the selected raid.');
            selectedMinItemLevel = null;
            return;
        }

        selectedMinItemLevel = raid.min_item_level;
        console.log('Selected Minimum Item Level:', selectedMinItemLevel);
    } catch (error) {
        console.error('Unexpected error fetching minimum item level:', error);
        selectedMinItemLevel = null;
    }
};

// Function to add event listeners to player selection
function initializePlayerAndCharacterListeners() {
    const playerSelects = document.querySelectorAll('.player-select');
    const fetchInProgress = new Map(); // Track ongoing fetch operations for each dropdown

    playerSelects.forEach(playerSelect => {
        playerSelect.addEventListener('change', async (event) => {
            const playerId = event.target.value;
            const groupElement = playerSelect.closest('.raid-group');
            const groupId = groupElement ? groupElement.getAttribute('data-group-id') : null;
            const characterSelect = playerSelect.closest('td').nextElementSibling.querySelector('.character-select');

            // Check if a fetch operation is already in progress for this dropdown
            if (fetchInProgress.get(playerSelect)) {
                console.log('Fetch already in progress, ignoring change.');
                return;
            }

            // Set loading state
            characterSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
            characterSelect.disabled = true;

            await populateCharacterDropdown(playerId, groupId, characterSelect);

            if (!playerId) {
                // Reset the character dropdown if no player is selected
                characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
                characterSelect.disabled = true;
                return;
            }

            try {
                // Mark the fetch operation as in progress
                fetchInProgress.set(playerSelect, true);

                // Populate the character dropdown
                await populateCharacterDropdown(playerId, groupId, characterSelect);

                // Enable the dropdown after fetching
                characterSelect.disabled = false;
            } catch (error) {
                console.error('Error in fetching characters for player selection:', error);
                characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
                characterSelect.disabled = true;
            } finally {
                // Mark the fetch operation as complete
                fetchInProgress.set(playerSelect, false);
            }
        });
    });
}

// Function to populate characters in a dropdown SUPABASE
async function populateCharacterDropdown(playerId, groupId, characterSelect) {
    if (!playerId || !groupId) {
        console.error('Player ID and Group ID are required');
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        const characters = await fetchEligibleCharacters(playerId, groupId);

        if (!characters || characters.length === 0) {
            characterSelect.innerHTML = '<option value="" disabled>No eligible characters</option>';
            characterSelect.disabled = true;
            return;
        }

        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characters.forEach(character => {
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
        console.error('Unexpected error populating character dropdown:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        characterSelect.disabled = true;
    }
}

// And cache character
function populateCharacterDropdownFromCache(characters, characterSelect, savedCharacterId) {
    characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';

    characters.forEach(character => {
        const option = document.createElement('option');
        option.value = character.id;

        if (!character.is_eligible) {
            option.disabled = true;
            option.textContent = `${character.classes.name} (${character.item_level}) - Ineligible (Below Min IL)`;
        } else if (character.assigned_to_group) {
            option.disabled = true;
            option.textContent = `${character.classes.name} (${character.item_level}) - Assigned to ${character.assigned_to_group}`;
        } else {
            option.textContent = `${character.classes.name} (${character.item_level})`;
        }

        characterSelect.appendChild(option);
    });

    if (savedCharacterId) {
        const savedCharacter = characters.find(char => char.id === savedCharacterId);
        if (savedCharacter) {
            characterSelect.value = savedCharacterId;
        } else {
            console.warn(`Saved character ${savedCharacterId} is no longer valid.`);
        }
    }

    characterSelect.disabled = false;
}

// Function to populate players in a dropdown SUPABASE
async function populatePlayerDropdown(groupId, playerSelect, preselectedPlayerId = null) {
    if (cache.players.has(groupId)) {
        populatePlayerDropdownFromCache(cache.players.get(groupId), playerSelect, preselectedPlayerId);
        return;
    }

    const players = await fetchPlayersForGroup(groupId);
    if (!players.error) {
        cache.players.set(groupId, players);
        populatePlayerDropdownFromCache(players, playerSelect, preselectedPlayerId);
    } else {
        console.error('Error fetching players:', players.error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
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

// Function to delete a raid group SUPABASE
async function deleteRaidGroup(groupId) {
    if (!groupId) {
        console.error('Group ID is required');
        return { error: 'Group ID is required' };
    }

    try {
        const result = await deleteGroup(groupId);

        if (result.error) {
            console.error('Error deleting raid group:', result.error);
            return { error: result.error };
        }

        console.log('Raid group deleted successfully:', result.message);
        return { message: 'Raid group deleted successfully' };
    } catch (error) {
        console.error('Unexpected error deleting raid group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to reset a group SUPABASE
async function resetGroup(groupId) {
    if (!groupId) {
        console.error('Group ID is required');
        return { error: 'Group ID is required' };
    }

    try {
        // Clear group members from the database
        const { error } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId);

        if (error) {
            console.error('Error clearing group members:', error);
            return { error: 'Error clearing group members' };
        }

        console.log('Group members cleared successfully');


        // Reset dropdowns to default
        const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
        if (groupElement) {
            const playerSelects = groupElement.querySelectorAll('.player-select');
            const characterSelects = groupElement.querySelectorAll('.character-select');

            playerSelects.forEach(playerSelect => {
                playerSelect.value = ''; // Reset player dropdown
                playerSelect.dispatchEvent(new Event('change')); // Trigger change event to reset characters
            });

            characterSelects.forEach(characterSelect => {
                characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>'; // Reset character dropdown
                characterSelect.disabled = true; // Disable the dropdown
            });
        }

        return { message: 'Group reset successfully' };
    } catch (error) {
        console.error('Unexpected error resetting group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to save group members SUPABASE
const saveGroupMembers = async (groupId, members) => {
    if (!groupId || !members || members.length === 0) {
        console.error('Group ID and valid members data are required');
        return { error: 'Group ID and valid members data are required' };
    }

    try {
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('raid_id')
            .eq('id', groupId)
            .single();

        if (groupError || !group) {
            console.error('Group not found:', groupError || 'Group not found');
            return { error: 'Group not found' };
        }

        const raidId = group.raid_id;

        const formattedMembers = members.map(member => ({
            group_id: groupId,
            player_id: parseInt(member.player_id, 10),
            character_id: parseInt(member.character_id, 10),
        }));

        const { error: upsertError } = await supabase
            .from('group_members')
            .upsert(formattedMembers, { onConflict: ['group_id', 'player_id', 'character_id'] });

        if (upsertError) {
            console.error('Error saving group members:', upsertError);
            return { error: 'Error saving group members' };
        }

        console.log('Group members saved successfully');
        return { success: true };
    } catch (error) {
        console.error('Unexpected error saving group members:', error);
        return { error: 'Unexpected server error' };
    }
};


// Function to load existing groups SUPABASE
async function loadExistingGroups(raid_id = null) {
    try {
        const groups = await fetchGroupsWithSlots(raid_id);

        if (groups.error) {
            console.error('Error loading groups:', groups.error);
            return;
        }

        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = ''; // Clear previous content to prevent duplicates

        for (const group of groups) {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('raid-group');
            groupDiv.setAttribute('data-group-id', group.id);

            const groupHeader = document.createElement('div');
            groupHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');

            const headerText = document.createElement('h3');
            headerText.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;

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
                await deleteRaidGroup(groupId);
                await loadExistingGroups(raid_id);
            };

            // Append buttons to header
            groupHeader.appendChild(headerText);
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

            // Initialize listeners for dropdowns
            initializePlayerAndCharacterListeners(group.id);

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
document.addEventListener('DOMContentLoaded', async () => {
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
        await loadRaidsDropdown(raidSelect); // Load raids from Supabase Storage
        loadExistingGroups(); // Load groups initially

        // Refresh groups based on raid selection
        raidSelect.addEventListener('change', async () => {
            const selectedRaidId = raidSelect.value || null;
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
            .from('groups')
            .on('INSERT', payload => {
                console.log('New group added:', payload.new);
                loadExistingGroups(payload.new.raid_id);
            })
            .on('UPDATE', payload => {
                console.log('Group updated:', payload.new);
                loadExistingGroups(payload.new.raid_id);
            })
            .on('DELETE', payload => {
                console.log('Group deleted:', payload.old);
                loadExistingGroups();
            })
            .subscribe();
    }

    if (playerForm) {
        // Add Player / Character Page
        const playerSelect = document.getElementById('player-select');
        const classSelect = document.getElementById('class-select');
        const characterSelect = document.getElementById('character-select');

        await loadClassesDropdown(classSelect); // Load classes from Supabase Storage
        loadPlayersForAddPage(playerSelect); // Populate players from cache or fetch

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
            .from('group_members')
            .on('INSERT', payload => {
                console.log('New member added:', payload.new);
                updateGroupUI(payload.new.group_id);
            })
            .on('DELETE', payload => {
                console.log('Member removed:', payload.old);
                updateGroupUI(payload.old.group_id);
            })
            .subscribe();
    }
});
