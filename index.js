const{ Stitch, UserPasswordCredential, RemoteMongoClient} = require('mongodb-stitch-server-sdk')

const express = require('express');
const app = express()
const path = require('path')

const port = process.env.PORT || 3000 // use env port fallback to port 3000

// mongodb stitch config
const stitch_key = require('./stitch_app_key')
const app_id = stitch_key.stitch_app_key // mongoDB stitch app key
const usr = stitch_key.username // default stitch user
const pwd = stitch_key.password // default stitch user password

// a star routing logic
const Astar = require('node-astar')

// file management
const csv2json = require('csvjson-csv2json')
const fs = require('fs')

// upload requirements
const fileUpload = require('express-fileupload')
const cors = require('cors')
const bodyParser = require('body-parser')
const morgan = require('morgan')
const _ = require('lodash')

// geographic helper methods
const turf = require('@turf/turf')

// home landing
app.get('/', (req, res) => {
    res.send('Visit /hazards for a list of all hazards')
})

// middleware definitions

// enable file upload
app.use(fileUpload({
    createParentPath: true,
    limits:{
        
    }
}));

// other middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(morgan('dev'));


// --- Stitch Client OAuth ---
// stitch initialization routine
const stitch_client = Stitch.initializeDefaultAppClient(app_id) // initialize default app client using credentials

// stitch login as default user for now
stitch_client.auth.loginWithCredential(new UserPasswordCredential(usr, pwd))
.then((user) =>{
    console.log('Login success for: ' + user.profile.email) // login success
})
.catch(err =>{
    console.error(err) // login error
})

// collections to user
const db = 'cara'
const markers = 'markers'
// --- Stitch Client OAuth --- *end

// --------------- DATA PROCESSING ------------------------------

// handleCSVUpload()
// description: handles a csv payload by serving a form to the user to upload a csv
// inputs: csv file
// outputs: true or false of loaded into db

function handleCSVUpload(){

    app.get('/form-csv', (req, res) =>{
        res.sendFile(path.join(__dirname + '/csv_upload.html'))
    })

    app.post('/uploaded-csv', (req, res) =>{
        
        try{
            console.log(req.files)
            if(!req.files){
                res.send({
                    status: false,
                    message: 'No file uploaded'
                });
            }else{
                var file = req.files.hazard // csv file payload
                var types = req.body.type // type to route to proper db channels
                

                if(file.name.includes('.csv')){ // checks for .csv files working on support excel format
                    file.mv('./csv_files/' + file.name)

                    filePath = './csv_files/' + file.name

                    // process and upload payload
                    processCSVHazards(filePath, types)



                    res.send({
                        status: true,
                        message: 'File upload success',
                        data: {
                           name: file.name,
                           mimetype: file.mimetype,
                            size: file.size
                        }
                    })
                } else{
                    res.send({
                        status: false,
                        message: 'File must be a .csv'
                    })
                }

                
            }
        }
        catch (err){
            res.status(500).send(err)
        }
        
    })
}

// processCSV()
// description: processes raw csv text into a json object array then injects it
// inputs: string csv
// outputs: json array

// note: validate csv needed

function processCSVHazards(csvFilePath, type){

    if(type === 'hazard'){
        fs.readFile(csvFilePath, 'utf8', (err, data) =>{
            if(err){
                throw err;
                // don't know if it needs to return but will return -1
            }
            else{
                csv_data = data
                var json_data = csv2json(csv_data, {parseNumbers: true, parseJSON: true});

                for(var i in json_data){
                    if(json_data[i].name !== null && json_data[i].description !== null &&
                        json_data[i].buildings !== null && json_data[i].type !== null && json_data[i].lat !== null &&
                        json_data[i].lng !== null){ // dont care about college as some hazards could not be tied to a college down the line
                            // valid csv file insert it and respond that its valid
                            insertHazard(json_data[i], stitch_client, db, markers)
                    }else{
                        //invalid csv
                        console.log('invalid csv') // needs to report out to the response obj somehow
                    } 
                    
                }
            }
        })
        console.log('hazard csv success')
    }else if(type === 'building'){
        fs.readFile(csvFilePath, 'utf8', (err, data) =>{
            if(err){
                throw err;
                // don't know if it needs to return but will return -1
            }
            else{
                csv_data = data
                var json_data = csv2json(csv_data, {parseNumbers: true, parseJSON: true});
                for(var i in json_data){
                    insertBuilding(json_data[i], stitch_client, 'cara', 'buildings')
                }
            }
        })
        console.log("building csv success")
    }else{
        // do nothing
        console.log('no type specified')
    }

    
}

