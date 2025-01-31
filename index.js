// Index JS
// Author: SSL - IoT 1
// University of the Philippines - Diliman Electrical and Electronics Engineering Institute



// ------- START NodeJS/Express Setup ------ //
// Require Node.js File System
const fs = require("fs/promises");
// Require Express connection
const express = require("express");
// Require CORS communication *NOT USED, BUT FOR FRONT-END*
const cors = require("cors");
// Require lodash for randomization *NOT USED YET -- ID'S, TOKENS*
const _ = require("lodash");
// Require uuid to Generate Unique IDs *NOT USED YET*
const { v4: uuidv4, parse} = require("uuid");
// MQTT Package
const mqtt = require("mqtt");
const url = 'mqtt://10.158.66.30:1883';


const corsOptions ={
    origin:'http://localhost:80',
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}
// Server Start-up
const app = express();
app.use(cors(corsOptions));

// Add middleware to support JSON
app.use(express.json());
// ------- END NodeJS/Express Setup ------ //     



// ------- START PostgreSQL Connection Options ------ //
const {Client} = require('pg')

const client = new Client({
    host: "10.158.66.30",   // Requires eduroam or EEE VPN access
    user: "postgres",
    port: 5432,
    password: "JXU73zooIoT1",
    database: "postgres"
})

client.connect();
// ------- END PostgreSQL Connection Options ------ //


// ------- START MQTT Connection Options ------ // /*
const options = {
    // Clean session
    clean: true,
    connectTimeout: 4000,
    // Authentication
    clientId: 'rest-api-server',
    username: 'admin',
    password: 'admin',
    reconnectPeriod: '60000',
}
const mqttclient  = mqtt.connect(url, options);
mqttclient.on('connect', function () {
    console.log('Connected')
    // Subscribe to a topic
    mqttclient.subscribe('the/topic', function (err) {
        if (!err) {
            // Publish a message to a topic
            let dateTime = new Date();
            mqttclient.publish('the/topic', 'Hello mqtt' + dateTime)
        }
    })
});


// ------- END MQTT Connection Options ------ //


// ------- START Standardized Function Calls ------ //

// Checking if ID is available in database
async function ID_is_available(device, sensorID) {
    const result = await client.query(`SELECT * FROM ${device}`)
    for (let row in result.rows) {
        if (sensorID === result.rows[row]["sensor_id"]) {
            return true;    // SensorID found
        }
    }
    return false;   // SensorID not found
}

// ------- END Standardized Function Calls ------ //


// ------- START Define REST Endpoints ------ //

// (#1) "/msr-2" -- Return all available MSR-2 sensor IDs
app.get("/msr-2", async (req,res)=>{
    client.query(`SELECT * FROM msr_2`, (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["sensor_id"]);
            }
            res.json(arr_ids);
        }
        else {
            return res.status(404).json({ error: `Not Found: Sensor IDs not available` });
        }
        client.end;
    })
})


// (#2) "/msr-2/:id?time_start&time_end" Return [most recent/historical] data of specific MSR-2 sensor
app.get("/msr-2/:id", async (req,res)=>{
    const sensorID = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Check if sensorID is available
    let to_check = await ID_is_available("msr_2", sensorID); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: MSR-2 Sensor with ID ${sensorID} unavailable`);
        return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
    }

    // Step 2: Return data based on parameter values
    // [A] If NO optional parameters
    if (!time_start && !time_end){
        // Order all data by descending date and time and get ONLY the most recent
        client.query(`SELECT * FROM apollo_msr_2_${sensorID} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if (!err){
                res.json(data.rows[0]);
            } else {
                console.log("ERROR: Getting most recent data from MSR-2 Sensor");
            }
            client.end;
        })

    } else if (time_start && time_end) {
        // [B] With optional parameters time_start and time_end
        /*
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
         */
        client.query(`SELECT * FROM apollo_msr_2_${sensorID} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err) {
                res.json(data.rows);
            } else {
                return res.status(400).json({ error: 'Invalid request: Bad argument(s) in request' });
            }
            client.end;
        })

    } else {
        // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in AIR-1 data request");
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
    }
})


// (#3) "/msr-2/:id/light" Set the LED of specific MSR-2 sensor
app.post("/msr-2/:id/light", async (req,res)=>{
    const sensorID = req.params.id;
    const state = req.query.state;
    const red = req.query.red;
    const green = req.query.green;
    const blue = req.query.blue;
    const brightness = req.query.brightness;

    // Step 1: Check if sensorID is available
    let to_check = await ID_is_available("msr_2", sensorID); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: MSR-2 Sensor with ID ${sensorID} unavailable`);
        return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
    }

    // Step 2: POST set LED light of MSR-2
    let to_publish = `{ "state" : "${state}",` +
    '"color": {' +
    `"r": ${red},` +
    `"g": ${green},` +
    `"b": ${blue}` +
    '},' +
    `"brightness": ${brightness}` +
    '}';

    mqttclient.publish('msr_2/cc0b5c/light', to_publish );
    client.end;
    return res.status(200).send();
})


