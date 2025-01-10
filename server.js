const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const groupsRouter = require('./groups');
const charactersRouter = require('./characters');
const app = express();
const port = 3006;

// Middleware setup
app.use(cors());
app.use(bodyParser.json());

// Serve static files from a specified path (e.g., ./public)
const staticPath = path.resolve('./public');
app.use(express.static(staticPath));

// Mount the groups router under the /api path
app.use('/api/groups', groupsRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/players', require('./groups'));

// Default fallback route for single-page applications
app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});