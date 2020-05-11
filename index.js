const{ Stitch, UserPasswordCredential, RemoteMongoClient} = require('mongodb-stitch-server-sdk')

const express = require('express');
const app = express()

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

// geographic helper methods
const turf = require('@turf/turf')

app.get('/', (req, res) => {
    res.send('Visit /hazards for a list of all hazards')
})



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

// --- Stitch Client OAuth ---

// processCSV()
// description: processes raw csv text into a json object array then injects it
// inputs: string csv
// outputs: json array

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
                    insertHazard(json_data[i], stitch_client, db, markers)
                }
            }
        })
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
    }else{
        // do nothing
    }

    
}



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

        // get hazards near certain building
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

// insertHazard()
// description: handles a new hazard request and adds it to the server

function insertHazard(hazard, client, db, collection){
    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)

    // need to add a duplicate checker but for now its fine

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

}

function insertBuilding(building, client, db, collection){
    const mongodb_client = client.getServiceClient(RemoteMongoClient.factory, 'mongodb-atlas') // service name may vary
    const mongodb_db = mongodb_client.db(db)
    const mongodb_collection = mongodb_db.collection(collection)

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

// testing new a star implementation
// calculateRawRoute(stitch_client, 'cara', 'markers')

// processes a csv file into json to be injected has to inject cause promise objs are odd
// processCSVHazards('ic_buildings.csv', 'building')
// commented cause its been processed (will add an end point for this)


// initialize api run
app.listen(port, () => console.log('app listening on port: ' + port))