const express = require('express');
const controller = require('./controller');
const port = 8000;
const app = express();

app.use('/api', controller);

app.listen(port, () => { console.log("Listening on port " + port); })