
const SUPABASE_URL = 'https://jlqfmqfhsyxxsbteykxz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWZtcWZoc3l4eHNidGV5a3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1MzQ0NDUsImV4cCI6MjA1MjExMDQ0NX0.yU6iCVBt_-2lW0WkSNEmcGKyz_R7rN77IRB-ZggH-vE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// Query to get groups
const fetchGroupsWithSlots = async () => {
    try {
        // Fetch all groups and join with raids
        const { data: groups, error } = await supabase
            .from('groups')
            .select(`
                id,
                group_name,
                min_item_level,
                raids (
                    name
                ),
                group_members (
                    id
                )
            `);

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }

        // Process the results to calculate filled_slots and total_slots
        const processedGroups = groups.map(group => {
            return {
                id: group.id,
                group_name: group.group_name,
                min_item_level: group.min_item_level,
                raid_name: group.raids?.name || 'Unknown Raid',
                filled_slots: group.group_members?.length || 0, // Count the group members
                total_slots: 8, // Assuming a fixed 8 slots per group
            };
        });

        return processedGroups;
    } catch (error) {
        console.error('Unexpected error fetching groups:', error);
        return [];
    }
};

// Query to add new player
const addPlayer = async (username) => {
    if (!username || username.trim() === '') {
        console.error('Username is required');
        return { error: 'Username is required' };
    }

    try {
        // Insert the new player into the database
        const { error } = await supabase
            .from('players')
            .insert([{ username: username.trim() }]);

        if (error) {
            console.error('Error adding player:', error);
            return { error: 'Error adding player' };
        }

        return { message: 'Player added successfully' };
    } catch (error) {
        console.error('Unexpected error adding player:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to get players
const fetchPlayersForGroup = async (group_id) => {
    if (!group_id) {
        console.error('Group ID is required');
        return { error: 'Group ID is required' };
    }

    try {
        // Fetch the raid ID and minimum item level for the group
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('raid_id, min_item_level')
            .eq('id', group_id)
            .single();

        if (groupError || !group) {
            console.error('Error fetching group:', groupError || 'Group not found');
            return { error: 'Group not found' };
        }

        const { raid_id, min_item_level } = group;

        // Fetch players and their characters
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select(`
                id,
                username,
                characters (
                    id,
                    item_level
                )
            `);

        if (playersError) {
            console.error('Error fetching players:', playersError);
            return { error: 'Error fetching players' };
        }

        // Calculate eligible players
        const eligiblePlayers = [];
        for (const player of players) {
            const eligibleCharacters = player.characters.filter(
                char => char.item_level >= min_item_level
            );

            if (eligibleCharacters.length > 0) {
                const assignedCharacters = await supabase
                    .from('group_members')
                    .select('character_id')
                    .in('character_id', eligibleCharacters.map(char => char.id))
                    .eq('group_id.raid_id', raid_id);

                if (!assignedCharacters.data || assignedCharacters.data.length === 0) {
                    eligiblePlayers.push({
                        id: player.id,
                        username: player.username,
                        has_eligible_characters: true,
                    });
                } else {
                    eligiblePlayers.push({
                        id: player.id,
                        username: player.username,
                        has_eligible_characters: false,
                    });
                }
            } else {
                eligiblePlayers.push({
                    id: player.id,
                    username: player.username,
                    has_eligible_characters: false,
                });
            }
        }

        return eligiblePlayers;
    } catch (error) {
        console.error('Unexpected error fetching players:', error);
        return { error: 'Unexpected server error' };
    }
};

// Attach click event
document.getElementById('create-raid-btn')?.addEventListener('click', async () => {
    const raidSelect = document.getElementById('raid-select');
    if (!raidSelect) {
        console.error('Raid select dropdown is missing');
        alert('Please ensure the raid dropdown is loaded.');
        return;
    }

    const selectedOption = raidSelect.options[raidSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) {
        console.error('No raid selected');
        alert('Please select a raid to create a group.');
        return;
    }

    const raid_id = selectedOption.value;
    const min_item_level = selectedOption.getAttribute('data-min-ilvl');

    if (!raid_id || !min_item_level) {
        console.error('Invalid raid selection or missing minimum item level');
        alert('Error: Unable to determine raid ID or minimum item level.');
        return;
    }

    try {
        const result = await createRaidGroup(raid_id, parseInt(min_item_level, 10));
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert(`Group "${result.group_name}" created successfully!`);
            await loadExistingGroups(); // Refresh the groups
        }
    } catch (error) {
        console.error('Unexpected error creating group:', error);
        alert('Unexpected error creating group.');
    }
});

// Query to get raids
window.fetchRaids = async () => {
    try {
        // Fetch all raids from the database
        const { data: raids, error } = await supabase
            .from('raids')
            .select('id, name, min_item_level');

        if (error) {
            console.error('Error fetching raids:', error);
            return { error: 'Error fetching raids' };
        }

        return raids;
    } catch (error) {
        console.error('Unexpected error fetching raids:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to get members of specific group
const fetchGroupMembers = async (group_id) => {
    try {
        const { data: members, error } = await supabase
            .from('group_members')
            .select(`
                group_id,
                player_id,
                character_id,
                players ( username ),
                characters ( name, item_level )
            `)
            .eq('group_id', group_id);

        if (error) {
            console.error('Error fetching group members:', error);
            return { error: 'Error fetching group members' };
        }

        return members;
    } catch (error) {
        console.error('Unexpected error fetching group members:', error);
        return { error: 'Unexpected server error' };
    }
};

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

// Query to clear group members
const clearGroupMembers = async (group_id) => {
    try {
        const { error } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group_id);

        if (error) {
            console.error('Error clearing group members:', error);
            return { error: 'Error clearing group members' };
        }

        return { message: 'Group members cleared successfully' };
    } catch (error) {
        console.error('Unexpected error clearing group members:', error);
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
const fetchCharactersForPlayer = async (player_id, group_id = null) => {
    if (!player_id) {
        console.error('Player ID is required');
        return { error: 'Player ID is required' };
    }

    try {
        let raid_id, min_item_level;

        // Fetch raid ID and minimum item level if group_id is provided
        if (group_id) {
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('raid_id, min_item_level')
                .eq('id', group_id)
                .single();

            if (groupError || !group) {
                console.error('Group not found:', groupError || 'Group not found');
                return { error: 'Group not found' };
            }

            ({ raid_id, min_item_level } = group);
        }

        // Fetch characters for the player
        const { data: characters, error: charactersError } = await supabase
            .from('characters')
            .select(`
                id,
                name,
                item_level,
                classes ( name ),
                group_members ( group_id )
            `)
            .eq('player_id', player_id);

        if (charactersError) {
            console.error('Error fetching characters:', charactersError);
            return { error: 'Error fetching characters' };
        }

        // Sort the characters by class name manually
        characters.sort((a, b) => {
            const nameA = a.classes?.name || '';
            const nameB = b.classes?.name || '';
            return nameA.localeCompare(nameB);
        });

        // Handle assignments if group_id is provided
        if (group_id) {
            const { data: assignments, error: assignmentsError } = await supabase
                .from('group_members')
                .select(`
                    character_id,
                    groups ( group_name )
                `)
                .eq('groups.raid_id', raid_id)
                .neq('group_id', group_id);

            if (assignmentsError) {
                console.error('Error fetching assignments:', assignmentsError);
                return { error: 'Error fetching assignments' };
            }

            const assignmentsMap = new Map();
            assignments.forEach(row => {
                assignmentsMap.set(row.character_id, row.groups.group_name);
            });

            characters.forEach(character => {
                character.assigned_to_group = assignmentsMap.get(character.id) || null;
            });
        }

        return characters;
    } catch (error) {
        console.error('Unexpected error fetching characters:', error);
        return { error: 'Unexpected server error' };
    }
};

// Query to get all classes
const fetchAllClasses = async () => {
    try {
        const { data: classes, error } = await supabase
            .from('classes')
            .select('id, name')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching classes:', error);
            return { error: 'Error fetching classes' };
        }

        return classes;
    } catch (error) {
        console.error('Unexpected error fetching classes:', error);
        return { error: 'Unexpected server error' };
    }
};

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

//Function to get eligible players
const getEligiblePlayers = async (min_item_level, raid_id) => {
    try {
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select(`
                id,
                username,
                characters (id, item_level)
            `)
            .gte('characters.item_level', min_item_level);

        if (playersError) {
            console.error('Error fetching players:', playersError);
            return { error: 'Error fetching players' };
        }

        const eligiblePlayers = [];
        for (const player of players) {
            const characterIds = player.characters.map(char => char.id);

            if (characterIds.length === 0) continue;

            const { data: assignments, error: assignmentsError } = await supabase
                .from('group_members')
                .select('character_id, group_id')
                .in('character_id', characterIds)
                .eq('group_id', raid_id);

            if (assignmentsError) {
                console.error('Error fetching assignments:', assignmentsError);
                continue;
            }

            if (!assignments.length) {
                eligiblePlayers.push({
                    id: player.id,
                    username: player.username,
                });
            }
        }

        return eligiblePlayers;
    } catch (error) {
        console.error('Unexpected error fetching eligible players:', error);
        return { error: 'Unexpected server error' };
    }
};

// Function to restore dropdown selections from localStorage SUPABASE
async function restoreDropdownSelections(groupId) {
    const savedSelections = localStorage.getItem(`group_${groupId}_selections`);
    if (!savedSelections) return;

    const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
    if (!groupElement) {
        console.error(`Group element for groupId ${groupId} not found.`);
        return;
    }

    const playerSelects = groupElement.querySelectorAll('.player-select');
    const characterSelects = groupElement.querySelectorAll('.character-select');

    const selections = JSON.parse(savedSelections);

    for (let index = 0; index < selections.length; index++) {
        const selection = selections[index];
        const playerSelect = playerSelects[index];
        const characterSelect = characterSelects[index];

        // Restore player selection
        if (selection.player) {
            await populatePlayerDropdown(groupId, playerSelect, selection.player);

            if (playerSelect.value !== selection.player) {
                console.warn(`Preselected player ${selection.player} is no longer available.`);
            } else {
                playerSelect.dispatchEvent(new Event('change')); // Trigger change event if selection is valid
            }
        }

        // Restore character selection
        if (selection.character) {
            const characters = await fetchCharactersForPlayer(selection.player, groupId);

            if (!characters.error) {
                characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
                characters.forEach(character => {
                    const option = document.createElement('option');
                    option.value = character.id;
                    option.textContent = `${character.classes.name} (${character.item_level})`;

                    if (character.assigned_to_group) {
                        option.textContent += ` - Assigned to ${character.assigned_to_group}`;
                        option.disabled = true;
                    }

                    characterSelect.appendChild(option);
                });

                characterSelect.value = selection.character;

                if (characterSelect.value !== selection.character) {
                    console.warn(`Preselected character ${selection.character} is no longer available.`);
                }

                characterSelect.disabled = false;
            } else {
                console.error(`Error fetching characters for player ${selection.player}:`, characters.error);
            }
        }
    }
}

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

// Function to populate characters in a dropdown SUPABASE
async function populateCharacterDropdown(playerId, groupId, characterSelect) {
    if (!playerId) {
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        const characters = await fetchCharactersForPlayer(playerId, groupId);

        if (!characters.error) {
            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = `${character.classes.name} (${character.item_level})`;

                if (character.assigned_to_group) {
                    option.textContent += ` - Assigned to ${character.assigned_to_group}`;
                    option.disabled = true;
                } else if (!character.meets_min_item_level) {
                    option.textContent += ` - Below Min IL`;
                    option.disabled = true;
                }

                characterSelect.appendChild(option);
            });
            characterSelect.disabled = false;
        } else {
            console.error('Error fetching characters:', characters.error);
            characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        }
    } catch (error) {
        console.error('Unexpected error populating character dropdown:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
    }
}

// Function to populate players in a dropdown SUPABASE
async function populatePlayerDropdown(groupId, playerSelect, preselectedPlayerId = null) {
    try {
        const players = await fetchPlayersForGroup(groupId);

        if (!players.error) {
            playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';
            players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.username;

                if (!player.has_eligible_characters) {
                    option.textContent += ' - No eligible characters';
                    option.disabled = true;
                }

                playerSelect.appendChild(option);
            });

            if (preselectedPlayerId) {
                playerSelect.value = preselectedPlayerId;
            }

            playerSelect.disabled = false;
        } else {
            console.error('Error fetching players:', players.error);
            playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
        }
    } catch (error) {
        console.error('Unexpected error populating player dropdown:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
    }
}

// Function to populate raids in the dropdown SUPABASE
async function populateRaidDropdown() {
    const raidSelect = document.getElementById('raid-select');
    if (!raidSelect) {
        console.error('Raid dropdown not found');
        return;
    }

    try {
        const { data: raids, error } = await supabase
            .from('raids')
            .select('id, name, min_item_level');

        if (error) {
            console.error('Error fetching raids:', error);
            return;
        }

        raidSelect.innerHTML = '<option value="" disabled selected>Select Raid</option>'; // Reset options

        raids.forEach(raid => {
            const option = document.createElement('option');
            option.value = raid.id; // Set the raid ID
            option.setAttribute('data-min-ilvl', raid.min_item_level); // Store minimum item level
            option.textContent = `${raid.name} (Min IL: ${raid.min_item_level})`;
            raidSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Unexpected error populating raid dropdown:', error);
    }
}

// Function to update character options based on selected player SUPABASE
async function updateCharacterOptions(playerSelect, characterSelect, groupId) {
    const playerId = playerSelect.value;

    if (!playerId) {
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        const characters = await fetchCharactersForPlayer(playerId, groupId);

        if (!characters.error) {
            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = `${character.classes.name} (${character.item_level})`;

                if (character.assigned_to_group) {
                    option.textContent += ` - Assigned to ${character.assigned_to_group}`;
                    option.disabled = true;
                } else if (!character.meets_min_item_level) {
                    option.textContent += ` - Below Min IL`;
                    option.disabled = true;
                }

                characterSelect.appendChild(option);
            });
            characterSelect.disabled = false;
        } else {
            console.error('Error fetching characters:', characters.error);
            characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        }
    } catch (error) {
        console.error('Unexpected error updating character options:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
    }
}

// Function to create a raid group SUPABASE
const createRaidGroup = async (raid_id, min_item_level) => {
    if (!raid_id || min_item_level === null || min_item_level === undefined) {
        console.error('Raid ID and minimum item level are required');
        return { error: 'Raid ID and minimum item level are required' };
    }

    try {
        // Fetch the raid name using the correct column name
        const { data: raid, error: raidError } = await supabase
            .from('raids')
            .select('name')
            .eq('id', raid_id)
            .single();

        if (raidError || !raid) {
            console.error('Error fetching raid:', raidError || 'Raid not found');
            return { error: 'Raid not found' };
        }

        const raidName = raid.name;

        // Count existing groups for the raid
        const { count: groupCount, error: countError } = await supabase
            .from('groups')
            .select('*', { count: 'exact' })
            .eq('raid_id', raid_id);

        if (countError) {
            console.error('Error counting groups:', countError);
            return { error: 'Error counting groups' };
        }

        const nextGroupNumber = (groupCount || 0) + 1;
        const groupName = `Group ${nextGroupNumber}`;

        // Insert the new group
        const { data: newGroup, error: insertError } = await supabase
            .from('groups')
            .insert([
                {
                    raid_id,
                    group_name: groupName,
                    min_item_level,
                },
            ])
            .select('id')
            .single();

        if (insertError || !newGroup) {
            console.error('Error creating group:', insertError);
            return { error: 'Error creating group' };
        }

        console.log(`Group "${groupName}" created successfully for raid "${raidName}"`);
        return {
            id: newGroup.id,
            group_name: groupName,
            raid_name: raidName,
            min_item_level,
        };
    } catch (error) {
        console.error('Unexpected error creating group:', error);
        return { error: 'Unexpected server error' };
    }
};

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
        const result = await clearGroupMembers(groupId);

        if (result.error) {
            console.error('Error resetting group:', result.error);
            return { error: result.error };
        }

        console.log('Group reset successfully:', result.message);
        return { message: 'Group reset successfully' };
    } catch (error) {
        console.error('Unexpected error resetting group:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to save group members SUPABASE
async function saveGroupMembers(groupId, members) {
    if (!groupId || !Array.isArray(members) || members.length === 0) {
        console.error('Group ID and valid members data are required');
        return { error: 'Group ID and valid members data are required' };
    }

    try {
        // Clear existing members for the group
        const { error: clearError } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId);

        if (clearError) {
            console.error('Error clearing existing group members:', clearError);
            return { error: 'Error clearing existing group members' };
        }

        // Insert new members
        const { error: insertError } = await supabase
            .from('group_members')
            .insert(
                members.map(member => ({
                    group_id: groupId,
                    player_id: member.player_id,
                    character_id: member.character_id,
                }))
            );

        if (insertError) {
            console.error('Error saving group members:', insertError);
            return { error: 'Error saving group members' };
        }

        console.log('Group members saved successfully');
        return { message: 'Group members saved successfully' };
    } catch (error) {
        console.error('Unexpected error saving group members:', error);
        return { error: 'Unexpected server error' };
    }
}

// Function to handle player selection
async function handlePlayerSelection(playerSelect) {
    const groupElement = playerSelect.closest('.raid-group');
    const groupId = groupElement.getAttribute('data-group-id');
    const characterSelect = playerSelect.closest('td').nextElementSibling.querySelector('.character-select');

    if (!playerSelect.value) {
        // Clear and disable the character dropdown if no player is selected
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
        characterSelect.disabled = true;
        return;
    }

    try {
        // Fetch characters for the selected player and group
        const characters = await fetchCharactersForPlayer(playerSelect.value, groupId);

        if (!characters.error) {
            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>'; // Reset options
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = `${character.classes.name} (${character.item_level})`;

                if (character.assigned_to_group) {
                    option.textContent += ` - Assigned to ${character.assigned_to_group}`;
                    option.disabled = true;
                }

                characterSelect.appendChild(option);
            });

            characterSelect.disabled = false; // Enable the dropdown
        } else {
            console.error('Error fetching characters:', characters.error);
            characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
            characterSelect.disabled = true;
        }
    } catch (error) {
        console.error('Unexpected error fetching characters:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
        characterSelect.disabled = true;
    }
}

// Expose the function globally
  window.handlePlayerSelection = handlePlayerSelection;

// Function to load existing groups SUPABASE
async function loadExistingGroups(raid_id = null) {
    try {
        const groups = await fetchGroupsWithSlots(raid_id);

        if (groups.error) {
            console.error('Error loading groups:', groups.error);
            return;
        }

        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = ''; // Clear previous content

        for (const group of groups) {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('raid-group');
            groupDiv.setAttribute('data-group-id', group.id);

            const groupHeader = document.createElement('div');
            groupHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');

            const headerText = document.createElement('h3');
            headerText.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;

            const minimizeButton = document.createElement('button');
            minimizeButton.textContent = '−';
            minimizeButton.classList.add('btn', 'btn-secondary', 'btn-sm', 'ml-auto');
            minimizeButton.onclick = () => {
                const table = groupDiv.querySelector('.assignment-table');
                table.style.display = table.style.display === 'none' ? 'table' : 'none';
                minimizeButton.textContent = table.style.display === 'none' ? '+' : '−';
            };

            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save';
            saveButton.classList.add('btn', 'btn-primary', 'btn-sm');
            saveButton.onclick = async () => {
                const members = collectGroupMembers(groupDiv);
                if (!members || members.length === 0) {
                    alert('Please select valid players and characters before saving.');
                    return;
                }
                const result = await saveGroupMembers(group.id, members);
                if (result.error) {
                    alert(`Error: ${result.error}`);
                } else {
                    console.log(result.message);
                }
                await updateGroupSlots(group.id, headerText);
            };

            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear';
            clearButton.classList.add('btn', 'btn-warning', 'btn-sm');
            clearButton.onclick = async () => {
                await resetGroup(group.id);
                await updateGroupSlots(group.id, headerText);
            };

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'X';
            deleteButton.classList.add('btn', 'btn-danger', 'btn-sm');
            deleteButton.onclick = async () => {
                await deleteRaidGroup(group.id);
                await loadExistingGroups(raid_id);
            };

            groupHeader.appendChild(headerText);
            groupHeader.appendChild(minimizeButton);
            groupHeader.appendChild(saveButton);
            groupHeader.appendChild(clearButton);
            groupHeader.appendChild(deleteButton);
            groupDiv.appendChild(groupHeader);

            const table = document.createElement('table');
            table.classList.add('assignment-table');

            const partyHeaderRow = document.createElement('tr');
            partyHeaderRow.classList.add('party-header');
            partyHeaderRow.innerHTML = `
                <th colspan="3">Party 1</th>
                <th colspan="3">Party 2</th>
            `;
            table.appendChild(partyHeaderRow);

            const roleHeaderRow = document.createElement('tr');
            roleHeaderRow.classList.add('role-header');
            roleHeaderRow.innerHTML = `
                <th>Player</th>
                <th>Character</th>
                <th>Role</th>
                <th>Player</th>
                <th>Character</th>
                <th>Role</th>
            `;
            table.appendChild(roleHeaderRow);

            for (let i = 0; i < 4; i++) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <select class="player-select form-control" onchange="handlePlayerSelection(this)">
                            <option value="" disabled>Select Player</option>
                        </select>
                    </td>
                    <td>
                        <select class="character-select form-control" disabled>
                            <option value="" disabled selected>Select Character</option>
                        </select>
                    </td>
                    <td>${i < 3 ? 'DPS' : 'Support'}</td>
                    <td>
                        <select class="player-select form-control" onchange="handlePlayerSelection(this)">
                            <option value="" disabled>Select Player</option>
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

            const playerSelects = groupDiv.querySelectorAll('.player-select');
            for (const select of playerSelects) {
                await populatePlayerDropdown(group.id, select);
            }

            await restoreDropdownSelections(group.id);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
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
            // Optionally refresh the character list
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
            // Optionally refresh the character list
        }
    } catch (error) {
        console.error('Unexpected error updating character:', error);
        alert('Unexpected error updating character.');
    }
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
            // Optionally refresh the character list
        }
    } catch (error) {
        console.error('Unexpected error deleting character:', error);
        alert('Unexpected error deleting character.');
    }
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    // Identify the page by checking for specific elements
    const raidSelect = document.getElementById('raid-select'); // For the Raid Organizer page
    const playerForm = document.getElementById('player-form'); // For the Add Player / Character page

    if (raidSelect) {
        // Raid Organizer Page
        populateRaidDropdown();
        loadExistingGroups(); // Load groups initially

        // Load existing groups based on raid selection
        raidSelect.addEventListener('change', async () => {
            const selectedRaidId = raidSelect.value || null; // Handle all groups if no selection
            await loadExistingGroups(selectedRaidId); // Refresh the groups
        });

        document.getElementById('create-raid-btn')?.addEventListener('click', async () => {
            const selectedOption = raidSelect.options[raidSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) {
                alert('Please select a raid to create a group.');
                return;
            }

            const raidId = selectedOption.value;
            const minItemLevel = selectedOption.getAttribute('data-min-ilvl');

            if (!raidId || !minItemLevel) {
                alert('Invalid raid selection or missing minimum item level.');
                return;
            }

            await createRaidGroup(raidId, parseInt(minItemLevel, 10));
            await loadExistingGroups(); // Refresh the groups
        });
    }

    if (playerForm) {
        // Add Player / Character Page
        const playerSelect = document.getElementById('player-select');
        const classSelect = document.getElementById('class-select');
        const characterSelect = document.getElementById('character-select');

        loadPlayersForAddPage(playerSelect);
        loadClassesForAddPage(classSelect);

        playerSelect?.addEventListener('change', async (event) => {
            await loadCharactersForPlayer(event.target.value, characterSelect);
        });

        document.getElementById('add-player-btn')?.addEventListener('click', async () => {
            const usernameInput = document.getElementById('username-input');
            if (usernameInput.value.trim() === '') {
                alert('Please enter a valid username.');
                return;
            }
            await addNewPlayer(usernameInput);
            await loadPlayersForAddPage(playerSelect); // Refresh the player dropdown
        });

        document.getElementById('add-character-btn')?.addEventListener('click', async () => {
            const characterNameInput = document.getElementById('character-name-input');
            const itemLevelInput = document.getElementById('item-level-input');
            if (!playerSelect.value || !characterNameInput.value || !itemLevelInput.value) {
                alert('Please fill in all fields to add a character.');
                return;
            }
            await addNewCharacter(playerSelect, characterNameInput, itemLevelInput, classSelect);
            await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh the character dropdown
        });

        document.getElementById('update-character-btn')?.addEventListener('click', async () => {
            const characterNameInput = document.getElementById('character-name-input');
            const itemLevelInput = document.getElementById('item-level-input');
            if (!characterSelect.value || !characterNameInput.value || !itemLevelInput.value) {
                alert('Please select a character and provide updated details.');
                return;
            }
            await updateCharacterDetails(characterSelect, characterNameInput, itemLevelInput);
            await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh the character dropdown
        });

        document.getElementById('delete-character-btn')?.addEventListener('click', async () => {
            if (!characterSelect.value) {
                alert('Please select a character to delete.');
                return;
            }
            await deleteCharacterFromPlayer(characterSelect);
            await loadCharactersForPlayer(playerSelect.value, characterSelect); // Refresh the character dropdown
        });
    }
});
