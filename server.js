
const mqtt = require('mqtt');
const express = require('express');
const mongoose = require('mongoose');
var bodyParser = require('body-parser');



//conect mqtt
// const client = mqtt.connect("mqtt://52.187.125.59",{username:"BKvm", password: "Hcmut_CSE_2020"});
// client.on("connect",() => console.log("connected to mqtt"));
// client.subscribe("Topic/TempHumi");

const client = mqtt.connect("mqtt://40.87.100.106:1883");
client.on("connect",() => console.log("connected to mqtt"));
client.subscribe("Topic/TempHumi");



//connect database
const uri= "mongodb+srv://thelast:thelast@cluster0-eln37.mongodb.net/doan-database?retryWrites=true&w=majority";
mongoose.connect(uri,{useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

// schema
var sensorSchemar = mongoose.Schema({
    device_id : String,
    temp : String,
    humid : String,
    time : Date
});
var flagSchemar = mongoose.Schema({
    flag: Boolean
});
var autoSchemar = mongoose.Schema({
    xhigh: Number,
    high: Number,
    medium: Number,
    low: Number
});

const Flag = mongoose.model('Flag',flagSchemar, 'flag');
const Auto = mongoose.model('Auto', autoSchemar, 'auto');
// var flagauto = new Flag({flag: true});
// flagauto.save((error, value) => {});
const Sensor = mongoose.model('Sensor',sensorSchemar,'sensor');
function insert(id, temp, humid) {
    var value1 = new Sensor({device_id:id,temp:temp , humid:humid, time: Date.now()});
    value1.save((error, value) => {
        if (error) return console.error(error);
        console.log(value , 'stored to sensor collection');
    })
}
function publish(topic,msg){
    //msg is json
    console.log("publishing",msg);
  if (client.connected == true){
    arr = [msg];
    console.log('array is ',arr);
    client.publish(topic,JSON.stringify(arr));
    }
};
var motorValue = {
    device_id : "Speaker",
    values: ['0','1']
};
////initial setting
var xhigh = 45
var high = 40
var medium = 35
var low = 28
// find if database doesnt have auto setting
if (!Auto.exists({})) {
    let newSetting = new Auto({xhigh: xhigh, high:high, medium: medium, low: low});
    newSetting.save((error,value) => {});
    console.log("added initial setting.");
}
else {
    Auto.updateOne({},{xhigh: xhigh, high:high, medium: medium, low: low},(error, value)=>{
        if (!error) console.log('updated setting');
    })
}

client.on('message',async (topic, message, packet) =>{
     try {
        sensorValue = JSON.parse(message)[0];
        console.log("message is",sensorValue);
        console.log("topic is ",topic);
        console.log('temperature is ',sensorValue['values'][0]);
        console.log("here")
        insert(sensorValue['device_id'],sensorValue['values'][0],sensorValue['values'][1]);
        var auto = await CheckFlag();
        if (auto === true) {
            var result = await getSetting();
            var xhigh = result[0];
            var high = result[1];
            var medium = result[2];
            var low = result[3];
            var currentTemp = Number(sensorValue['values'][0])
            if (currentTemp >= xhigh) {
                motorValue['values'][0] = "1";
                motorValue['values'][1] = "1000";
            }
            else if (currentTemp >= high) {
                motorValue['values'][0] = "1";
                motorValue['values'][1] = "750";
            }
            else if (currentTemp >= medium) {
                motorValue['values'][0] = "1";
                motorValue['values'][1] = "500";
            }
            else if (currentTemp >= low) {
                motorValue['values'][0] = "1";
                motorValue['values'][1] = "250";
            }
            else {
                motorValue['values'][0] = "0";
            }
            console.log(motorValue);
            publish("Topic/Speaker",motorValue);
        }
    } catch (error) {
        console.log("fail");
    }
});

async function FindLast () {
    let value =await Sensor.findOne().sort('-time').select('-_id temp humid');
    return value;
}
async function CheckFlag() {
    let flag = await Flag.findOne();
    console.log('flag is ',flag['flag']);
    return flag['flag'];
}
async function Setflag(value) {
    await Flag.updateOne({},{flag : value},(error, value)=>{
        if (!error) console.log('flag is changed');
    });
}
async function getSetting() {
    let setting = await Auto.findOne();
    console.log('setting is ',setting);
    return [setting['xhigh'],setting['high'],setting['medium'],setting['low']];
}
async function setSetting(xhigh, high, medium, low) {
    await Auto.updateOne({},{xhigh: xhigh, high:high, medium: medium, low: low},(error, value)=>{
        if (!error) console.log('updated setting');
    });
}
async function getHistory() {

}
async function setTimer(value) {
    await Setflag(false);
    publish("Topic/Speaker",value);
}


// server
var app = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

Setflag(true);
const PORT = process.env.PORT || 8080;
app.get('/', (req,res) => res.send("Hello!"));


app.get('/',async (req,res) => {
    res.send("hello");
});
app.post('/setting',async (req,res) => {
    console.log("recieving new setting from a client...");
    console.log(req.body);
    try {
        var xhigh = Number(req.body['xhigh']);
        var high = Number(req.body['high']);
        var medium = Number(req.body['medium']);
        var low = Number(req.body['low']);
    } catch (error) {
        console.log("invalid request body");
        return;
    }
    await setSetting(xhigh, high, medium, low); //change setting
    await Setflag(true); //turn on auto if not
});
app.get('/tempHumid',async (req,res) => {
    console.log("recieving tempHumid request from a client...");
    let result = await FindLast();
    res.send({temp:result['temp'],humid:result['humid']});
    console.log(result['temp'],result['humid']," is delivered");
});
app.get('/autoStatus', async (req,res) => {
    console.log("recieving autoStatus request from a client...");
    let autoStatus = await CheckFlag();
    value = autoStatus?"ON":"OFF";
    res.send(value.toString());
    console.log(value.toString()," is delivered");
});
app.get('/stop',async (req, res) => {
    console.log("req is ",req);
    await Setflag(false);
    res.send("auto publishing is off");
});
app.get('/auto',async (req, res) => {
    await Setflag(true);
    res.send("auto publishing is on");
});

app.get('/getSetting', async (req,res) => {
    console.log("receving getSetting request from a client...");
    var result = await getSetting();
    var xhigh = result[0];
    var high = result[1];
    var medium = result[2];
    var low = result[3];
    res.send({xhigh: xhigh, high:high, medium:medium, low:low});
});
app.post('/setSpeaker', async (req,res) => {
    console.log("receving setSpeaker request from a client...");
    await Setflag(false);
    res.send("auto publishing is off");
    console.log(req.body);
    try {
        var speaker = req.body['speaker'];
    } catch (error) {
        console.log("invalid request body");
        return;
    }
    motorValue['values'] = ['1',speaker];
    publish("Topic/Speaker",motorValue);
});
app.post('/setTimer', (req,res) => {
    console.log("receving setTimer request from a client...");
    try {
        var time = Number(req.body['time']);
        var value = String(req.body['value']);
    }
    catch {
        console.log("invalid body");
        return;
    }
    motorValue['values'] = ['1',value];
    setTimeout(setTimer, time,motorValue);
})


app.listen(PORT, () => console.log('server listening at port ',PORT));












