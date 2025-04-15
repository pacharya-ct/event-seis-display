import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";

const resSettings = await fetch("../conf/settings.json")
const settings = await resSettings.json()

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
const duration = sp.luxon.Duration.fromISO(settings.DURATION);
let fdsnStaQuery = new sp.fdsnstation.StationQuery(settings.FDSN_WS);
let netStr = Array.from(netCodes).join(',');
let staStr = Array.from(staCodes).join(',');
let chanStr = Array.from(chanCodes).join(',');
let locStr = Array.from(locCodes).join(',');
fdsnStaQuery.networkCode(netStr)
  .stationCode(staStr)
  .channelCode(chanStr)
  .locationCode(locStr)
  .startTime(sp.luxon.DateTime.utc()-duration);
fdsnStaQuery.formURL(sp.fdsnstation.LEVEL_CHANNEL);

let networkList = [];
networkList = await fdsnStaQuery.queryChannels();

const rtConfig = {
  duration: duration,
  networkList: networkList,
};
const mymap = document.querySelector("sp-station-quake-map");

let pickMarkerBySta = new Map();
let eventIdList = [];

let getEvent = function () {
  if (!settings.EVENT_WS) {
    console.log('Event Webservice is not defined. Skip fetching picks')
    return;
  }
  let eventQuery = new sp.fdsnevent.EventQuery(settings.EVENT_WS);

  //get events using the time period of the seisograph display
  eventQuery.startTime(sp.luxon.DateTime.utc()-duration);
  eventQuery.includeArrivals(true);
  eventQuery.formURL();
  pickMarkerBySta.clear();
  eventQuery.query().then( (quakeList)  => {
    for (const station of sp.stationxml.allStations(networkList)) {

      let pickMarkerList = [];
      for (let quake of quakeList) {
        let markers = [];
        
        if (quake.pickList) {
          quake.pickList.forEach((pick) => {
            if (pick && pick.isAtStation(station)) {
              let name = pick.phaseHint == 'P'? pick.phaseHint: ' '+pick.phaseHint;
              markers.push({
                markertype: pick.phaseHint+"pick",
                name: pick.phaseHint,
                time: pick.time,
                description: "Event id: " + quake.eventId
              });
            }
          });
        }
        if (markers.length>0) {
          pickMarkerList.push(...markers);
        }
        eventIdList.push (quake.eventId);
      }
      if (pickMarkerList.length>0){
        pickMarkerBySta.set(station.codes(), pickMarkerList);
      }
    }
    console.log("allpicks ", pickMarkerBySta);

    let sdds = rtDisp.organizedDisplay.seisData;
    
    for (let sdd of sdds) {
      sdd.addQuake(quakeList);
      let netsta = sdd.networkCode +'.' + sdd.stationCode;
      sdd.markerList = [];
      if (pickMarkerBySta.has(netsta)) {
        let sddmarkers = sdd.getMarkers();
        sdd.addMarkers(pickMarkerBySta.get(netsta));
      } 
    }
  })
}

//Get event picks
//let eventTimer = setInterval(getEvent, 120000);

let allStations = Array.from(sp.stationxml.allStations(networkList));
mymap.addStation(allStations);
mymap.drawStationLayer();

let setStylesOnRedraw = function(el) {
  let orgItems = rtDisp.organizedDisplay.getDisplayItems();
  orgItems = orgItems.filter( oi => oi.plottype === sp.organizeddisplay.SEISMOGRAPH);
  let bgcolortoggle = true;
  for (let oi of orgItems) {
    bgcolortoggle=!bgcolortoggle;
    oi.addStyle(`sp-seismograph{ border:1px solid #eeeeee; margin:1px 2px 1px 2px; background-color:#fff }`);
    oi.getContainedPlotElements().forEach((pe) => {
      pe.addStyle(`sp-seismograph .marker.pickPP polygon { fill: rgba(106, 90, 205, 0.4);}`);
    })
      
    /*if (bgcolortoggle){
      oi.addStyle(`sp-seismograph{background-color:#ededed;}`);
    }*/
  }
}