// ---------------------- LOAD FUNCTIONS -------------------------------------

// loadHazards()
// description: loads data object from mongodb collection with filters
// inputs: StitchClientObj, string, string
// outputs: BSONObj or -1 for failure to find
// note: ** more robust filters should be implemented but im kinda rushing/ lazy this is simply going to handle college

function loadHazards(client, db, collection){

    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)

        app.get('/hazards', (req, res) =>{
    
            var data = null
    
            data = mongodb_collection.find({recent: true}, {sort: {date: -1}})
            .asArray()
            .then(docs =>{
                res.json(docs)
            })
            .catch(err => {
                console.error(err)
            })
        })
        // college filters
        app.get('/hazards/college/:collegeId', (req, res) =>{
    
            var data = null
    
            data = mongodb_collection.find({college: req.params.collegeId}, {sort: {date: -1}})
            .asArray()
            .then(docs =>{
                res.json(docs)
            })
            .catch(err => {
                console.error(err)
            })
        })
        // building filters
        app.get('/hazards/building/:buildingId', (req, res) =>{

            var data = null

            data = mongodb_collection.find({buildings: req.params.buildingId}, {sort: {date: -1}})
            .asArray()
            .then(docs =>{
                res.json(docs)
            })
            .catch(err => {
                console.error(err)
            })

        })
        // type filters
        app.get('/hazards/type/:typeId', (req, res) =>{

            var data = null

            data = mongodb_collection.find({type: req.params.typeId}, {sort: {date: -1}})
            .asArray()
            .then(docs =>{
                res.json(docs)
            })
            .catch(err => {
                console.error(err)
            })
        })
    
}

// loadBuildings()
// description: loads all buildings for a given campus

function loadBuildings(client, db, collection){

    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)
    const mongodb_hazards = mongodb_db.collection('markers')

        app.get('/buildings', (req, res) =>{
            var data = null

            data = mongodb_collection.find({recent: true})
            .asArray()
            .then(docs => {
                res.json(docs)
            })
            .catch(err =>{
                console.error(err)
            })
        })

        // sort buildings by college
        app.get('/buildings/college/:collegeId', (req, res) =>{

            var data = null

            data = mongodb_collection.find({college: req.params.collegeId})
            .asArray()
            .then(docs => {
                res.json(docs)
            })
            .catch(err =>{
                console.error(err)
            })
        })

        // get hazards near certain building (function for revealing nearby hazards works in routing protocol as well)
        app.get('/buildings/getnear/:buildingId', (req, res) =>{

            var data = null;

            data = mongodb_collection.find({building: req.params.buildingId})
            .asArray()
            .then(docs => {

                var buildingLat = docs[0].coordinates.latitude
                var buildingLng = docs[0].coordinates.longitude
                var buildingCoord = [buildingLat, buildingLng]
                var buildingNorth = [buildingLat + .0008, buildingLng]
                var buildingSouth = [buildingLat - .0008, buildingLng]
                var buildingWest = [buildingLat, buildingLng + .0008]
                var buildingEast = [buildingLat, buildingLng - .0008]

                var buildPolygon = turf.polygon([[buildingNorth, buildingEast, buildingSouth, buildingWest, buildingNorth]])

                mongodb_hazards.find({recent: true})
                .asArray()
                .then(docs =>{
                    var points = []
                    for (var i in docs){
                        points.push([docs[i].coordinates.latitude, docs[i].coordinates.longitude])

                    }
                    var pointsObj = turf.points(points,  {info: docs[i]})
                    var nearby = turf.pointsWithinPolygon(pointsObj, buildPolygon)

                    res.json(nearby.features)

                    
                })
            })

            

            // add 0.0008 for bounding box
        })
}

