import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";

const resSettings = await fetch("../conf/settings.json")
const settings = await resSettings.json()
//console.log(" from json file ", settings)

let numPackets = 0;
let seedlink = null;
let paused = false;
let stopped = true;
let rtDisp = null;

function updateNumPackets() {
  numPackets++;
  document.querySelector("#numPackets").textContent = numPackets;
}
function addToDebug(message) {
  const debugDiv = document.querySelector("div#debug");
  if (!debugDiv) {
    return;
  }
  const pre = debugDiv.appendChild(document.createElement("pre"));
  const code = pre.appendChild(document.createElement("code"));
  code.textContent = message;
}
function clearDebug() {
  const debugDiv = document.querySelector("div#debug");
  if (!debugDiv) {
    return;
  }
  while (debugDiv.firstChild) {
    debugDiv.removeChild(debugDiv.firstChild);
  }
}
function errorFn(error) {
  console.assert(false, error);
  if (seedlink) {
    seedlink.close();
  }
  addToDebug("Error: " + error);
}

function getSLConfig(streamStat) {
  // Build the seedlink commands to stream a channel.
  // StreamStat.key is of the form: "CI_ADO__BHZ/MSEED"
  // Output is of the form ["STATION ADO CI", "SELECT BHZ.D", ] 
  //  or if location code is given: ["STATION ADO CI", "SELECT 00BHZ.D"]
  let nslcStr = streamStat.key.split('/')[0];
  let nslcObj = sp.fdsnsourceid.NslcId.parse(nslcStr, '_');
  let configArr = []
  configArr.push("STATION " + nslcObj.stationCode + " " + nslcObj.networkCode);
  configArr.push("SELECT " + nslcObj.locationCode + nslcObj.channelCode + ".D");
  return configArr
}

const resChannels = await fetch('../conf/channellist.json');
const jsonData = await resChannels.json();
//console.log('jsonData', jsonData)

let selStreams = jsonData["channellist"];
let selConfigs = [];
let netCodes = new Set();
let staCodes = new Set();
let locCodes = new Set();
let chanCodes = new Set();

selStreams.forEach((streamStat) => {
  let nslcStr = streamStat.split('/')[0];
  let nslcObj = sp.fdsnsourceid.NslcId.parse(nslcStr, '_');
  selConfigs.push("STATION " + nslcObj.stationCode + " " + nslcObj.networkCode);
  selConfigs.push("SELECT " + nslcObj.locationCode + nslcObj.channelCode + ".D");
  netCodes.add(nslcObj.networkCode);
  staCodes.add(nslcObj.stationCode);
  chanCodes.add(nslcObj.channelCode);
  locCodes.add(nslcObj.locationCode);
})

let fdsnStaQuery = new sp.fdsnstation.StationQuery(settings.FDSN_WS);
let netStr = Array.from(netCodes).join(',');
let staStr = Array.from(staCodes).join(',');
let chanStr = Array.from(chanCodes).join(',');
let locStr = Array.from(locCodes).join(',');
fdsnStaQuery.networkCode(netStr)
  .stationCode(staStr)
  .channelCode(chanStr)
  .locationCode(locStr);

fdsnStaQuery.formURL(sp.fdsnstation.LEVEL_CHANNEL);

let networkList = [];
networkList = await fdsnStaQuery.queryChannels();

const duration = sp.luxon.Duration.fromISO(settings.DURATION);
const rtConfig = {
  duration: duration,
  networkList: networkList,
};

let quakes_M1_0 = null;
quakes_M1_0 = await sp.usgsgeojson.loadHourSummaryM1_0();

const mymap = document.querySelector("sp-station-quake-map");
let allStations = Array.from(sp.stationxml.allStations(networkList));
mymap.addStation(allStations);

console.log("quakes: ", quakes_M1_0);
mymap.addQuake(quakes_M1_0);

let markers = [];
for (let quake of quakes_M1_0) {
  let marker;
  marker = sp.seismographmarker.createMarkerForOriginTime(quake);
  markers.push(marker);
}
console.log("quake markers", markers);
mymap.draw();

let realtimeDiv = document.getElementById("realtime");

rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
realtimeDiv.appendChild(rtDisp.organizedDisplay);
rtDisp.organizedDisplay.draw();
rtDisp.animationScaler.minRedrawMillis =
  sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);
rtDisp.animationScaler.animate();

const seisConfig = rtDisp.organizedDisplay.seismographConfig;
const lts = seisConfig.linkedTimeScale;
seisConfig.xGridLines=true;
// uncomment below to hide the xaxis
//seisConfig.isXAxis = false
seisConfig.margin = {top:5, right: 10, bottom:5, left:85};
seisConfig.maxHeight = 100;
seisConfig.xLabel = '';

// display now time
const n_span = document.getElementById("nt");
let setStyleFlag = true;

setInterval(() => {
  // Define the styles only once. 
  if (setStyleFlag) {
    setStyleFlag = false;
    let orgItems = rtDisp.organizedDisplay.getDisplayItems();
    orgItems = orgItems.filter( oi => oi.plottype === sp.organizeddisplay.SEISMOGRAPH);
    for (let oi of orgItems) {
      // this style is followed by the one defined in the library with value 200 and that wins. 
      oi.addStyle(`sp-seismograph{min-height:100px;}`);
//      oi.isXAxisTop=true;
//      oi.isXAxis=false;
//      console.log(oi);
    }
//    orgItems[0].isXAxis = true;
//    orgItems[0].isXAxisTop = true;

    const marker = {
        markertype: "predicted",
        name: "Static Marker",
        time: sp.luxon.DateTime.utc(),
        description: "Page loaded!",
      };

    console.log('marker for now: ', marker);
    let sdds = rtDisp.organizedDisplay.seisData;
    
    for (let sdd of sdds) {
      sdd.addMarker(marker);

      /* code to add quake object to the seismogram. 
      No error, but no marker added either
      for (let quake of quakes_M1_0) {
        sdd.addQuake(quake);
        console.log(' adding quake ', quake ,' to sdd ', sdd.codes() );
      }
      */

      /*uncommenting the below line raises javscript error "[Error] Error: Null/undef DateTime: undefined
  toJSDate (seisplotjs_3.1.5-SNAPSHOT_standalone.mjs:43476)
  for (seisplotjs_3.1.5-SNAPSHOT_standalone.mjs:58071)
  (anonymous function) (seisplotjs_3.1.5-SNAPSHOT_standalone.mjs:60350)
  filter
  redrawWithXScale (seisplotjs_3.1.5-SNAPSHOT_standalone.mjs:60349)
  (anonymous function) (seisplotjs_3.1.5-SNAPSHOT_standalone.mjs:60790)"
    */

      //sdd.addMarker(markers);

    }
  }
  // update the current time
  n_span.textContent = sp.luxon.DateTime.utc().toISO();
}, 1000);

let toggleConnect = function () {
  stopped = !stopped;
  const btnConnect = document.querySelector("button#disconnect");

  if (stopped) {
    document.querySelector("button#disconnect").textContent = "Reconnect";
    if (seedlink) {
      seedlink.close();
    }
  } else {
    document.querySelector("button#disconnect").textContent = "Disconnect";
    if (!seedlink) {
      seedlink = new sp.seedlink.SeedlinkConnection(
        settings.SEEDLINK_URL,
        selConfigs,
        (packet) => {
          rtDisp.packetHandler(packet);
          updateNumPackets();
        },
        errorFn,
      );
    }
    if (seedlink) {
      const start = sp.luxon.DateTime.utc().minus(duration);
      seedlink.setTimeCommand(start)
      seedlink.connect();
    }
  }
}; // end toggleConnect

document
  .querySelector("button#disconnect")
  .addEventListener("click", function (evt) {
    toggleConnect();
  });

// pause
document
  .querySelector("button#pause")
  .addEventListener("click", function (evt) {
    togglePause();
  });

let togglePause = function () {
  paused = !paused;
  if (paused) {
    document.querySelector("button#pause").textContent = "Play";
    rtDisp.animationScaler.pause();
  } else {
    document.querySelector("button#pause").textContent = "Pause";
    rtDisp.animationScaler.animate();
  }
};

// go
toggleConnect();