let realtimeDiv = document.getElementById("realtime");

rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
realtimeDiv.appendChild(rtDisp.organizedDisplay);
rtDisp.organizedDisplay.onRedraw = setStylesOnRedraw;
rtDisp.organizedDisplay.overlayby=sp.organizeddisplay.OVERLAY_INDIVIDUAL;
rtDisp.organizedDisplay.draw();
rtDisp.animationScaler.minRedrawMillis =
  sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);
rtDisp.animationScaler.animate();
const seisConfig = rtDisp.organizedDisplay.seismographConfig;

//const lts = seisConfig.linkedTimeScale;
seisConfig.linkedAmplitudeScale = new sp.scale.IndividualAmplitudeScale();
seisConfig.xGridLines=true;
// uncomment below to hide the xaxis
//seisConfig.isXAxis = false;
seisConfig.margin = {top:5, right: 10, bottom:5, left:85};
seisConfig.maxHeight = 100;
seisConfig.xLabel = null;
seisConfig.isXAxis = false;
seisConfig.yLabel = "Amplitude";
seisConfig.ySublabelIsUnits = false;
seisConfig.lineColors = [
    "#1c4b82",
    "#00879e",
    "royalblue",
    "mediumturquoise",
    "chartreuse",
    "peru",
    "skyblue",
    "olivedrab",
    "goldenrod",
    "firebrick",
    "darkcyan",
    "chocolate",
    "darkmagenta",
    "mediumseagreen",
    "rebeccapurple",
    "sienna",
    "orchid",];

const bottomSeisConfig = seisConfig.clone();
bottomSeisConfig.margin.bottom=18;
bottomSeisConfig.isXAxis = true;

rtDisp.organizedDisplay.bottomSeismographConfig = bottomSeisConfig;

// display now time
const n_span = document.getElementById("nt");
let setStyleFlag = true;

setInterval(() => {
  // update the current time
  n_span.textContent = sp.luxon.DateTime.utc().toISO();
}, 1000);

let slErrorHandler = function(error) {
  addToDebug(" seed link error ", error);
  console.log("in my error handler. seed link error ", error);
}

let slCloseHandler = function(evt) {
  addToDebug(" seed link connection closed ", evt);
  console.log(' seed link connection closed ', evt);
}

let slConnect = function() {
  console.log(" in slconnect");
  document.querySelector("button#disconnect").textContent = "Disconnect";
  if (!seedlink) {
    seedlink = new sp.seedlink.SeedlinkConnection(
      settings.SEEDLINK_URL,
      selConfigs,
      (packet) => {
        rtDisp.packetHandler(packet);
        updateNumPackets();
      },
      slErrorHandler,
      slCloseHandler
    );
  }
  if (seedlink) {
    const start = sp.luxon.DateTime.utc().minus(duration);
    seedlink.setTimeCommand(start)
    seedlink.connect();
  }
}

let slDisconnect = function() {
  console.log("in in slDisconnect");
  document.querySelector("button#disconnect").textContent = "Reconnect";
  if (seedlink) {
    seedlink.close();
  }
}
let toggleConnect = function () {
  console.log("In toggleConnect");
  stopped = !stopped;
  const btnConnect = document.querySelector("button#disconnect");

  if (stopped) {
    slDisconnect();
  } else {
    slConnect();
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

document.addEventListener("visibilitychange", () => {
  console.log("end of script document.hidden", sp.luxon.DateTime.utc().toISO() , document.hidden);
  if (document.hidden) {
    console.log("paused");
    document.querySelector("button#pause").textContent = "Play";
    rtDisp.animationScaler.pause();
    slDisconnect();
  }
  else {
    console.log("resumed");
    document.querySelector("button#pause").textContent = "Pause";
    rtDisp.animationScaler.animate();    
    slConnect();
  }
  // Modify behavior…
});
// go
toggleConnect();
getEvent();

