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
// -------- END NodeJS/Express Setup ------- //


// -- START PostgreSQL Connection Options -- //
const {Client} = require('pg')

const client = new Client({
    host: "10.158.66.30",   // Requires eduroam or EEE VPN access
    user: "postgres",
    port: 5432,
    password: "JXU73zooIoT1",
    database: "postgres"
})

client.connect();
// --- END PostgreSQL Connection Options --- //


// ----- START MQTT Connection Options ----- //
const options = {
    // Clean session
    clean: true,
    connectTimeout: 4000,
    // Authentication
    clientId: 'REST API Server',
    username: 'admin',
    password: 'ILoveSmartiLab!!!_JXU73zooIoT1',
    reconnectPeriod: '60000',
}

const mqttclient  = mqtt.connect(url, options);
mqttclient.on('connect', function () {
    console.log('Connected to MQTT broker!')
    mqttclient.subscribe('the/topic', function (err) {
        if (!err) {
            // Publish a message to a topic
            let dateTime = new Date();
            mqttclient.publish('the/topic', 'Hello mqtt' + dateTime)
        }
    })
});
// ------ END MQTT Connection Options ------ //



// --- START Standardized Function Calls --- //
// Check if an ID is available in the database
async function ID_is_available(table, id) {
    const result = await client.query(`SELECT * FROM ${table}`)
    for (let row in result.rows) {
        if (id === result.rows[row]["id"]) {
            return true;    // ID found
        }
    }
    return false;   // ID not found
}
// ---- END Standardized Function Calls ---- //



// ----------- START Define REST Endpoints ---------- //

// START Apollo AIR-1 Endpoints ------------------------ //
// (#1) "/air-1" GET all available Apollo AIR-1 IDs
app.get("/air-1", async (req, res) => {
    client.query('SELECT * FROM air_1', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
               arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: Apollo AIR-1 IDs are not available');
            return res.status(404).send("Not found: Apollo AIR-1 IDs are not available");
        }
        client.end;
    })
})

