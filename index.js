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
const {Result} = require("lodash");

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

const mqttclient = mqtt.connect(url, options);

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

// ____ SECURITY START ____

async function USER_is_available(user_name) {
    const result = await client.query(`SELECT * FROM users`)
    for (let row in result.rows) {
        if (user_name === result.rows[row]["user_name"]) {
            return true;    // User found
        }
    }
    return false;   // User not found
}

async function KEY_is_available(api_key) {
    //check if api_key exists
    const result = await client.query(`SELECT * FROM users`)
    for (let row in result.rows) {
        if (api_key === result.rows[row]["api_key"]) {
            return true;    // User found
        }
    }
    return false;   // User not found
}

async function RETURN_access_level(api_key) {
    //check if api_key exists
    const result = await client.query(`SELECT * FROM users WHERE api_key = '${api_key}'`);
    return result.rows[0]["access_level"];
}

async function RETURN_user_name(api_key) {
    //check if api_key exists
    const result = await client.query(`SELECT * FROM users WHERE api_key = '${api_key}'`);
    return result.rows[0]["user_name"];
}

async function SECURITY_CHECK(res, req, api_key, array) {
    let to_verify = await KEY_is_available(api_key);
    if(to_verify){
        access_level = await RETURN_access_level(api_key);
    }else{
        console.log(`Not Found: API Key does not exist`);
        res.status(401).json({ error: `API Key does not exist: Ensure your API key is valid and correctly provided.`});
        return false;
    }
    //CHECK IF ACCESS LEVEL MATCHES

    for (let i = 0; i < array.length; i++) {
        if(access_level === array[i]){
            return true; //check if access level matches one of the described values
        }
    }

    console.log(`Forbidden Request: User does not have access to this route`);
    res.status(403).json({ error: `Forbidden Request: User does not have access to this route`});
    return false;
}

// ____ SECURITY END ____

// ____ TRANSACTIONS START ____

async function getCurrentTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function UPDATE_transactions(api_key, type, uri, success) {
    // get current timestamp
    //getCurrentTimestamp() - returns current timestamp

    if(await RETURN_user_name(api_key)==="Digital_Twin"){
        return;
    }

    client.query(`INSERT INTO transactions (timestamp, user_name, type, uri, success) VALUES ('${await getCurrentTimestamp()}','${await RETURN_user_name(api_key)}', '${type}','${uri}','${success}')`, (err, response) => {
        if (!err){
            //SUCCESS
            return;
        } else {
            //ERROR PGADMIN
            console.log("ERROR: Unsuccessfully logged transaction");
            return;
        }
        //END POSTGRES CONNECTION
        client.end;
    })
}

// ____ TRANSACTIONS END ____

// Check if an ID is available in the database
async function ID_is_available(table, deviceID) {
    const queryResult = await client.query(`SELECT * FROM ${table} WHERE id = '${deviceID}'`);
    return !(queryResult.rowCount === 0);
}

