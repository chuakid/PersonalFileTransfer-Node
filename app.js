const express = require('express');
const controller = require('./controller');
const cors = require('cors')
const port = 8000;
const app = express();
require('dotenv').config()

if (process.env.NODE_ENV === "development") {
    app.use(cors())
}
app.use('/api', controller);

app.listen(port, () => { console.log("Listening on port " + port); })