// (#2) "/air-1/{id}" and "/air-1/{id}&options" GET the most recent/historical data of a specific Apollo AIR-1
app.get("/air-1/:id", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Apollo AIR-1 with ID: device_id is available
    let to_check = await ID_is_available("air_1", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Apollo AIR-1 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Apollo AIR-1 with ID: ${device_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM apollo_air_1_${device_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from Apollo AIR-1 with ID: ${device_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM apollo_air_1_${device_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for Apollo AIR-1 with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for Apollo AIR-1 with ID: ${device_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for Apollo AIR-1 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for Apollo AIR-1 with ID: ${device_id}`});
    }
})

// (#3) "/air-1/{id}/light" POST the state of the LED light of a specific Apollo AIR-1
app.post("/air-1/:id/light", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Possible values: "On" or "Off"
    const state = req.query.state;
    // Use values from 0-1 for simplicity, highest value will be set to 1 and other values will be scaled accordingly
    // example: if red = 0.5, green = 0.3, blue = 0.2 -> red = 1, green = 0.6, blue = 0.4
    const red   = req.query.red;
    const green = req.query.green;
    const blue  = req.query.blue;
    // Possible values: any value from 0-1
    const brightness = req.query.brightness;

    // Step 1: Check if an Apollo AIR-1 with ID: device_id is available
    let to_check = await ID_is_available("air_1", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Apollo AIR-1 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Apollo AIR-1 with ID: ${device_id} is not available`});
    }

    // Step 2: Check if at least one optional parameter was given
    if(!state && !red && !green && !blue && !brightness){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in LED light POST request for Apollo AIR-1 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in LED light POST request for Apollo AIR-1 with ID: ${device_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to set the LED light
    let to_publish = `{` + `"state" : "${state}",` + '"color": {'+`"r": ${red},`+`"g": ${green},`+`"b": ${blue}`+'},' + `"brightness": ${brightness}` + '}';
    mqttclient.publish(`apollo_air_1_${device_id}/light`, to_publish);
    return res.status(200).send(`LED light POST request to Apollo AIR-1 with ID: ${device_id} OK`);
})

// END Apollo AIR-1 Endpoints -------------------------- //


// START Apollo MSR-2 Endpoints ------------------------ //
// (#1) "/msr-2" GET all available Apollo MSR-2 IDs
app.get("/msr-2", async (req, res) => {
    client.query('SELECT * FROM msr_2', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: Apollo MSR-2 IDs are not available');
            return res.status(404).send("Not found: Apollo MSR-2 IDs are not available");
        }
        client.end;
    })
})

// (#2) "/msr-2/{id}" and "/msr-2/{id}&options" GET the most recent/historical data of a specific Apollo MSR-2
app.get("/msr-2/:id", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Apollo MSR-2 with ID: device_id is available
    let to_check = await ID_is_available("msr_2", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Apollo MSR-2 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Apollo MSR-2 with ID: ${device_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM apollo_msr_2_${device_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from Apollo MSR-2 with ID: ${device_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM apollo_msr_2_${device_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for Apollo MSR-2 with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for Apollo MSR-2 with ID: ${device_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for Apollo MSR-2 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for Apollo MSR-2 with ID: ${device_id}`});
    }
})

// (#3) "/msr-2/{id}/light" POST the state of the LED light of a specific Apollo MSR-2
app.post("/msr-2/:id/light", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Possible values: "On" or "Off"
    const state = req.query.state;
    // Use values from 0-1 for simplicity, highest value will be set to 1 and other values will be scaled accordingly
    // example: if red = 0.5, green = 0.3, blue = 0.2 -> red = 1, green = 0.6, blue = 0.4
    const red   = req.query.red;
    const green = req.query.green;
    const blue  = req.query.blue;
    // Possible values: any value from 0-1
    const brightness = req.query.brightness;

    // Step 1: Check if an Apollo MSR-2 with ID: device_id is available
    let to_check = await ID_is_available("msr_2", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Apollo MSR-2 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Apollo MSR-2 with ID: ${device_id} is not available`});
    }

    // Step 2: Check if at least one optional parameter was given
    if(!state && !red && !green && !blue && !brightness){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in LED light POST request for Apollo MSR-2 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in LED light POST request for Apollo MSR-2 with ID: ${device_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to set the LED light
    let to_publish = `{` + `"state" : "${state}",` + '"color": {'+`"r": ${red},`+`"g": ${green},`+`"b": ${blue}`+'},' + `"brightness": ${brightness}` + '}';
    mqttclient.publish(`apollo_msr_2_${device_id}/light`, to_publish);
    return res.status(200).send(`LED light POST request to Apollo MSR-2 with ID: ${device_id} OK`);
})

// (#4) "/msr-2/{id}/buzzer" POST the rtttl string to be played on the buzzer of a specific Apollo MSR-2
app.post("/msr-2/:id/buzzer", async (req, res) => {
    const device_id = req.params.id;
    // Optional argument; will be NULL if not provided
    const mtttl_string = req.query.mtttl_string;

    // Step 1: Check if an Apollo MSR-2 with ID: device_id is available
    let to_check = await ID_is_available("msr_2", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Apollo MSR-2 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Apollo MSR-2 with ID: ${device_id} is not available`});
    }

    // Step 2: Check if the string to play was given
    if(!mtttl_string){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in buzzer POST request for Apollo MSR-2 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in buzzer POST request for Apollo MSR-2 with ID: ${device_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to play the buzzer
    let to_publish = `{"mtttl_string" : "${mtttl_string}"}`;
    mqttclient.publish(`apollo_msr_2_${device_id}/buzzer`, to_publish);
    return res.status(200).send(`Buzzer POST request to Apollo MSR-2 with ID: ${device_id} OK`);
})

// END Apollo MSR-2 Endpoints -------------------------- //


// START Athom Smart Plug v2 Endpoints ----------------- //

// (#1) "/smart-plug-v2" GET all available Athom Smart Plug v2 IDs
app.get("/smart-plug-v2", async (req, res) => {
    client.query('SELECT * FROM athom_smart_plug_v2', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: Athom Smart Plug v2 IDs are not available');
            return res.status(404).send("Not found: Athom Smart Plug v2 IDs are not available");
        }
    })
})

// (#2) "/smart-plug-v2/{id}" and "/smart-plug-v2/{id}&options" GET the most recent/historical data of specific Athom Smart Plug v2
app.get("/smart-plug-v2/:id", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Athom Smart Plug v2 with ID: device_id is available
    let to_check = await ID_is_available("athom_smart_plug_v2", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Athom Smart Plug v2 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Athom Smart Plug v2 with ID: ${device_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM athom_smart_plug_v2_${device_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from Athom Smart Plug v2 with ID: ${device_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM athom_smart_plug_v2_${device_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for Athom Smart Plug v2 with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for Athom Smart Plug v2 with ID: ${device_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for Athom Smart Plug v2 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for Athom Smart Plug v2 with ID: ${device_id}`});
    }
})

// (#3) "/smart-plug-v2/{id}/relay" POST relay of specific smart-plug-v2 sensor
app.post("/smart-plug-v2/:id/relay", async (req, res) => {
    const device_id = req.params.id;
    // Optional argument; will be NULL if not provided
    // Possible values: "On" or "Off"
    const relay_state = req.query.state;

    // Step 1: Check if an Apollo MSR-2 with ID: device_id is available
    let to_check = await ID_is_available("athom_smart_plug_v2", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Athom Smart Plug v2 with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Athom Smart Plug v2 with ID: ${device_id} is not available`});
    }

    // Step 2: Check if relay state was given
    if(!relay_state){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in relay POST request for Athom Smart Plug v2 with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in relay POST request for Athom Smart Plug v2 with ID: ${device_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to set the LED light
    let to_publish = `{"state" : "${relay_state}"}`;
    mqttclient.publish(`athom_smart_plug_v2_${device_id}/relay`, to_publish);
    return res.status(200).send(`Relay POST request to Athom Smart Plug v2 with ID: ${device_id} OK`);
})

// END Athom Smart Plug v2 Endpoints ------------------- //


// START AirGradient One Endpoints --------------------- //

// (#1) "/ag-one" GET all available AirGradient One IDs
app.get("/ag-one", async (req, res) => {
    client.query('SELECT * FROM airgradient_one', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: AirGradient One IDs are not available');
            return res.status(404).send("Not found: AirGradient One IDs are not available");
        }
        client.end;
    })
})

// (#2) "/ag-one/{id}" and "/ag-one/{id}&options" GET the most recent/historical data of a specific AirGradient One
app.get("/ag-one/:id", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Apollo AIR-1 with ID: device_id is available
    let to_check = await ID_is_available("airgradient_one", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: AirGradient One with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: AirGradient One with ID: ${device_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM airgradient_one_${device_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from AirGradient One with ID: ${device_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM airgradient_one_${device_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for AirGradient One with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for AirGradient One with ID: ${device_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for AirGradient One with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for AirGradient One with ID: ${device_id}`});
    }
})

// (#3) "/ag-one/{id}/light" POST the state of the LED strip of a specific AirGradient One
app.post("/ag-one/:id/light", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Possible values: "On" or "Off"
    const state = req.query.state;
    // Use values from 0-1 for simplicity, highest value will be set to 1 and other values will be scaled accordingly
    // example: if red = 0.5, green = 0.3, blue = 0.2 -> red = 1, green = 0.6, blue = 0.4
    const red   = req.query.red;
    const green = req.query.green;
    const blue  = req.query.blue;
    // Possible values: any value from 0-1
    const brightness = req.query.brightness;

    // Step 1: Check if an AirGradient One with ID: device_id is available
    let to_check = await ID_is_available("airgradient_one", device_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: AirGradient One with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: AirGradient One with ID: ${device_id} is not available`});
    }

    // Step 2: Check if at least one optional parameter was given
    if(!state && !red && !green && !blue && !brightness){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in LED strip POST request for AirGradient One with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in LED strip POST request for AirGradient One with ID: ${device_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to set the LED strip
    let to_publish = `{` + `"state" : "${state}",` + '"color": {'+`"r": ${red},`+`"g": ${green},`+`"b": ${blue}`+'},' + `"brightness": ${brightness}` + '}';
    mqttclient.publish(`airgradient_one_${device_id}/light`, to_publish);
    return res.status(200).send(`LED light POST request to AirGradient One with ID: ${device_id} OK`);
})

// END AirGradient One Endpoints ----------------------- //


// START Zigbee2MQTT Endpoints ------------------------- //

// (#1) "/zigbee2mqtt" GET all available Zigbee2MQTT device IDs and group IDs
app.get("/zigbee2mqtt", async (req, res) => {
    client.query('SELECT * FROM zigbee2mqtt', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: Zigbee2MQTT device and group IDs are not available');
            return res.status(404).send("Not found: Zigbee2MQTT device and group IDs are not available");
        }
        client.end;
    })
})

// (#2) "/zigbee2mqtt/{id}/get" GET the most recent/historical state of a specific Zigbee2MQTT device
app.get("/zigbee2mqtt/:id/get", async (req, res) => {
    const device_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Zigbee2MQTT device with ID: device_id is available
    let to_check = false;
    let result = await client.query(`SELECT * FROM zigbee2mqtt`);
    for (let row in result.rows) {
        if (device_id !== result.rows[row]["id"]) {
            continue;
        }
        // device_id is found, check if it belongs to a device (not a group)
        if ('device' !== result.rows[row]["type"]) {
            console.log(`ERROR: ID: ${device_id} belongs to a Zigbee2MQTT group, data requests are not available for groups`);
            return res.status(400).json({error: `Invalid request: ID: ${device_id} belongs to a Zigbee2MQTT group, data requests are not available for groups`});
        }
        to_check = true; // device_id is found and belongs to a device
        break;
    }
    if(to_check === false){
        console.log(`ERROR: Zigbee2MQTT device with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Zigbee2MQTT device with ID: ${device_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM zigbee2mqtt_${device_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from Zigbee2MQTT device with ID: ${device_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM zigbee2mqtt_${device_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for Zigbee2MQTT device with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for Zigbee2MQTT device with ID: ${device_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for Zigbee2MQTT device with ID: ${device_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for Zigbee2MQTT device with ID: ${device_id}`});
    }
})

// (#3) "/zigbee2mqtt/{id}/set" POST the state of a specific Zigbee2MQTT device or group
app.post("/zigbee2mqtt/:id/set", async (req, res) => {
    const entity_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Possible values: "ON", "OFF", or "TOGGLE"
    const state = req.query.state;
    // Possible values: any value from 0-254
    const brightness = req.query.brightness;
    // Possible values: any value from 153-500
    const color_temp = req.query.color_temp;

    // Step 1: Check if an Zigbee2MQTT device or group with ID: entity_id is available
    let to_check = false;
    let base_topic = "";
    let result = await client.query(`SELECT * FROM zigbee2mqtt`);
    for (let row in result.rows) {
        if (device_id !== result.rows[row]["id"]) {
            continue;
        }
        // device_id is found, store the base topic
        to_check = true;
        base_topic = result.rows[row]["base_topic"];
        break;
    }
    if(to_check === false){
        console.log(`ERROR: Zigbee2MQTT device with ID: ${device_id} is not available`);
        return res.status(404).json({error: `Not found: Zigbee2MQTT device with ID: ${device_id} is not available`});
    }

    // Step 2: Check if at least one optional parameter was given
    if(!state && !brightness && !color_temp){
        // If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in state POST request for Zigbee2MQTT device with ID: ${entity_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in state POST request for Zigbee2MQTT device with ID: ${entity_id}`});
    }

    // Step 3: POST the appropriate json file to the appropriate MQTT topic to set the state
    let to_publish = `{` + `"state" : "${state}",` + `"brightness": ${brightness}` + `"color_temp": ${color_temp}` + '}';
    mqttclient.publish(`${base_topic}/${entity_id}/set`, to_publish);
    return res.status(200).send(`State POST request to Zigbee2MQTT device with ID: ${entity_id} OK`);
})

// END Zigbee2MQTT Endpoints --------------------------- //


// START Sensibo Endpoints ----------------------------- //
const HOME_ASSISTANT_URL_BASE = "http://10.158.71.11:8123/api/";
const HOME_ASSISTANT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI3N2ViMDIzZmJjOWE0Yjc2YmYwMjE4YTFmOWY1ZDQwNyIsImlhdCI6MTc0MDExMjc4NSwiZXhwIjoyMDU1NDcyNzg1fQ.iNJpri8xnC_SvNbWGg1ygTWq6ywvhkuCYRJI2GpB0UI";
const HOME_ASSISTANT_HEADERS = {"Authorization": `Bearer ${HOME_ASSISTANT_TOKEN}`, "content-type": "application/json"};

// (#1) "/sensibo" GET all available Sensibo Air Pro IDs
app.get("/sensibo", async (req, res) => {
    client.query('SELECT * FROM sensibo', (err, ids) => {
        if(ids){
            let arr_ids = [];
            for (let id in ids.rows){
                arr_ids.push(ids.rows[id]["id"]);
            }
            res.json(arr_ids);
        }else{
            console.log('ERROR: Sensibo Air Pro IDs are not available');
            return res.status(404).send("Not found: Sensibo Air Pro IDs are not available");
        }
        client.end;
    })
})

// (#2) "/sensibo/{id}" and "/sensibo/{id}&options" GET the [most recent/historical] data of a specific Sensibo Air Pro
app.get("/sensibo/:id", async (req, res) => {
    const entity_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end   = req.query.time_end;

    // Step 1: Check if an Sensibo Air Pro with ID: device_id is available
    let to_check = await ID_is_available("sensibo", entity_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Sensibo Air Pro with ID: ${entity_id} is not available`);
        return res.status(404).json({error: `Not found: Sensibo Air Pro with ID: ${entity_id} is not available`});
    }

    // Step 2: Return data based on parameter values
    if(!time_start && !time_end){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM sensibo_air_pro_${entity_id} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Unable to get most recent data from Sensibo Air Pro with ID: ${entity_id}`);
            }
            client.end;
        })
    }else if(time_start && time_end){
        // [B] If optional parameter values for time_start and time_end were given
        client.query(`SELECT * FROM sensibo_air_pro_${entity_id} WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err){
                res.json(data.rows[0]);
            }else{
                console.log(`ERROR: Bad arguments in data request for Sensibo Air Pro with ID: ${device_id}`);
                return res.status(400).json({error: `Invalid request: Bad arguments in GET request for Sensibo Air Pro with ID: ${entity_id}`})
            }
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete parameters in data request for Sensibo Air Pro with ID: ${entity_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete parameters in GET request for Sensibo Air Pro with ID: ${entity_id}`});
    }
})

// (#3) "/sensibo/{id}/hvac" POST the state of a Sensibo Air Pro's HVAC
app.post("/sensibo/:id/hvac", async (req, res) => {
    const entity_id = req.params.id;
    // Optional arguments; will be NULL if not provided
    // Possible values: "off", "heat", "cool", "heat_cool"
    const hvac_mode = req.query.hvac_mode
    // Possible values: ?
    const target_temperature = req.query.target_temperature
    const target_temp_high = req.query.target_temp_high
    const target_temp_low  = req.query.target_temp_low

    // Step 1: Check if an Sensibo Air Pro with ID: device_id is available
    let to_check = await ID_is_available("sensibo", entity_id); // Call ID checker function
    if(to_check === false){
        console.log(`ERROR: Sensibo Air Pro with ID: ${entity_id} is not available`);
        return res.status(404).json({error: `Not found: Sensibo Air Pro with ID: ${entity_id} is not available`});
    }

    // Step 2: POST based on parameter values
    if(hvac_mode === "off"){
        // [A] HVAC will be turned off
        let parameters = {"entity_id": entity_id, "hvac_mode": hvac_mode};
        fetch(`${HOME_ASSISTANT_URL_BASE}/services/climate/set_hvac_mode`, {method: 'POST', body: JSON.stringify(parameters), headers: HOME_ASSISTANT_HEADERS})
            .then(res => res.json())
            .then(data => {})
        return res.status(200).send(`HVAC POST request to Sensibo Air Pro with ID: ${device_id} OK`);
    }else if((hvac_mode === "heat" || hvac_mode === "cool") && target_temperature){
        // [B] HVAC will be set to heat or cool with given target temperature
        let parameters = {"entity_id": entity_id, "temperature": target_temperature, "hvac_mode": hvac_mode};
        fetch(`${HOME_ASSISTANT_URL_BASE}/services/climate/set_temperature`, {method: 'POST', body: JSON.stringify(parameters), headers: HOME_ASSISTANT_HEADERS})
            .then(res => res.json())
            .then(data => {})
        return res.status(200).send(`HVAC POST request to Sensibo Air Pro with ID: ${device_id} OK`);
    }else if(hvac_mode === "heat_cool" && target_temp_high && target_temp_low){
        // [C] HVAC will be set to heat/cool, with given maximum and minimum temperature
        let parameters = {"entity_id": entity_id, "target_temp_high": target_temp_high, "target_temp_low": target_temp_low, "hvac_mode": hvac_mode};
        fetch(`${HOME_ASSISTANT_URL_BASE}/services/climate/set_temperature`, {method: 'POST', body: JSON.stringify(parameters), headers: HOME_ASSISTANT_HEADERS})
        return res.status(200).send(`HVAC POST request to Sensibo Air Pro with ID: ${device_id} OK`);
    }else{
        // [D] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`ERROR: Incomplete/Incorrect parameters in HVAC POST request for Sensibo Air Pro with ID: ${entity_id}`);
        return res.status(404).json({error: `Invalid request: Incomplete/Incorrect parameters in HVAC POST request for Sensibo Air Pro with ID: ${entity_id}`});
    }
})

// END Sensibo Endpoints ------------------------------- //


// START Other Endpoints ------------------------------- //
// (#1) "/tables" GET the mapping of sensors to tables
// (#2) "/tables/{id}" GET all current sensor data for a specific tables
// END Other Endpoints --------------------------------- //


// ------------ END Define REST Endpoints ----------- //



// Server hosted at port 80
app.listen(80, () => console.log("SSL IoT 1 Server Hosted at port 80"));