// GET ids
async function GET_ids(res, req, deviceName, api_key, type, uri){
    if(await SECURITY_CHECK(res, req, api_key, [0,1,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const queryResult = await client.query(`SELECT * FROM ${deviceName.toLowerCase().replaceAll("-","_").replaceAll(" ","_")}`);
    if(queryResult.rowCount) {
        let ids = [];
        for (let index = 0; index < queryResult.rowCount; index++) {
            ids.push(queryResult.rows[index]["id"]);
        }
        console.log(`Successfully returned all available ${deviceName} IDs`);
        UPDATE_transactions(api_key, type, uri, true);
        res.json(ids);
    }else{
        console.log(`There are no ${deviceName} IDs to return`);
        UPDATE_transactions(api_key, type, uri, false);
        res.json({});
    }
}

// GET most recent/historical data
async function GET_data(res, req, deviceName, api_key, type, uri){
    if(await SECURITY_CHECK(res, req, api_key, [0,1,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const deviceID = req.params.id;
    // Optional arguments; will be NULL if not provided
    const timeStart = req.query.time_start;
    const timeEnd   = req.query.time_end;

    // Step 1: Check if an deviceName with ID: deviceID is available
    if(await ID_is_available(`${deviceName.toLowerCase().replaceAll("-","_").replaceAll(" ","_")}`, deviceID) === false){
        console.log(`Not Found: ${deviceName} with ID: ${deviceID} does not exist`);
        UPDATE_transactions(api_key, type, uri, false);
        return res.status(404).json({error: `Not Found: ${deviceName} with ID: ${deviceID} does not exist`});
    }

    // Step 2: Return data based on parameter values
    if(!timeStart && !timeEnd){
        // [A] If NO optional parameter values were given
        client.query(`SELECT * FROM ${deviceName.toLowerCase().replaceAll("-","_").replaceAll(" ","_")}_${deviceID.replaceAll(".","_")} ORDER BY timestamp DESC LIMIT 1`, (err, data) => {
            if(err || data.rowCount === 0){
                console.log(`Internal Server Error: Unable to get most recent data from ${deviceName} with ID: ${deviceID}`);
                return res.status(500).send(`Internal Server Error: Unable to get most recent data from ${deviceName} with ID: ${deviceID}`);
            }
            console.log(`Successfully returned most recent data from ${deviceName} with ID: ${deviceID}`);
            UPDATE_transactions(api_key, type, uri, true);
            res.json(data.rows[0]);
            client.end;
        })
    }else if(timeStart && timeEnd){
        // [B] If optional parameter values for timeStart and timeEnd were given
        client.query(`SELECT * FROM ${deviceName.toLowerCase().replace("-","_").replace(" ","_")}_${deviceID} WHERE (timestamp BETWEEN '${timeStart}' AND '${timeEnd}')`, (err, data) => {
            if(err || data.rowCount === 0){
                console.log(`Bad Request: Invalid arguments in historical data GET request for ${deviceName} with ID: ${deviceID}`);
                return res.status(400).json({error: `Bad Request: Invalid arguments in historical data GET request for ${deviceName} with ID: ${deviceID}`});
            }
            console.log(`Successfully returned historical data (${timeStart} to ${timeEnd}) from ${deviceName} with ID: ${deviceID}`);
            UPDATE_transactions(api_key, type, uri, true);
            res.json(data.rows);
            client.end;
        })
    }else{
        // [C] If optional parameter values are INCOMPLETE (Error 400)
        console.log(`Bad Request: Incomplete parameters in GET request for ${deviceName} with ID: ${deviceID}`);
        UPDATE_transactions(api_key, type, uri, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in GET request for ${deviceName} with ID: ${deviceID}`});
    }
}

// POST LED light/strip
async function POST_light(res, req, deviceName, api_key, type, uri){
    if(await SECURITY_CHECK(res, req, api_key, [0,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const deviceID = req.params.id;
    // Optional arguments; will be NULL if not provided
    const lightState = req.query.state;
    const lightRed   = req.query.red;
    const lightGreen = req.query.green;
    const lightBlue  = req.query.blue;
    const lightBrightness = req.query.brightness;

    // Step 1: Check if an deviceName with ID: deviceID is available
    if(await ID_is_available(`${deviceName.toLowerCase().replaceAll("-","_").replaceAll(" ","_")}`, deviceID) === false){
        console.log(`Not Found: ${deviceName} with ID: ${deviceID} does not exist`);
        UPDATE_transactions(api_key, type, uri, false);
        return res.status(404).json({error: `Not Found: ${deviceName} with ID: ${deviceID} does not exist`});
    }

    // Step 2: Check if at least one optional parameter was given
    if(!lightState && !lightRed && !lightGreen && !lightBlue && !lightBrightness){
        console.log(`Bad Request: Incomplete parameters in POST request for ${deviceName} with ID: ${deviceID}`);
        UPDATE_transactions(api_key, type, uri, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in POST request for ${deviceName} with ID: ${deviceID}`});
    }

    // Step 3: Check if the given values are valid and build the JSON file to be published
    let toPublish = {};
    if(lightState){
        if(lightState !== "ON" && lightState !== "OFF"){
            console.log(`Bad Request: Invalid 'state' parameter in POST request for ${deviceName} with ID: ${deviceID}. \n - Given value: ${lightState} \n - Possible values: "ON", "OFF"`);
            UPDATE_transactions(api_key, type, uri, false);
            return res.status(400).json({error: `Bad Request: Invalid 'state' parameter in POST request for ${deviceName} with ID: ${deviceID}. | Given value: ${lightState} | Possible values: "ON", "OFF"`});
        }
        toPublish['state'] = lightState;
    }
    if(lightRed){
        if(lightRed < 0 || lightRed > 1){
            console.log(`Bad Request: Invalid 'red' parameter in POST request for ${deviceName} with ID: ${deviceID}. \n - Given value: ${lightRed} \n - Possible values: any value from 0-1`);
            UPDATE_transactions(api_key, type, uri, false);
            return res.status(400).json({error: `Bad Request: Invalid 'red' parameter in POST request for ${deviceName} with ID: ${deviceID}. | Given value: ${lightRed} | Possible values: any value from 0-1`});
        }
        toPublish['r'] = lightRed;
    }
    if(lightGreen){
        if(lightGreen < 0 || lightGreen > 1){
            console.log(`Bad Request: Invalid 'green' parameter in POST request for ${deviceName} with ID: ${deviceID}. \n - Given value: ${lightGreen} \n - Possible values: any value from 0-1`);
            UPDATE_transactions(api_key, type, uri, false);
            return res.status(400).json({error: `Bad Request: Invalid 'green' parameter in POST request for ${deviceName} with ID: ${deviceID}. | Given value: ${lightGreen} | Possible values: any value from 0-1`});
        }
        toPublish['g'] = lightGreen;
    }
    if(lightBlue){
        if(lightBlue < 0 || lightBlue > 1){
            console.log(`Bad Request: Invalid 'blue' parameter in POST request for ${deviceName} with ID: ${deviceID}. \n - Given value: ${lightBlue} \n - Possible values: any value from 0-1`);
            UPDATE_transactions(api_key, type, uri, false);
            return res.status(400).json({error: `Bad Request: Invalid 'blue' parameter in POST request for ${deviceName} with ID: ${deviceID}. | Given value: ${lightBlue} | Possible values: any value from 0-1`});
        }
        toPublish['b'] = lightBlue;
    }
    if(lightBrightness){
        if(lightBrightness < 0 || lightBrightness > 1){
            console.log(`Bad Request: Invalid 'brightness' parameter in POST request for ${deviceName} with ID: ${deviceID}. \n - Given value: ${lightBrightness} \n - Possible values: any value from 0-1`);
            UPDATE_transactions(api_key, type, uri, false);
            return res.status(400).json({error: `Bad Request: Invalid 'brightness' parameter in POST request for ${deviceName} with ID: ${deviceID}. | Given value: ${lightBrightness} | Possible values: any value from 0-1`});
        }
        toPublish['brightness'] = lightBrightness;
    }

    // Step 4: Publish the JSON file to the correct MQTT topic to set the LED light/strip
    console.log(`POST request to ${deviceName} with ID: ${deviceID} OK`);
    console.log(` - MQTT Topic: ${deviceName.toLowerCase().replace("-","_").replace(" ","_")}_${deviceID}/light`);
    console.log(` - JSON File: ${JSON.stringify(toPublish)}`);
    UPDATE_transactions(api_key, type, uri, true);
    mqttclient.publish(`${deviceName.toLowerCase().replace("-","_").replace(" ","_")}_${deviceID}/light`, JSON.stringify(toPublish));
    return res.status(200).send(`POST request to ${deviceName} with ID: ${deviceID} OK`);
}

// ---- END Standardized Function Calls ---- //



// ----------- START Define REST Endpoints ---------- //

// START User Management Endpoints -------------------------- //

// (#A) POST "/user/{user_name}" -- Create new user
app.post("/users/:user_name", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const user_name = req.params.user_name;
    const access_level = req.query.access_level;
    let api_key = uuidv4(); // generate API key

    // Check if user is available
    let to_check = await USER_is_available(user_name); // Call ID checker function
    if (to_check === true) {
        console.log(`ERROR: ${user_name} is already taken`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(409).json({ error: `${user_name} is already taken: Please choose a different username.` });
    }

    // Check if access_level is defined
    if(access_level !== undefined){
        //do nothing
    }else{
        console.log(`ERROR: Request Incomplete Parameters`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({ error: `Missing required parameters: Ensure all required fields are provided.` });
    }

    // Check access_level is a number
    if(/\d/.test(access_level)){
        //do nothing
    }else{
        console.log(`ERROR: Invalid data type`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({ error: `Invalid data type: Ensure all parameters are of the correct data type.` });
    }


    //CREATE USER IN DATABASE
    // INSERT INTO users (username, api_key, access_level)
    // VALUES ('peter', 'j1324lkj1234k1j234','0');
    client.query(`INSERT INTO users (user_name, api_key, access_level) VALUES ('${user_name}', '${api_key}','${access_level}')`, (err, response) => {
        if (!err){
            //SUCCESS
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
            client.end;
            console.log(`SUCCESSFULLY create new user ${user_name}`);
            return res.status(200).send();
        } else {
            //ERROR PGADMIN
            console.log("ERROR: Unsuccessfully in creating new user");
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            client.end;
            return res.status(500).json({ error: `Database error occurred: An unexpected error occurred while creating the user.` });
        }
    })
})

// (#B) GET "/users" -- Return List of Users
app.get("/users", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    //RETURN LIST OF USERS
    client.query(`SELECT * FROM users`, (err, response) => {
        if(response){
            let arr_user_names = [];
            for (let user in response.rows){
                arr_user_names.push(response.rows[user]["user_name"]);
            }
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
            client.end;
            console.log(`SUCCESSFULLY return list of usernames`);
            res.json(arr_user_names);
        }
        else {
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            client.end;
            return res.status(500).json({ error: `Database error occurred: An unexpected error occurred while creating the user.` });
        }
        client.end;
    })
})

// (#B) GET "/users/:user_name}" -- Return Data of Specific User (with query)
app.get("/users/:user_name", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    // Check if user is available
    const user_name = req.params.user_name;
    let to_check = await USER_is_available(user_name); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: User with the username ${user_name} is unavailable`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({ error: `Not Found: User ${user_name} not available` });
    }

    //Return specific userdata
    client.query(`SELECT * FROM users WHERE user_name='${user_name}'`, (err, response) => {
        if(response){
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
            client.end;
            console.log(`SUCCESSFULLY return data of user ${user_name}`);
            res.json(response.rows[0]);
        }
        else {
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            client.end;
            return res.status(500).json({ error: `Database error occurred: An unexpected error occurred.` });
        }
        client.end;
    })
})

// (#C) PUT "/user" -- Edit Access Level of User
app.put("/users/:user_name", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const user_name = req.params.user_name;
    const access_level = req.query.access_level;

    // Check if user is available
    let to_check = await USER_is_available(user_name); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: User with the username ${user_name} is unavailable`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({ error: `Not Found: User ${user_name} not available` });
    }

    // Check if access_level is defined
    if(access_level !== undefined){
        //do nothing
    }else{
        console.log(`ERROR: Request Incomplete Parameters`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({ error: `Missing required parameters: Ensure all required fields are provided.` });
    }

    // Check access_level is a number
    if(/\d/.test(access_level)){
        //do nothing
    }else{
        console.log(`ERROR: Invalid data type`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({ error: `Invalid data type: Ensure all parameters are of the correct data type.` });
    }


    //CREATE USER ACCESS LEVEL IN DATABASE
    // UPDATE users
    // SET access_level = '15'
    // WHERE user_name = 'NEWTEST';
    client.query(`UPDATE users SET access_level = '${access_level}' WHERE user_name = '${user_name}'`, (err, response) => {
        if (!err){
            //SUCCESS
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
            client.end;
            console.log(`SUCCESSFULLY changed access level of user ${user_name} to ${access_level}`);
            return res.status(200).send();
        } else {
            //ERROR PGADMIN
            console.log(`ERROR: Unsuccessfully modified user ${user_name}'s access level to ${access_level}`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            client.end;
            return res.status(500).json({ error: `Database error occurred: An unexpected error occurred.` });
        }
        //END POSTGRES CONNECTION
        client.end;
    })
})

// (#D) DELETE "/user" -- Delete Specific User
app.delete("/users/:user_name", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const user_name = req.params.user_name;

    // Check if user is available
    let to_check = await USER_is_available(user_name); // Call ID checker function
    if (to_check === false) {
        console.log(`ERROR: User with the username '${user_name}' is unavailable`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({ error: `Not Found: User '${user_name}' not available` });
    }

    //DELETE USER IN DATABASE
    // DELETE FROM users WHERE user_name ='peter';
    client.query(`DELETE FROM users WHERE user_name = '${user_name}'`, (err, response) => {
        if (!err){
            //SUCCESS
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
            client.end;
            console.log(`SUCCESSFULLY deleted user ${user_name}`);
            return res.status(200).send();
        } else {
            //ERROR PGADMIN
            console.log(`ERROR: Unsuccessfully deleted user ${user_name}`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            client.end;
            return res.status(500).json({ error: `Database error occurred: An unexpected error occurred.` });
        }
        //END POSTGRES CONNECTION
    })
})

// END User Management Endpoints -------------------------- //

// START Transactions Endpoints -------------------------- //

// (#E) "/transactions/?time_start&time_end" Return Last 20 Transactions by Default, Can give timestamp range
app.get("/transactions", async (req,res)=>{
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }


    // Optional arguments; will be NULL if not provided
    // Format: yyyy-mm-dd hh:mm:ss (hh in 24-hour cycle)
    const time_start = req.query.time_start;
    const time_end = req.query.time_end;

    // Step 1: Return data based on parameter values
    // [A] If NO optional parameters
    if (!time_start && !time_end){
        // Order all data by descending date and time and get ONLY the most recent
        client.query(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10`, (err, data) => {
            if (!err){
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
                console.log(`SUCCESSFULLY returned most recent transactions`);
                res.json(data.rows);
            } else {
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                console.log("ERROR: Getting most recent transactions");
            }
            client.end;
        })

    } else if (time_start && time_end) {
        // [B] With optional parameters time_start and time_end
        /*
        let arr_time_start = time_start.split("_");
        let arr_time_end  = time_end.split("_");
         */
        client.query(`SELECT * FROM transactions WHERE (timestamp BETWEEN '${time_start}' AND '${time_end}')`, (err, data) => {
            if(!err) {
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
                client.end;
                console.log(`SUCCESSFULLY returned transactions`);
                res.json(data.rows);
            } else {
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                client.end;
                console.log("ERROR: Getting transactions");
                return res.status(500).json({ error: `Database error occurred: An unexpected error occurred.` });
            }
            client.end;
        })

    } else {
        // [C] Error 400: Optional parameters are INCOMPLETE
        console.log("ERROR: Incomplete parameters in transactions request");
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        client.end;
        return res.status(400).json({ error: 'Invalid request: Missing arguments in request' });
    }
})

// END Transactions Endpoints -------------------------- //

// START Apollo AIR-1 Endpoints ------------------------ //
// (#1) "/air-1" GET all available Apollo AIR-1 IDs
app.get("/air-1", async (req, res) => {
    return GET_ids(res, req, "Apollo AIR-1", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#2) "/air-1/{id}" and "/air-1/{id}&options" GET the most recent/historical data of a specific Apollo AIR-1
app.get("/air-1/:id", async (req, res) => {
    return GET_data(res, req, "Apollo AIR-1", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#3) "/air-1/{id}/light" POST the state of the LED light of a specific Apollo AIR-1
app.post("/air-1/:id/light", async (req, res) => {
    return POST_light(res, req, "Apollo AIR-1", req.header("x-api-key"), req.method, req.originalUrl);
})

// END Apollo AIR-1 Endpoints -------------------------- //


// START Apollo MSR-2 Endpoints ------------------------ //
// (#1) "/msr-2" GET all available Apollo MSR-2 IDs
app.get("/msr-2", async (req, res) => {
    return GET_ids(res, req, "Apollo MSR-2", req.header("x-api-key"), req.method, req.originalUrl)
})

// (#2) "/msr-2/{id}" and "/msr-2/{id}&options" GET the most recent/historical data of a specific Apollo MSR-2
app.get("/msr-2/:id", async (req, res) => {
    return GET_data(res, req, "Apollo MSR-2", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#3) "/msr-2/{id}/light" POST the state of the LED light of a specific Apollo MSR-2
app.post("/msr-2/:id/light", async (req, res) => {
    return POST_light(res, req, "Apollo MSR-2", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#4) "/msr-2/{id}/buzzer" POST the rtttl string to be played on the buzzer of a specific Apollo MSR-2
app.post("/msr-2/:id/buzzer", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const deviceID = req.params.id;
    // Optional argument; will be NULL if not provided
    const mtttl_string = req.query.mtttl_string;

    // Step 1: Check if an Apollo MSR-2 with ID: deviceID is available
    if(await ID_is_available('apollo_msr_2', deviceID) === false){
        console.log(`Not Found: Apollo MSR-2 with ID: ${deviceID} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Apollo MSR-2 with ID: ${deviceID} does not exist`});
    }

    // Step 2: Check if the string to play was given
    if(!mtttl_string){
        console.log(`Bad Request: Incomplete parameters in POST request for Apollo MSR-2 with ID: ${device_id}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in POST request for Apollo MSR-2 with ID: ${device_id}`});
    }

    // Step 3: Build and publish the JSON file to the correct MQTT topic to play the buzzer
    let toPublish = {'mtttl_string' : `${mtttl_string}`};
    console.log(`POST request to Apollo MSR-2 with ID: ${deviceID} OK`);
    console.log(` - MQTT Topic: apollo_msr_2_${deviceID}/buzzer`);
    console.log(` - JSON File: ${JSON.stringify(toPublish)}`);
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    //mqttclient.publish(`apollo_msr_2_${deviceID}/buzzer`, JSON.stringify(toPublish));
    return res.status(200).send(`POST request to Apollo MSR-2 with ID: ${deviceID} OK`);
})

// END Apollo MSR-2 Endpoints -------------------------- //


// START Athom Smart Plug v2 Endpoints ----------------- //

// (#1) "/smart-plug-v2" GET all available Athom Smart Plug v2 IDs
app.get("/smart-plug-v2", async (req, res) => {
    return GET_ids(res, req, "Athom Smart Plug v2", req.header("x-api-key"), req.method, req.originalUrl)
})

// (#2) "/smart-plug-v2/{id}" and "/smart-plug-v2/{id}&options" GET the most recent/historical data of specific Athom Smart Plug v2
app.get("/smart-plug-v2/:id", async (req, res) => {
    return GET_data(res, req, "Athom Smart Plug v2", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#3) "/smart-plug-v2/{id}/relay" POST relay of specific Athom Smart Plug v2
app.post("/smart-plug-v2/:id/relay", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const deviceID = req.params.id;
    // Optional argument; will be NULL if not provided
    const relayState = req.query.state;

    // Step 1: Check if an Athom Smart Plug v2 with ID: deviceID is available
    if(await ID_is_available('athom_smart_plug_v2', deviceID) === false){
        console.log(`Not Found: Athom Smart Plug v2 with ID: ${deviceID} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Athom Smart Plug v2 with ID: ${deviceID} does not exist`});
    }

    // Step 2: Check if relayState was given and is a valid value
    if(!relayState){
        console.log(`Bad Request: Incomplete parameters in POST request for Athom Smart Plug v2 with ID: ${deviceID}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in POST request for Athom Smart Plug v2 with ID: ${deviceID}`});
    }else if(relayState !== "On" && relayState !== "Off"){
        console.log(`Bad Request: Invalid 'state' parameter in POST request for Athom Smart Plug v2 with ID: ${deviceID}. \n - Given value: ${relayState} \n - Possible values: "On", "Off"`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: Invalid 'state' parameter in POST request for Athom Smart Plug v2 with ID: ${deviceID}. | Given value: ${relayState} | Possible values: "On", "Off"`});
    }

    // Step 3: Build and publish the JSON file to the correct MQTT topic to set the relay
    let toPublish = {'state' : `${relayState}`};
    console.log(`POST request to Athom Smart Plug v2 with ID: ${deviceID} OK`);
    console.log(` - MQTT Topic: athom_smart_plug_v2_${deviceID}/relay`);
    console.log(` - JSON File: ${JSON.stringify(toPublish)}`);
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    mqttclient.publish(`athom_smart_plug_v2_${deviceID}/relay`, JSON.stringify(toPublish));
    return res.status(200).send(`POST request to Athom Smart Plug v2 with ID: ${deviceID} OK`);
})

// END Athom Smart Plug v2 Endpoints ------------------- //


// START AirGradient One Endpoints --------------------- //

// (#1) "/ag-one" GET all available AirGradient One IDs
app.get("/ag-one", async (req, res) => {
    return GET_ids(res, req, "AirGradient One", req.header("x-api-key"), req.method, req.originalUrl)
})

// (#2) "/ag-one/{id}" and "/ag-one/{id}&options" GET the most recent/historical data of a specific AirGradient One
app.get("/ag-one/:id", async (req, res) => {
    return GET_data(res, req, "AirGradient One", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#3) "/ag-one/{id}/light" POST the state of the LED strip of a specific AirGradient One
app.post("/ag-one/:id/light", async (req, res) => {
    return POST_light(res, req, "AirGradient One", req.header("x-api-key"), req.method, req.originalUrl);
})

// END AirGradient One Endpoints ----------------------- //


// START Zigbee2MQTT Endpoints ------------------------- //

// (#1) "/zigbee2mqtt" GET all available Zigbee2MQTT device IDs and group IDs
app.get("/zigbee2mqtt", async (req, res) => {
    return GET_ids(res, req, "Zigbee2MQTT", req.header("x-api-key"), req.method, req.originalUrl)
})

// (#2) "/zigbee2mqtt/{id}/get" GET the most recent/historical state of a specific Zigbee2MQTT device
app.get("/zigbee2mqtt/:id/get", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,1,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }


    // Step 0: Check if the ID belongs to a group
    let queryResult = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${req.params.id}'`);
    if(!queryResult.rowCount) {
        console.log(`Not found: Zigbee2MQTT with ID: ${req.params.id} is not available`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not found: Zigbee2MQTT with ID: ${req.params.id} is not available`});
    }else if(queryResult.rows[0]['type'] !== "device"){
        console.log(`Bad Request: ID: ${req.params.id} belongs to a Zigbee2MQTT group. Data requests are not available for groups`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: ID: ${req.params.id} belongs to a Zigbee2MQTT group. Data requests are not available for groups`});
    }
    return GET_data(res, req, "Zigbee2MQTT", specific_api_key, req.method, req.originalUrl);
})

// (#3) "/zigbee2mqtt/{id}/set" POST the state of a specific Zigbee2MQTT device or group
app.post("/zigbee2mqtt/:id/set", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const entityID = req.params.id;
    // Optional arguments; will be NULL if not provided
    const lightState = req.query.state;
    const lightBrightness = req.query.brightness;
    const lightColorTemperature = req.query.color_temperature;

    // Step 1: Check if an Zigbee2MQTT device or group with ID: entity_id is available
    let baseTopic = "";
    let queryResult = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${entityID}'`);
    if(!queryResult.rowCount) {
        console.log(`Not Found: Zigbee2MQTT with ID: ${entityID} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Zigbee2MQTT with ID: ${entityID} does not exist`});
    }else{
        // If entity_id is found, store its base topic
        baseTopic = queryResult.rows[0]["base_topic"];
    }

    // Step 2: Check if at least one optional parameter was given
    if(!lightState && !lightBrightness && !lightColorTemperature){
        console.log(`Bad Request: Incomplete parameters in POST request for Zigbee2MQTT with ID: ${entityID}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in POST request for Zigbee2MQTT with ID: ${entityID}`});
    }

    // Step 3: Check if the given values are valid and build the json file to be published
    let toPublish = {};
    if(lightState){
        if(lightState !== "ON" && lightState !== "OFF"){
            console.log(`Bad Request: Invalid 'state' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. \n - Given value: ${lightState} \n - Possible values: "ON", "OFF"`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(400).json({error: `Bad Request: Invalid 'state' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. | Given value: ${lightState} | Possible values: "ON", "OFF"`});
        }
        toPublish['state'] = lightState;
    }
    if(lightBrightness){
        if(lightBrightness < 0 || lightBrightness > 254){
            console.log(`Bad Request: Invalid 'brightness' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. \n - Given value: ${lightBrightness} \n - Possible values: any integer from 0 to 254`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(400).json({error: `Bad Request: Invalid 'brightness' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. | Given value: ${lightBrightness} | Possible values: any integer from 0 to 254`});
        }
        toPublish['brightness'] = lightBrightness;
    }
    if(lightColorTemperature){
        if(lightColorTemperature < 153 || lightColorTemperature > 500){
            console.log(`Bad Request: Invalid 'color_temperature' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. \n - Given value: ${lightColorTemperature} \n - Possible values: any integer from 153 to 500`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(400).json({error: `Bad Request: Invalid 'color_temperature' parameter in POST request for Zigbee2MQTT with ID: ${entityID}. | Given value: ${lightColorTemperature} | Possible values: any integer from 153 to 500`});
        }
        toPublish['color_temp'] = lightColorTemperature;
    }

    // Step 4: Publish the json file to the correct MQTT topic to set the light
    console.log(`POST request to Zigbee2MQTT with ID: ${entityID} OK`);
    console.log(` - MQTT Topic: ${baseTopic}/${entityID}/set`);
    console.log(` - JSON File: ${JSON.stringify(toPublish)}`);
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    mqttclient.publish(`${baseTopic}/${entityID}/set`, JSON.stringify(toPublish));
    return res.status(200).send(`POST request to Zigbee2MQTT with ID: ${entityID} OK`);
})

// END Zigbee2MQTT Endpoints --------------------------- //


// START Sensibo Endpoints ----------------------------- //
const HOME_ASSISTANT_URL_BASE = "http://10.158.71.11:8123/api";
const HOME_ASSISTANT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI3N2ViMDIzZmJjOWE0Yjc2YmYwMjE4YTFmOWY1ZDQwNyIsImlhdCI6MTc0MDExMjc4NSwiZXhwIjoyMDU1NDcyNzg1fQ.iNJpri8xnC_SvNbWGg1ygTWq6ywvhkuCYRJI2GpB0UI";
const HOME_ASSISTANT_HEADERS = {"Authorization": `Bearer ${HOME_ASSISTANT_TOKEN}`, "content-type": "application/json"};

// (#1) "/sensibo" GET all available Sensibo Air Pro IDs
app.get("/sensibo", async (req, res) => {
    return GET_ids(res, req, "Sensibo", req.header("x-api-key"), req.method, req.originalUrl)
})

// (#2) "/sensibo/{id}" and "/sensibo/{id}&options" GET the [most recent/historical] data of a specific Sensibo Air Pro
app.get("/sensibo/:id", async (req, res) => {
    return GET_data(res, req, "Sensibo", req.header("x-api-key"), req.method, req.originalUrl);
})

// (#3) "/sensibo/{id}/hvac" POST the state of a Sensibo Air Pro's HVAC
app.post("/sensibo/:id/hvac", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const deviceID = req.params.id;
    // Optional arguments; will be NULL if not provided
    const hvacMode = req.query.hvac_mode
    const targetTemperature = req.query.target_temperature

    // Step 1: Check if an Sensibo with ID: deviceID is available
    if(await ID_is_available('sensibo', deviceID) === false){
        console.log(`Not Found: Sensibo with ID: ${deviceID} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Sensibo with ID: ${deviceID} does not exist`});
    }

    // Step 2: Check if at least one optional parameter is given
    if(!hvacMode && !targetTemperature){
        console.log(`Bad Request: Incomplete parameters in POST request for Sensibo with ID: ${deviceID}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: Incomplete parameters in POST request for Sensibo with ID: ${deviceID}`});
    }

    // Step 3: POST based on parameter values and check if they are valid
    if(hvacMode){
        if(hvacMode !== "off" && hvacMode !== "heat" && hvacMode !== "cool"){
            console.log(`Bad Request: Invalid 'hvac_mode' parameter in POST request for Sensibo with ID: ${deviceID} \n - Given value: ${hvacMode} \n - Possible values: "off", "heat", "cool"`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(404).json({error: `Bad Request: Invalid 'hvac_mode' parameter in POST request for Sensibo with ID: ${deviceID} | Given value: ${hvacMode} | Possible values: "off", "heat", "cool"`});
        }
        let parameters = {"entity_id": deviceID, "hvac_mode": hvacMode};
        await fetch(`${HOME_ASSISTANT_URL_BASE}/services/climate/set_hvac_mode`, {method: 'POST', body: JSON.stringify(parameters), headers: HOME_ASSISTANT_HEADERS})
    }
    if(targetTemperature){
        if(targetTemperature < 10 || targetTemperature > 35){
            console.log(`Bad Request: Invalid 'target_temperature' parameter in POST request for Sensibo with ID: ${deviceID} \n - Given value: ${targetTemperature} \n - Possible values: any value from 10 to 35`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(404).json({error: `Bad Request: Invalid 'target_temperature' parameter in POST request for Sensibo with ID: ${deviceID} | Given value: ${targetTemperature} | Possible values: any value from 10 to 35`});
        }
        let parameters = {"entity_id": deviceID, "temperature": targetTemperature};
        await fetch(`${HOME_ASSISTANT_URL_BASE}/services/climate/set_temperature`, {method: 'POST', body: JSON.stringify(parameters), headers: HOME_ASSISTANT_HEADERS});
    }

    // Step 4: Return status 200 OK
    console.log(`POST request to Sensibo with ID: ${deviceID} OK`);
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    if(hvacMode){console.log(` - Given HVAC mode: ${hvacMode}`);}
    if(targetTemperature){console.log(` - Given target temperature: ${targetTemperature}`);}
    return res.status(200).send(`POST request to Sensibo with ID: ${deviceID} OK`);
})

// END Sensibo Endpoints ------------------------------- //


// START Groups Endpoints ------------------------------ //

// (#1) "/groups" GET/POST/PUT/DELETE groups (mapping of devices to tables)
// (1a) GET: Return all group IDs
app.get("/groups", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,1,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    let queryResult = await client.query("SELECT * FROM groups");
    if(queryResult.rows.length){
        let data = {};
        for(let row of queryResult.rows) {
            data[row["id"]] = {};
            if(row["apollo_air_1_ids"]){
                data[row["id"]]["apollo_air_1_ids"] = row["apollo_air_1_ids"];
            }
            if(row["apollo_msr_2_ids"]){
                data[row["id"]]["apollo_msr_2_ids"] = row["apollo_msr_2_ids"];
            }
            if(row["athom_smart_plug_v2_ids"]){
                data[row["id"]]["athom_smart_plug_v2_ids"] = row["athom_smart_plug_v2_ids"];
            }
            if(row["zigbee2mqtt_ids"]){
                data[row["id"]]["zigbee2mqtt_ids"] = row["zigbee2mqtt_ids"];
            }
        }
        console.log("Successfully returned all group IDs");
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
        res.json(data);
    }else{
        console.log("There are no group IDs to return");
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        res.json({});
    }
})

// (1b) POST: Add a new group. FOR HIGHEST PRIVILEGE ONLY
app.post("/groups", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const id = req.query.id;
    // Optional arguments; will be NULL if not provided
    apollo_air_1_ids = req.query.apollo_air_1_ids;
    apollo_msr_2_ids = req.query.apollo_msr_2_ids;
    athom_smart_plug_v2_ids = req.query.athom_smart_plug_v2_ids;
    zigbee2mqtt_ids = req.query.zigbee2mqtt_ids;

    // Step 1: Check if the id is already taken
    let queryResult = await client.query(`SELECT * FROM groups WHERE id = '${id}'`);
    if(queryResult.rows.length){
        console.log(`Bad Request: There is already a group with ID: ${id}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Bad Request: There is already a group with ID: ${id}`});
    }

    // Step 2: Build the data for the query and check if the given device IDs are valid
    let deviceIDs = [apollo_air_1_ids, apollo_msr_2_ids, athom_smart_plug_v2_ids, zigbee2mqtt_ids];
    let deviceNames = ['Apollo AIR-1', 'Apollo MSR-2', 'Athom Smart Plug v2', 'Zigbee2MQTT'];
    let data = {"id":`'${id}'`};
    let id_is_available = true;
    for(let nameIndex = 0; nameIndex < deviceIDs.length; nameIndex++){
        if(deviceIDs[nameIndex]){
            if(typeof(deviceIDs[nameIndex]) === "string"){
                id_is_available = await ID_is_available(`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`, deviceIDs[nameIndex]);
                if(!id_is_available){
                    console.log(`Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} does not exist`);
                    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                    return res.status(404).json({error: `Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} does not exist`});
                }
                if(deviceNames[nameIndex] === "Zigbee2MQTT"){
                    let result = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${deviceIDs[nameIndex]}' AND type = 'device'`);
                    if(!result.rowCount){
                        console.log(`Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} cannot be added to a group`);
                        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                        return res.status(404).json({error: `Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} cannot be added to a group`});
                    }
                }
            }else{
                for(let idIndex = 0; idIndex < deviceIDs[nameIndex].length; idIndex++){
                    id_is_available = await ID_is_available(`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`, deviceIDs[nameIndex][idIndex]);
                    if(!id_is_available){
                        console.log(`Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} does not exist`);
                        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                        return res.status(404).json({error: `Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} does not exist`});
                    }
                    if(deviceNames[nameIndex] === "Zigbee2MQTT"){
                        let result = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${deviceIDs[nameIndex][idIndex]}' AND type = 'device'`);
                        if(!result.rowCount){
                            console.log(`Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} cannot be added to a group`);
                            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                            return res.status(404).json({error: `Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} cannot be added to a group`});
                        }
                    }
                }
            }
            data[`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}_ids`] = `'{${deviceIDs[nameIndex]}}'`;
        }
    }

    // Step 3: Insert data about the group into the database
    await client.query(`INSERT INTO groups (${Object.keys(data).toString()}) VALUES (${Object.values(data).toString()})`, (err) => {
        if(err){
            console.log(err);
            console.log(`Bad Request: Bad arguments in POST request`);
            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
            return res.status(400).json({error: `Bad Request: Bad arguments in POST request`})
        }
        client.end;
    })
    console.log(`Successfully crated a new group with ID: ${id}`);
    if(apollo_air_1_ids){console.log(` - Apollo AIR-1's: ${apollo_air_1_ids}`);}
    if(apollo_msr_2_ids){console.log(` - Apollo MSR-2's: ${apollo_msr_2_ids}`);}
    if(athom_smart_plug_v2_ids){console.log(` - Athom Smart Plug v2's: ${athom_smart_plug_v2_ids}`);}
    if(zigbee2mqtt_ids){console.log(` - Zigbee2MQTT's: ${zigbee2mqtt_ids}`);}
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    return res.status(200).send(`Successfully crated a new group with ID: ${id}`);
})

// (1c) PUT: Change the members of a group. FOR HIGHEST PRIVILEGE ONLY
app.put("/groups", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }


    const id = req.query.id;
    // Optional arguments; will be NULL if not provided
    apollo_air_1_ids = req.query.apollo_air_1_ids;
    apollo_msr_2_ids = req.query.apollo_msr_2_ids;
    athom_smart_plug_v2_ids = req.query.athom_smart_plug_v2_ids;
    zigbee2mqtt_ids = req.query.zigbee2mqtt_ids;

    // Step 1: Check if a group with ID: id is available
    let queryResult = await client.query(`SELECT * FROM groups WHERE id = '${id}'`);
    if(!queryResult.rows.length){
        console.log(`Not Found: Group with ID: ${id} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Group with ID: ${id} does not exist`});
    }

    // Step 2: Check if at least one optional parameter is given
    if(!apollo_air_1_ids && !apollo_msr_2_ids && !athom_smart_plug_v2_ids && !zigbee2mqtt_ids){
        console.log(`ERROR: Incomplete parameters in PUT request`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(400).json({error: `Invalid request: Incomplete parameters in PUT request`});
    }

    // Step 3: Build the data to be used in the query and check if the given device IDs are valid
    let deviceIDs = [apollo_air_1_ids, apollo_msr_2_ids, athom_smart_plug_v2_ids, zigbee2mqtt_ids];
    let deviceNames = ['Apollo AIR-1', 'Apollo MSR-2', 'Athom Smart Plug v2', 'Zigbee2MQTT'];
    let data = {};
    let id_is_available = true;
    for(let nameIndex = 0; nameIndex < deviceIDs.length; nameIndex++){
        if(deviceIDs[nameIndex]){
            if(typeof(deviceIDs[nameIndex]) === "string"){
                if(deviceIDs[nameIndex] === "[REMOVE ALL MEMBERS]"){
                    data[`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`] = 'NULL';
                    continue;
                }

                id_is_available = await ID_is_available(`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`, deviceIDs[nameIndex]);
                if(!id_is_available){
                    console.log(`Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} does not exist`);
                    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                    return res.status(404).json({error: `Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} does not exist`});
                }
                if(deviceNames[nameIndex] === "Zigbee2MQTT"){
                    let result = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${deviceIDs[nameIndex]}' AND type = 'device'`);
                    if(!result.rowCount){
                        console.log(`Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} cannot be added to a group`);
                        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                        return res.status(404).json({error: `Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex]} cannot be added to a group`});
                    }
                }
            }else{
                for(let idIndex = 0; idIndex < deviceIDs[nameIndex].length; idIndex++){
                    id_is_available = await ID_is_available(`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`, deviceIDs[nameIndex][idIndex]);
                    if(!id_is_available){
                        console.log(`Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} does not exist`);
                        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                        return res.status(404).json({error: `Not Found: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} does not exist`});
                    }
                    if(deviceNames[nameIndex] === "Zigbee2MQTT"){
                        let result = await client.query(`SELECT * FROM zigbee2mqtt WHERE id = '${deviceIDs[nameIndex][idIndex]}' AND type = 'device'`);
                        if(!result.rowCount){
                            console.log(`Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} cannot be added to a group`);
                            UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                            return res.status(404).json({error: `Bad Request: ${deviceNames[nameIndex]} with ID: ${deviceIDs[nameIndex][idIndex]} cannot be added to a group`});
                        }
                    }
                }
            }
            data[`${deviceNames[nameIndex].toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")}`] = `'{${deviceIDs[nameIndex]}}'`;
        }
    }

    // Step 4: Edit the group's details in the database
    for(let index = 0; index < Object.keys(data).length; index++){
        await client.query(`UPDATE groups SET ${Object.keys(data)[index]}_ids = ${Object.values(data)[index]} WHERE id = '${id}'`, (err) => {
            if(err){
                console.log(err);
                console.log(`ERROR: Bad arguments in PUT request`);
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                return res.status(400).json({error: `Bad arguments in PUT request`})
            }
            client.end;
        })
    }
    console.log(`Successfully edited members of group with ID: ${id}`);
    if(apollo_air_1_ids){console.log(` - Apollo AIR-1's: ${apollo_air_1_ids}`);}
    if(apollo_msr_2_ids){console.log(` - Apollo MSR-2's: ${apollo_msr_2_ids}`);}
    if(athom_smart_plug_v2_ids){console.log(` - Athom Smart Plug v2's: ${athom_smart_plug_v2_ids}`);}
    if(zigbee2mqtt_ids){console.log(` - Zigbee2MQTT's: ${zigbee2mqtt_ids}`);}
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    return res.status(200).send(`Successfully edited members of group with ID: ${id}`);
})

