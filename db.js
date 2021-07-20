//Require Mongoose
const mongoose = require('mongoose');
const moment = require('moment')
const createHash = require('crypto').createHash
require('dotenv').config()

mongoose.connect(process.env.db,
    { useNewUrlParser: true, useUnifiedTopology: true, 'useFindAndModify': false, 'useCreateIndex': true });
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

exports.getExpiredFiles = function () {
    return FileModel.find({
        "expiry": { "$lt": moment() }
    },
        projection = { "_id": 1, "filename": 1 }
    )
}

exports.purgeExpiredFiles = function () {
    return FileModel.deleteMany({
        "expiry": { "$lt": moment() }
    })
}

//Site access tokens
var TokenSchema = new Schema({
    token: String,
}, {
    versionKey: false,
    timestamps: true
})
TokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 })

let TokenModel = mongoose.model('tokens', TokenSchema);

exports.addSiteToken = function (token) {
    return TokenModel.create({
        token,
    })
}

exports.checkSiteToken = function (token) {
    return TokenModel.find({
        token
    })
}