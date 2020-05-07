const{ Stitch, UserPasswordCredential, RemoteMongoClient} = require('mongodb-stitch-server-sdk')

const express = require('express');
const app = express()

const port = process.env.PORT || 3000 // use env port fallback to port 3000

const stitch_key = require('./stitch_app_key')
const app_id = stitch_key.stitch_app_key // mongoDB stitch app key
const usr = stitch_key.username // default stitch user
const pwd = stitch_key.password // default stitch user password

const csv2json = require('csvjson-csv2json')
const fs = require('fs')

// need to setup some sort of api key service to handle requests to the api

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

// processCSV()
// description: processes raw csv text into a json object array
// inputs: string csv
// outputs: json array

function processCSV(csvFilePath){

    fs.readFile(csvFilePath, 'utf8', (err, data) =>{
        if(err){
            throw err;
            // don't know if it needs to return but will return -1
        }
        else{
            csv_data = data
            var json_data = csv2json(csv_data, {parseNumbers: true});
            for(var i in json_data){
                insertHazard(json_data[i], stitch_client, db, markers)
            }
        }
    })
}


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

// loadHazards()
// description: loads data object from mongodb collection with filters
// inputs: StitchClientObj, string, string
// outputs: BSONObj or -1 for failure to find
// note: ** more robust filters should be implemented but im kinda rushing/ lazy this is simply going to handle college

function loadHazards(client, db, collection, collegeFilter){

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
        app.get('/hazards/college/ithacacollege', (req, res) =>{
            
    
            var data = null
    
            data = mongodb_collection.find({college: 'Ithaca College'}, {sort: {date: -1}})
            .asArray()
            .then(docs =>{
                res.json(docs)
            })
            .catch(err => {
                console.error(err)
            })
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
        date: hazard.date,
        recent: true
    })
    .then(() =>{
        console.log('Insert of hazard: ' + hazard.name + ' success')
    })
    .catch(err => {
        console.error(err)
    })

}

// loads hazards for api call
loadHazards(stitch_client, 'cara', 'markers')

// processes a csv file into json to be injected has to inject cause promise objs are odd
// processCSV('ic_hazards.csv')
// commented cause its been processed (will add an end point for this)


// initialize api run
app.listen(port, () => console.log('app listening on port: ' + port))