// (1d) DELETE: Delete a group. FOR HIGHEST PRIVILEGE ONLY
app.delete("/groups", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0]) === false){ //______ SECURITY CONDITIONAL
        return;
    }


    const id = req.query.id;

    // Step 1: Check if a group with ID: id is available
    let queryResult = await client.query(`SELECT * FROM groups WHERE id = '${id}'`);
    if(!queryResult.rows.length){
        console.log(`Not Found: Group with ID: ${id} does not exist`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
        return res.status(404).json({error: `Not Found: Group with ID: ${id} does not exist`});
    }

    // Step 2: DELETE the group from the table
    await client.query(`DELETE FROM groups WHERE id = '${id}'`, () => {
        console.log(`Successfully deleted group with ID: ${id}`);
        UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
        return res.status(200).send(`Successfully deleted group with ID: ${id}`);
    });
})

// (#2) "/groups/{id}" GET all current data from all devices in a specific group
app.get("/groups/:id", async (req, res) => {
    let specific_api_key = req.header("x-api-key"); //Extract API Key from Header
    if(await SECURITY_CHECK(res, req, specific_api_key, [0,1,2]) === false){ //______ SECURITY CONDITIONAL
        return;
    }

    const id = req.params.id;

    // Step 1: Check if a group with ID: id is available. If id is available, get the group members
    let groupMembers = await new Promise(function(resolve){
        client.query(`SELECT * FROM groups WHERE id = '${id}'`, (err, queryResult) => {
            if(!queryResult.rows.length){
                console.log(`Not Found Group with ID: ${id} does not exist`);
                UPDATE_transactions(specific_api_key, req.method, req.originalUrl, false);
                return res.status(404).json({error: `Not Found: Group with ID: ${id} does not exist`});
            }
            delete queryResult.rows[0].id;
            resolve(queryResult.rows[0]);
        });
    });

    // Step 2: Get the most recent data from the group's members
    let groupData = {};
    let groupMembersKeys = Object.keys(groupMembers);
    let groupMembersValues = Object.values(groupMembers);
    for(let keyIndex = 0; keyIndex < groupMembersKeys.length; keyIndex++){
        if(!groupMembers[groupMembersKeys[keyIndex]]){
            // Skip if there are no ids
            continue;
        }
        // Get the data from each of the ids
        for(let valueIndex = 0; valueIndex < groupMembersValues[keyIndex].length; valueIndex++){
            groupData[`${groupMembersKeys[keyIndex].replace("_ids", "")}_${groupMembersValues[keyIndex][valueIndex]}`] = await new Promise(function (resolve) {
                client.query(`SELECT * FROM ${groupMembersKeys[keyIndex].replace("_ids", "")}_${groupMembersValues[keyIndex][valueIndex]} ORDER BY timestamp DESC LIMIT 1`, (err, queryResult) => {
                    resolve(queryResult.rows[0]);
                });
            });
        }
    }

    // Step 3: Pass the data to the GET request
    console.log(`Successfully returned most recent data for all devices in the group with id: ${id}`);
    UPDATE_transactions(specific_api_key, req.method, req.originalUrl, true);
    res.json(groupData);
})

// END Groups Endpoints -------------------------------- //


// ------------ END Define REST Endpoints ----------- //



// Server hosted at port 80
app.listen(80, () => console.log("SSL IoT 1 Server Hosted at port 80"));
