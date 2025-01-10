
// Function to restore dropdown selections from localStorage
async function restoreDropdownSelections(groupId) {
    const savedSelections = localStorage.getItem(`group_${groupId}_selections`);
    if (!savedSelections) return;

    const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
    const playerSelects = groupElement.querySelectorAll('.player-select');
    const characterSelects = groupElement.querySelectorAll('.character-select');

    const selections = JSON.parse(savedSelections);

    for (let index = 0; index < selections.length; index++) {
        const selection = selections[index];
        const playerSelect = playerSelects[index];
        const characterSelect = characterSelects[index];

        if (selection.player) {
            await loadPlayersForDropdown(playerSelect, groupId, selection.player);
            playerSelect.dispatchEvent(new Event('change'));
        }

        if (selection.character) {
            const response = await fetch(`/api/characters?player_id=${selection.player}&group_id=${groupId}`);
            if (response.ok) {
                const characters = await response.json();
                characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
                characters.forEach(character => {
                    if (character.meets_min_item_level) {
                        const option = document.createElement('option');
                        option.value = character.id;
                        option.textContent = `${character.class_name} (${character.item_level})`;

                        if (character.assigned_to_group) {
                            option.textContent += ` - Assigned to ${character.assigned_to_group}`;
                            option.disabled = true;
                        }

                        characterSelect.appendChild(option);
                    }
                });
                characterSelect.value = selection.character;
                characterSelect.disabled = false;
            }
        }
    }
}

// Function to populate characters in a dropdown
async function handlePlayerSelection(selectElement) {
    const groupElement = selectElement.closest('.raid-group');
    const playerSelects = groupElement.querySelectorAll('.player-select');
    const characterSelects = groupElement.querySelectorAll('.character-select');
    const groupId = groupElement.getAttribute('data-group-id');

    // Track selected players and characters within the group
    const selectedPlayers = new Set();
    const selectedCharacters = new Set();

    playerSelects.forEach(select => {
        if (select.value) {
            selectedPlayers.add(select.value);
        }
    });

    characterSelects.forEach(select => {
        if (select.value) {
            selectedCharacters.add(select.value);
        }
    });

    // Disable already-selected players in all player dropdowns
    playerSelects.forEach(select => {
        Array.from(select.options).forEach(option => {
            if (option.value === '') return; // Skip the placeholder
            option.disabled = selectedPlayers.has(option.value) && select.value !== option.value;
        });
    });

    const characterSelect = selectElement.closest('td').nextElementSibling.querySelector('.character-select');
    characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
    characterSelect.disabled = true;

    if (!selectElement.value) return;

    try {
        const response = await fetch(`/api/characters?player_id=${selectElement.value}&group_id=${groupId}`);
        if (!response.ok) throw new Error('Failed to fetch characters');

        const characters = await response.json();
        const eligibleCharacters = [];
        const ineligibleCharacters = [];

        characters.forEach(character => {
            if (character.meets_min_item_level) {
                if (!character.assigned_to_group) {
                    eligibleCharacters.push(character);
                } else {
                    ineligibleCharacters.push(character);
                }
            }
        });

        eligibleCharacters.sort((a, b) => a.class_name.localeCompare(b.class_name));
        ineligibleCharacters.sort((a, b) => a.class_name.localeCompare(b.class_name));

        eligibleCharacters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.id;
            option.textContent = `${character.class_name} (${character.item_level})`;
            characterSelect.appendChild(option);
        });

        ineligibleCharacters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.id;
            option.textContent = `${character.class_name} (${character.item_level}) - Assigned to ${character.assigned_to_group}`;
            option.disabled = true;
            characterSelect.appendChild(option);
        });

        characterSelect.disabled = false;
    } catch (error) {
        console.error('Error fetching characters:', error);
        characterSelect.innerHTML = '<option value="" disabled selected>Error loading characters</option>';
    }
}

