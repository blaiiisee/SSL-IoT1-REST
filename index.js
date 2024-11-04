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

const corsOptions ={
    origin:'http://localhost:3000',
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
    user: "admin",
    port: 32769,
    password: "JXU73zooIoT1",
    database: "postgres"
})

client.connect();
// ------- END PostgreSQL Connection Options ------ //



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
    // Format: mm/dd/yy_hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Check if sensorID is available
    let IDavailable = false;        // Temporary variable in checking availability of ID
    client.query(`SELECT * FROM msr_2`, (err, ids) => {
        for (let id in ids.rows){
            if (sensorID === ids.rows[id]["sensor_id"]){
                IDavailable = true;     // sensorID is in the database
            }
        }

        // Error 404: sensorID not in database
        if (!IDavailable){
            console.log(`ERROR: MSR-2 Sensor with ID ${sensorID} unavailable`);
            return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
            client.end;
        }
    })

    // Step 2: Return data based on parameter values
    // [A] If NO optional parameters
    if (!time_start && !time_end){
        // Order all data by descending date and time and get ONLY the most recent
        client.query(`SELECT * FROM apollo_msr_2_${sensorID} ORDER BY date DESC, time DESC LIMIT 1`, (err, data) => {
            if (!err){
                res.json(data.rows[0]);
            } else {
                console.log("ERROR: Getting most recent data from AIR-1 Sensor");
            }
            client.end;
        })

    } else if (time_start && time_end) {
        // [B] With optional parameters time_start and time_end
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
        client.query(`SELECT * FROM apollo_msr_2_${sensorID}
        WHERE (date BETWEEN '${arr_time_start[0]}' AND '${arr_time_end[0]}')
        AND (time BETWEEN '${arr_time_start[1]}' AND '${arr_time_end[1]}')`, (err, data) => {
            res.json(data.rows);
            client.end;
        })

    } else {
        // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in AIR-1 data request");
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
        client.end;
    }
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
    // Format: mm/dd/yy_hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Check if sensorID is available
    let IDavailable = false;        // Temporary variable in checking availability of ID
    client.query(`SELECT * FROM air_1`, (err, ids) => {
        for (let id in ids.rows){
            if (sensorID === ids.rows[id]["sensor_id"]){
                IDavailable = true;     // sensorID is in the database
            }
        }

        // Error 404: sensorID not in database
        if (!IDavailable){
            console.log(`ERROR: AIR-1 Sensor with ID ${sensorID} unavailable`);
            return res.status(404).json({ error: `Not Found: sensorID ${sensorID} not available` });
            client.end;
        }
    })

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
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
        client.query(`SELECT * FROM apollo_air_1_${sensorID}
        WHERE (date BETWEEN '${arr_time_start[0]}' AND '${arr_time_end[0]}')
        AND (time BETWEEN '${arr_time_start[1]}' AND '${arr_time_end[1]}')`, (err, data) => {
            res.json(data.rows);
            client.end;
        })

    } else {
    // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in AIR-1 data request");
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
        client.end;
    }
})

// ------- END Define REST Endpoints ------ //

// Server hosted at port 80
app.listen(80, () => console.log("SSL IoT 1 Server Hosted at port 3000"));