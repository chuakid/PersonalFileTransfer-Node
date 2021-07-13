//Require Mongoose
const mongoose = require('mongoose');
const moment = require('moment')
const createHash = require('crypto').createHash
require('dotenv').config()

mongoose.connect(process.env.db,
    { useNewUrlParser: true, useUnifiedTopology: true, 'useFindAndModify': false });
let db = mongoose.connection;



db.on('error', console.error.bind(console, "MongoDB connection error:"))

//Define a schema
var Schema = mongoose.Schema;

var FileSchema = new Schema({
    filename: String,
    expiry: Date,
    password: String,
    tokens: Array
}, {
    versionKey: false
});

let FileModel = mongoose.model('files', FileSchema);

exports.getFileInfo = function (file_id) {
    return FileModel.findById(file_id);
}

exports.insertFile = function (filename, password) {
    password = createHash('sha256').update(password).digest('hex') //hash password
    return FileModel.create({
        "filename": filename,
        "expiry": moment().add("1", "h"),
        "password": password,
        "tokens": []
    })
}

exports.checkPassword = function (file_id, password) {
    return FileModel.findById(file_id)
        .then((file) => {
            if (!file) {
                return false
            }
            return createHash('sha256').update(password).digest('hex') == file.password;
        })
        .catch((e) => {
            console.log(e);
            return false
        });
}

exports.setToken = function (file_id, token) {
    return FileModel.findByIdAndUpdate(file_id, {
        $push: {
            "tokens": token
        }
    })
        .then(() => { return token })
        .catch((e) => {
            console.log(e);
            return
        });
}

exports.removeToken = function (file_id, token) {
    return FileModel.findByIdAndUpdate(file_id, {
        $pull: {
            "tokens": token
        }
    })
        .then(() => { return token })
        .catch((e) => {
            console.log(e);
            return
        });
}