// Function to populate players in a dropdown
async function loadPlayersForDropdown(select, groupId, savedPlayer = null) {
    try {
        const response = await fetch(`/api/groups/players?group_id=${groupId}`);
        if (!response.ok) throw new Error('Failed to fetch players');

        const players = await response.json();
        const eligiblePlayers = [];
        const ineligiblePlayers = [];

        players.forEach(player => {
            if (player.has_eligible_characters) {
                eligiblePlayers.push(player);
            } else {
                ineligiblePlayers.push(player);
            }
        });

        eligiblePlayers.sort((a, b) => a.username.localeCompare(b.username));
        ineligiblePlayers.sort((a, b) => a.username.localeCompare(b.username));

        select.innerHTML = '<option value="" disabled selected>Select Player</option>';

        // Add eligible players
        eligiblePlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.username;
            select.appendChild(option);
        });

        // Add ineligible players
        ineligiblePlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.username} (No characters)`;
            option.disabled = true;
            select.appendChild(option);
        });

        // Ensure saved player remains selected
        if (savedPlayer) {
            const option = select.querySelector(`option[value="${savedPlayer}"]`);
            if (option) {
                option.selected = true;
            }
        }
    } catch (error) {
        console.error('Error loading players:', error);
    }
}

// Function to populate raids in the dropdown
async function loadRaids() {
    try {
        const response = await fetch('/api/groups/raids');
        if (!response.ok) throw new Error('Failed to fetch raids');

        const raids = await response.json();
        const raidSelect = document.getElementById('raid-select');

        raidSelect.innerHTML = '<option value="" disabled selected>Select Raid</option>';
        raids.forEach(raid => {
            const option = document.createElement('option');
            option.value = raid.id;
            option.textContent = `${raid.name} (Min IL: ${raid.min_item_level})`; // Include name and min item level
            option.setAttribute('data-min-item-level', raid.min_item_level); // Store min item level for later use
            raidSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading raids:', error);
    }
}

// Function to update character options based on selected player
async function updateCharacterOptions(selectElement) {
    const selectedPlayerId = selectElement.value;
    const characterSelect = selectElement.closest('td').nextElementSibling.querySelector('.character-select');

    if (selectedPlayerId) {
        try {
            const response = await fetch(`http://localhost:3006/characters?player_id=${selectedPlayerId}`);
            if (!response.ok) throw new Error('Failed to fetch characters');

            const characters = await response.json();
            characterSelect.disabled = false;

            characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = `${character.class_name} (IL: ${character.item_level})`;
                characterSelect.appendChild(option);
            });

            if (characters.length === 0) {
                characterSelect.disabled = true;
            }
        } catch (error) {
            console.error('Error fetching characters:', error);
            characterSelect.innerHTML = '<option value="" disabled selected>Error loading characters</option>';
        }
    } else {
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';
    }
}

// Function to create a raid group
async function createGroup() {
    try {
        const raidSelect = document.getElementById('raid-select');
        const raidId = raidSelect.value;

        // Debug: Log dropdown state
        console.log('Dropdown Value:', raidId);
        console.log('Selected Option:', raidSelect.options[raidSelect.selectedIndex]);

        if (!raidId) {
            alert('Please select a raid before creating a group.');
            return;
        }

        const minItemLevel = raidSelect.options[raidSelect.selectedIndex].dataset.minItemLevel;
        console.log('Min Item Level:', minItemLevel);

        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raid_id: raidId, min_item_level: minItemLevel }),
        });

        if (!response.ok) throw new Error('Failed to create group');

        const group = await response.json();
        alert(`Group created with ID: ${group.group_name}`);

        await loadExistingGroups();
    } catch (error) {
        console.error('Error creating group:', error);
    }
}

// Function to delete a raid group
async function deleteGroup(groupId) {
    try {
        const response = await fetch(`/api/groups/${groupId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            if (response.status === 404) throw new Error('Group not found');
            throw new Error('Failed to delete group');
        }

        alert('Group deleted successfully!');
        await loadExistingGroups(); // Reload the groups after deletion
    } catch (error) {
        console.error('Error deleting group:', error);
        alert(error.message);
    }
}

// Function to reset a group
async function resetGroup(groupId) {
    try {
        const response = await fetch(`/api/groups/${groupId}/members`, {
            method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to reset group members');

        const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
        const playerSelects = groupElement.querySelectorAll('.player-select');
        const characterSelects = groupElement.querySelectorAll('.character-select');

        playerSelects.forEach(select => {
            select.value = '';
            select.dispatchEvent(new Event('change')); // Trigger dropdown update
        });

        characterSelects.forEach(select => {
            select.innerHTML = '<option value="" disabled selected>Select Character</option>';
            select.disabled = true;
        });

        localStorage.removeItem(`group_${groupId}_selections`); // Clear saved state

        alert('Group reset successfully!');
    } catch (error) {
        console.error('Error resetting group:', error);
        alert('Error resetting group.');
    }
}

// Function to save group members
async function saveGroupMembers(groupId) {
    try {
        const groupElement = document.querySelector(`.raid-group[data-group-id='${groupId}']`);
        const playerSelects = groupElement.querySelectorAll('.player-select');
        const characterSelects = groupElement.querySelectorAll('.character-select');

        const members = [];
        const savedSelections = [];

        playerSelects.forEach((playerSelect, index) => {
            const characterSelect = characterSelects[index];
            if (playerSelect.value && characterSelect.value) {
                members.push({
                    player_id: parseInt(playerSelect.value, 10),
                    character_id: parseInt(characterSelect.value, 10),
                });

                savedSelections.push({
                    player: playerSelect.value,
                    player_name: playerSelect.options[playerSelect.selectedIndex]?.textContent || 'Unknown Player',
                    character: characterSelect.value,
                    character_name: characterSelect.options[characterSelect.selectedIndex]?.textContent || 'Unknown Character',
                });
            }
        });

        const response = await fetch(`/api/groups/${groupId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members }),
        });

        if (!response.ok) throw new Error('Failed to save group members');

        localStorage.setItem(`group_${groupId}_selections`, JSON.stringify(savedSelections));

        alert('Group members saved successfully!');
    } catch (error) {
        console.error('Error saving group members:', error);
        alert(error.message);
    }
}