// (#5) "/air-1" Return all available AIR-1 sensor IDs
app.get("/air-1", async (req,res)=>{
    client.query(`SELECT * FROM air_1`, (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["sensor_id"]);
            }
            res.json(arr_ids);
        }
        else {
            return res.status(404).json({ error: `Not Found: Sensor IDs not available` });
        }
        client.end;
    })
})


// (#6) "/air-1/:id?time_start&time_end" Return [most recent/historical] data of specific AIR-1 sensor
app.get("/air-1/:id", async (req,res)=>{
    const sensorID = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Check if sensorID is available
    let to_check = await ID_is_available("air_1", sensorID); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: AIR-1 Sensor with ID ${sensorID} unavailable`);
        return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
    }

    // Step 2: Return data based on parameter values
    // [A] If NO optional parameters
    if (!time_start && !time_end){
        // Order all data by descending date and time and get ONLY the most recent
        client.query(`SELECT * FROM apollo_air_1_${sensorID} ORDER BY date DESC, time DESC LIMIT 1`, (err, data) => {
            if (!err){
                res.json(data.rows[0]);
            } else {
                console.log("ERROR: Getting most recent data from AIR-1 Sensor");
            }
            client.end;
        })

    } else if (time_start && time_end) {
    // [B] With optional parameters time_start and time_end
        /*
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
         */
        client.query(`SELECT * FROM apollo_air_1_${sensorID} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err) {
                res.json(data.rows);
            } else {
                return res.status(400).json({ error: 'Invalid request: Bad argument(s) in request' });
            }
            client.end;
        })

    } else {
    // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in AIR-1 data request");
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
    }
})


// (#9) "/smart-plug-v2" Return all available smart-plug-v2 sensor IDs
app.get("/smart-plug-v2", async (req,res)=>{
    client.query(`SELECT * FROM athom_smart_plug_v2`, (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["sensor_id"]);
            }
            res.json(arr_ids);
        }
        else {
            return res.status(404).json({ error: `Not Found: Sensor IDs not available` });
        }
        client.end;
    })
})


// (#10) "/smart-plug-v2/:id?time_start&time_end" Return [most recent/historical] data of specific smart-plug-v2 sensor
app.get("/smart-plug-v2/:id", async (req,res)=>{
    const sensorID = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Check if sensorID is available
    let IDavailable = false;        // Temporary variable in checking availability of ID
    let to_check = await ID_is_available("athom_smart_plug_v2", sensorID); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: Smart plug Sensor with ID ${sensorID} unavailable`);
        return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
    }

    // Step 2: Return data based on parameter values
    // [A] If NO optional parameters
    if (!time_start && !time_end){
        // Order all data by descending date and time and get ONLY the most recent
        client.query(`SELECT * FROM athom_smart_plug_v2_${sensorID} ORDER BY date DESC, time DESC LIMIT 1`, (err, data) => {
            if (!err){
                res.json(data.rows[0]);
            } else {
                console.log("ERROR: Getting most recent data from sensor-plug-v2 Sensor");
            }
            client.end;
        })

    } else if (time_start && time_end) {
        // [B] With optional parameters time_start and time_end
        /*
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
        */
        client.query(`SELECT * FROM athom_smart_plug_v2_${sensorID} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err) {
                res.json(data.rows);
            } else {
                return res.status(400).json({ error: 'Invalid request: Bad argument(s) in request' });
            }
            client.end;
        })

    } else {
        // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in smart-plug-v2 data request");
        client.end;
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
    }
})


// ------- END Define REST Endpoints ------ //

// Server hosted at port 80
app.listen(80, () => console.log("SSL IoT 1 Server Hosted at port 80"));