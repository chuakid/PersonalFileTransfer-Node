var express = require('express');
const multer = require('multer');
const fs = require("fs");
const db = require("./db")
const path = require("path");
const moment = require('moment');
const createHash = require('crypto').createHash;
const randomBytes = require('crypto').randomBytes;
const { ToadScheduler, SimpleIntervalJob, AsyncTask } = require('toad-scheduler')
require('dotenv').config()

let router = express.Router();

//Initialize multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "temp")
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
const upload = multer({ storage })

//Check password for site
router.post("/login", express.json(), function (req, res, next) {
  if (!req.body.password) {
    res.status(401).json("Password required")
    return
  }
  if (createHash('sha256').update(req.body.password).digest('hex') === process.env.SITE_PASSWORD) {
    const token = randomBytes(48).toString("hex");
    db.addSiteToken(token)
      .then(() => {
        res.json({ token })
      })
      .catch((e) => {
        console.log(e);
        res.status(500).json("Server error")
      })

  } else {
    res.status(401).json("Password incorrect")
  }
})

//Check site token
router.post("/sitetokenvalidity", function (req, res, next) {
  if (!req.get("authorization")) {
    return res.json({ "validity": false })
  }
  db.checkSiteToken(req.get("authorization"))
    .then((token) => {
        res.json({"validity": token.length !== 0})
    })
    .catch((e) => {
        res.status(500).json("Server error")
    })
})

//Middleware to check password
function authenticate(req, res, next) {
  if (!req.get("authorization")) {
    return res.status(401).json("Token required")

  }
  db.checkSiteToken(req.get("authorization"))
    .then((token) => {
      if (token.length === 0)
        throw { "code": 401, "message": "Wrong token" }
      next()
    })
    .catch((e) => {
      if (e.code)
        res.status(e.code).json(e.message)
      else
        res.status(500).json("Server error")

    })
}

router.use(authenticate)
//Get file info
router.get('/file/:file_id', function (req, res, next) {
  db.getFileInfo(req.params.file_id)
    .then((file) => {
      if (!file) {
        throw { 'code': 404, 'message': "File not found" }
      }
      //Get time to expiry
      let duration = moment.duration(moment(file.expiry).diff(moment()))
      let hours = Math.floor(duration.asHours());
      let minutes = Math.round(duration.asMinutes());

      res.json({
        "filename": file["filename"],
        "passwordneeded": file.password != createHash('sha256').update("").digest('hex'), //Check if password needed
        "hours": hours,
        "minutes": minutes
      })
    })
    .catch((e) => {
      if (e.code)
        res.status(e.code).json(e.message)
      else
        res.status(500).json("Server error")
      console.log(e);
    })
});

function checkUploadFoldersExist(req, res, next) {
  if (!fs.existsSync("files")) {
    try {
      fs.mkdirSync("files", { recursive: true })
    } catch (e) {
      console.log(e);
    }
  }

  if (!fs.existsSync("temp")) {
    try {
      fs.mkdirSync("temp", { recursive: true })
    } catch (e) {
      console.log(e);
    }
  }
  next()
}
//Upload file
router.put("/file", checkUploadFoldersExist, upload.single('file'), function (req, res, next) {
  db.insertFile(req.file.filename, req.body.password)
    .then((insertedFile) => {
      try {
        fs.mkdirSync(path.join("files", insertedFile.id), { recursive: true }) //make folder for file
      } catch (e) {
        console.log(e);
        return
      }
      //Move file from temp folder to files
      fs.renameSync(req.file.path, path.join("files", insertedFile.id, req.file.filename))

      res.json({ "file_id": insertedFile.id }); //Send the ID back to client
    })
    .catch((e) => {
      res.status(500).json("error")
      console.log(e);
    })
});

//Get file
router.get("/file/:file_id/:token", function (req, res, next) {
  db.getFileInfo(req.params.file_id)
    .then((file) => {
      if (!file)
        throw { "code": 404, "message": "File doesn't exist" }
      //Check token
      if (!file.tokens.includes(req.params.token))
        throw { "code": 401, "message": "Token invalid" }

      req.filename = file.filename
    })
    .then(db.removeToken(req.params.file_id, req.params.token))
    .then(() => {
      res.download(path.join("files", req.params.file_id, req.filename))
    })
    .catch((e) => {
      if (e.code)
        res.status(e.code).json(e.message)
      else
        res.status(500).json("Server error")
    })
})


//Get token and check password
router.post("/token/:file_id", express.json(), function (req, res, next) {
  db.getFileInfo(req.params.file_id) //Check if file exists
    .then((file) => {
      if (!file) {
        throw { "code": 404, "message": "File doesn't exist" }
      }
      if (req.body.password === null) { //check if password is entered
        throw { "code": 401, "message": "Password required" }
      }
      if (createHash('sha256').update(req.body.password).digest('hex') != file.password) { //check password
        throw { "code": 401, "message": "Password incorrect" }
      }
      return randomBytes(48).toString('hex');
    })
    .then((token) => { return db.setToken(req.params.file_id, token) }) //set token in database
    .then((token) => {
      res.json({ "token": token })
    })
    .catch((e) => {
      if (e.code)
        res.status(e.code).json(e.message)
      else
        res.status(500).json("Server error")
    })

})

//Purge old files
function purgeExpiredFiles() {
  return db.getExpiredFiles()
    .then((result) => {
      result.forEach((file) => {
        fs.rmdirSync(path.join('files', String(file._id)), { recursive: true })
      })
    })
    .then(() => { return db.purgeExpiredFiles() })
    .then(() => { console.log("Files purged"); })
    .catch((e) => {
      console.log(e);
    })
}
const scheduler = new ToadScheduler()
const task = new AsyncTask('Purge Files', purgeExpiredFiles, (err) => { console.log(err); })
const job = new SimpleIntervalJob({ seconds: 60, }, task)
scheduler.addSimpleIntervalJob(job)

module.exports = router;