// Function to load existing groups
async function loadExistingGroups() {
    try {
        const response = await fetch('/api/groups');
        if (!response.ok) throw new Error('Failed to fetch groups');

        const groups = await response.json();
        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = ''; // Clear previous content

        for (const group of groups) {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('raid-group');
            groupDiv.setAttribute('data-group-id', group.id);

            const groupHeader = document.createElement('div');
            groupHeader.classList.add('d-flex', 'justify-content-between', 'align-items-center');

            // Group Header with Raid Name and Slots Count
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
                await saveGroupMembers(group.id);
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
                await deleteGroup(group.id);
                await loadExistingGroups();
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

            // Populate dropdowns for players and restore selections
            const playerSelects = groupDiv.querySelectorAll('.player-select');
            const restorePromises = [];
            playerSelects.forEach((select, index) => {
                const savedSelections = localStorage.getItem(`group_${group.id}_selections`);
                const savedSelection = savedSelections ? JSON.parse(savedSelections)[index]?.player : null;

                const restorePromise = loadPlayersForDropdown(select, group.id, savedSelection).then(() => {
                    if (savedSelection) {
                        const option = document.createElement('option');
                        option.value = savedSelection;
                        option.textContent = `Restored Player (${savedSelection})`; // Placeholder for the player name
                        option.selected = true;
                        select.appendChild(option);
                    }
                    handlePlayerSelection(select);
                });
                restorePromises.push(restorePromise);
            });

            // Restore saved selections after all dropdowns are populated
            await Promise.all(restorePromises);
            restoreDropdownSelections(group.id);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Update slots count dynamically
async function updateGroupSlots(groupId, headerTextElement) {
    try {
        const response = await fetch(`/api/groups`);
        if (!response.ok) throw new Error('Failed to fetch group slots');

        const groups = await response.json();
        const group = groups.find(g => g.id === groupId);

        if (group) {
            headerTextElement.textContent = `${group.raid_name} (Min IL: ${group.min_item_level}) - ${group.group_name} (${group.filled_slots}/${group.total_slots})`;
        }
    } catch (error) {
        console.error('Error updating group slots:', error);
    }
}

// Function to load players to add players page
async function loadPlayersForAddPage() {
    const playerSelect = document.getElementById('player-select');
    try {
        const response = await fetch('/api/groups/players/all');
        if (!response.ok) throw new Error('Failed to fetch players');

        const players = await response.json();
        playerSelect.innerHTML = '<option value="" disabled selected>Select Player</option>';

        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.username;
            playerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading players:', error);
        playerSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
    }
}

// Function to load classes to add players page
async function loadClasses() {
    const classSelect = document.getElementById('class-select');
    try {
        const response = await fetch('/api/characters/classes');
        if (!response.ok) throw new Error('Failed to fetch classes');

        const classes = await response.json();
        classSelect.innerHTML = '<option value="" disabled selected>Select Class</option>';

        classes.forEach(characterClass => {
            const option = document.createElement('option');
            option.value = characterClass.id;
            option.textContent = characterClass.name;
            classSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading classes:', error);
        classSelect.innerHTML = '<option value="" disabled>Error loading classes</option>';
    }
}

// Function to load characters of a player in add players page
async function loadCharactersForPlayer(playerId) {
    const characterSelect = document.getElementById('character-select');
    const groupId = document.getElementById('group-select')?.value; // Replace with the actual group ID source if available

    if (!playerId) {
        console.error('Player ID is missing.');
        characterSelect.innerHTML = '<option value="" disabled selected>Select Player First</option>';
        return;
    }

    try {
        // Construct the endpoint dynamically based on the presence of group_id
        const endpoint = groupId
            ? `/api/characters?player_id=${playerId}&group_id=${groupId}`
            : `/api/characters?player_id=${playerId}`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Failed to fetch characters');

        const characters = await response.json();
        characterSelect.innerHTML = '<option value="" disabled selected>Select Character</option>';

        characters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.id;
            option.textContent = `${character.name} (${character.class_name}, IL: ${character.item_level})`;
            characterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading characters:', error);
        characterSelect.innerHTML = '<option value="" disabled>Error loading characters</option>';
    }
}

// Function to add a new player in add players page
async function addPlayer() {
    const usernameInput = document.getElementById('username');
    const username = usernameInput.value.trim();

    // Validate the input
    if (!username) {
        alert('Please enter a username.');
        return;
    }

    try {
        // Send a POST request to the backend
        const response = await fetch('/api/groups/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });

        if (!response.ok) throw new Error('Failed to add player');

        alert('Player added successfully!');
        usernameInput.value = ''; // Clear the input field
        loadPlayersForAddPage(); // Refresh the player dropdown
    } catch (error) {
        console.error('Error adding player:', error);
        alert('Error adding player.');
    }
}

// Function to add a new character to the selected player in add players page
async function addCharacter() {
    const playerSelect = document.getElementById('player-select');
    const characterName = document.getElementById('character-name').value;
    const itemLevel = document.getElementById('item-level').value;
    const classSelect = document.getElementById('class-select');

    if (!playerSelect.value || !characterName || !itemLevel || !classSelect.value) {
        alert('All fields are required to add a character.');
        return;
    }

    try {
        const response = await fetch('/api/characters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player_id: playerSelect.value,
                name: characterName,
                item_level: parseInt(itemLevel, 10),
                class_id: classSelect.value,
            }),
        });

        if (!response.ok) throw new Error('Failed to add character');

        alert('Character added successfully!');
        loadCharactersForPlayer(playerSelect.value);
    } catch (error) {
        console.error('Error adding character:', error);
        alert('Error adding character.');
    }
}

// Function to update character in add players page
async function updateCharacter() {
    const characterSelect = document.getElementById('character-select');
    const characterName = document.getElementById('character-name').value;
    const itemLevel = document.getElementById('item-level').value;

    if (!characterSelect.value || !characterName || !itemLevel) {
        alert('Select a character and provide new details to update.');
        return;
    }

    try {
        const response = await fetch(`/api/characters/${characterSelect.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: characterName,
                item_level: parseInt(itemLevel, 10),
            }),
        });

        if (!response.ok) throw new Error('Failed to update character');

        alert('Character updated successfully!');
        loadCharactersForPlayer(document.getElementById('player-select').value);
    } catch (error) {
        console.error('Error updating character:', error);
        alert('Error updating character.');
    }
}

// Function to delete character in add players page
async function deleteCharacter() {
    const characterSelect = document.getElementById('character-select');

    if (!characterSelect.value) {
        alert('Select a character to delete.');
        return;
    }

    try {
        const response = await fetch(`/api/characters/${characterSelect.value}`, {
            method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete character');

        alert('Character deleted successfully!');
        loadCharactersForPlayer(document.getElementById('player-select').value);
    } catch (error) {
        console.error('Error deleting character:', error);
        alert('Error deleting character.');
    }
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    // Identify the page by checking for specific elements
    const raidSelect = document.getElementById('raid-select'); // For the Raid Organizer page
    const playerForm = document.getElementById('player-form'); // For the Add Player / Character page
    

    if (raidSelect) {
        // Raid Organizer Page
        loadRaids();
        loadExistingGroups();

        document.getElementById('create-raid-btn')?.addEventListener('click', createGroup);
    }

    if (playerForm) {
        // Add Player / Character Page
        loadPlayersForAddPage();
        loadClasses();

        document.getElementById('player-select')?.addEventListener('change', (event) => {
            loadCharactersForPlayer(event.target.value);
        });

        document.getElementById('add-player-btn')?.addEventListener('click', addPlayer);
        document.getElementById('add-character-btn')?.addEventListener('click', addCharacter);
        document.getElementById('update-character-btn')?.addEventListener('click', updateCharacter);
        document.getElementById('delete-character-btn')?.addEventListener('click', deleteCharacter);
    }
});