// ------------------- INSERT FUNCTIONS ------------------

// insertHazard()
// description: handles a new hazard request and adds it to the server

function insertHazard(hazard, client, db, collection){
    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)

    // need to add a duplicate checker but for now its fine

    // duplicate check *if building or hazard is a duplicate it will
    // not insert and will log a duplicate error (checks name, desc, college, type for specificity and coords as they are least likely to accidently become duplicates (coordinate duplicates might need a better method as ...
    // certain hazards could exist on the same coordinate location
    // console.log(hazard.name)
    mongodb_collection.findOne({name: hazard.name, description: hazard.description, college: hazard.college, type: hazard.type})
    .then(docs => {
        if(docs === undefined){
            mongodb_collection.insertOne({
                name: hazard.name,
                description: hazard.description,
                buildings: hazard.buildings,
                type: hazard.type,
                college: hazard.college,
                coordinates: {
                    latitude: hazard.lat,
                    longitude: hazard.lng
                },
                date: new Date(),
                recent: true
            })
            .then(() =>{
                console.log('Insert of hazard: ' + hazard.name + ' success')
            })
            .catch(err => {
                console.error(err)
            })
        }else{
            console.log('Duplicate error: ' + hazard.name + ' is a duplicate')
        }
    })

    

}

function insertBuilding(building, client, db, collection){
    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)

    mongodb_collection.findOne({college: building.campus, building: building.campus, coordinates: {latitude: building.latitude, longitude: building.longitude}})
    .then(docs =>{
        if(docs === undefined){
            mongodb_collection.insertOne({
                college: building.campus,
                building: building.building,
                coordinates: {
                    latitude: building.latitude,
                    longitude: building.longitude
                },
                date: new Date(),
                recent: true
            })
            .then(() =>{
                console.log('Insert of building: ' + building.building + ' success')
            })
            .catch(err =>{
                console.error(err)
            })
        }else{
            console.log("Duplicate Building Error: " + building.building + ' | ' + building.campus)
        }
    })

    

}

// calculateRawRoute()
// description: calculate raw route data based on just hazards listed

function calculateRawRoute(client, db, collection){
    const n1 = Astar.Node('1', 42.421654, -76.497376)
    const n2 = Astar.Node('2', 42.422763, -76.496647)
    const n3 = Astar.Node('3', 42.422675, -76.494984)

    const neighbors = function (node, next) {
        if(node.id == '1'){
            ret = [n2]
        }
        else if(node.id == '2'){
            ret = [n1, n3]
        }
        else if(node.id == '3'){
            ret = [n2]
        }
        else{
            ret = []
        }

        next (ret)
    }

    var a = new Astar(neighbors)
    var start = n1;
    var end = n3;
    a.search(start, end, function(err, result){
        result.forEach(function (doc) {
            console.log(doc.id);
          });
    })

}

// helper functions (DON'T EXPOSE TO API)

// createHazard()
// description: creates a new hazard object
// inputs: string, string, string, string, double, double, string
// outputs: hazardObj
// note: ** for testing purposes **

function createHazard(name, desc, building, type, lat, lng, college){ // could possibly use an object for lat lng input
    var hazard = {
        name: name,
        description: desc,
        buildings: building,
        type: type,
        college: college,
        coordinates:{
            latitude: lat,
            longitude: lng
        },
        date: new Date(),
        recent: true
    }

    return hazard

}

// loads hazards for api call
loadHazards(stitch_client, 'cara', 'markers')
// loads buildings for api call
loadBuildings(stitch_client, 'cara', 'buildings')

//handler for csv uploads
handleCSVUpload();

// testing new a star implementation
// calculateRawRoute(stitch_client, 'cara', 'markers')

// processes a csv file into json to be injected has to inject cause promise objs are odd
// processCSVHazards('csv_files/ic_hazards.csv', 'hazard')
// commented cause its been processed (will add an end point for this)


// initialize api run
app.listen(port, () => console.log('app listening on port: ' + port))