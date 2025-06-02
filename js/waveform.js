import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";
import {settings} from "./constants.js";
import {logDebug, logInfo, logWarn, logError} from "./utils.js";

let sharedData = {"duration": null, 
  "networks": [],
  "slConfigs": [],
  "seedlink": null,
  "paused": false,
  "stopped": true,
  "streams": new Set()
};
let rtDisp = null;
let numPackets = 0;
let lastPacketReceived = null;

// display now time
const n_span = document.getElementById("nt");
setInterval(() => {
  // update the current time
  n_span.textContent = sp.luxon.DateTime.utc().toISO();
}, 1000);

const mymap = document.querySelector("sp-station-quake-map");
const realtimeDiv = document.getElementById("realtime");
const durationElem = document.getElementById("id_sel_duration");
const streamSelector = document.querySelector("stream-multi-selector");
const statusElem = document.querySelector("span#id_status_message");

durationElem.value=settings.DEFAULT_RT_DURATION;
durationElem.addEventListener("change", function (evt) {
    let newDuration=sp.luxon.Duration.fromISO(evt.target.value);
    updateDuration(newDuration);
  });

function updateNumPackets() {
  numPackets++;
  document.querySelector("#numPackets").textContent = numPackets;
}
/*
const resChannels = await fetch('../conf/channellist.json');
const jsonData = await resChannels.json();
const defaultPreset = jsonData["defaultPreset"];
const presetChanLists = jsonData["presetChanLists"];
*/

sharedData.duration = sp.luxon.Duration.fromISO(settings.DEFAULT_RT_DURATION);
await getAvailStreams(settings.PRESET_CHAN_LISTS, settings.DEFAULT_CHAN_LIST);
//this needs to be a copy and not a reference to the same object. 
sharedData.streams = new Set(streamSelector.getSelectedStreams());
buildMapAndWaveforms(sharedData);

async function getAvailStreams(presetChanLists, defaultPreset) {
  logDebug(">>>> In getAvailStreams");
  
  const rs = new sp.ringserverweb.RingserverConnection(settings.RS_URL);
  for (const pcl of presetChanLists) {
    streamSelector.addPresetStreamSet(pcl["name"], pcl["channels"]);
  }
  streamSelector.selectPreset(defaultPreset);
  
  rs.pullStreams('CI..*').then((o) => {
    streamSelector.setStreamStats(o.streams);
  });
  
  streamSelector.setDoneAction(updateStreams);
  logDebug("<<<< Out getAvailStreams");
}

async function getFDSNNetworkList (streams, duration) {
  if (streams.size == 0) {
    return [];
  }
  let netCodes = new Set();
  let staCodes = new Set();
  let locCodes = new Set();
  let chanCodes = new Set();

  streams.forEach((stream) => {
    let nslcObj = sp.fdsnsourceid.NslcId.parse(stream, '_');
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
    .locationCode(locStr)
    .startTime(sp.luxon.DateTime.utc()-duration);
  fdsnStaQuery.formURL(sp.fdsnstation.LEVEL_CHANNEL);
  let networkList = [];
  networkList = await fdsnStaQuery.queryChannels();
  return networkList;
}

function buildSeedlinkConfig(streams) {
  let slConfigs = [];
  streams.forEach((stream) => {
    let nslcObj = sp.fdsnsourceid.NslcId.parse(stream, '_');
    slConfigs.push("STATION " + nslcObj.stationCode + " " + nslcObj.networkCode);
    slConfigs.push("SELECT " + nslcObj.locationCode + nslcObj.channelCode + ".D");
  })
  return slConfigs;
}

async function addStations2Map (mapElem, networkList) {
  let allStations = Array.from(sp.stationxml.allStations(networkList));
  mapElem.stationList = [];
  mapElem.addStation(allStations);
  mapElem.drawStationLayer();
}
export function getDuration() {
  return sharedData.duration;
}
function updateDuration(newDuration) {
  if (sharedData.duration != newDuration) {
    sharedData.duration = newDuration;
    drawWaveforms(sharedData);
  }
}

function updateStreams(newStreams) {
  let newStreamSet = new Set(newStreams);
  // Check if they are the same
  if (newStreamSet.size == sharedData.streams.size && sharedData.streams.isSupersetOf(newStreamSet)) {
    // No change. Return 
    return;
  }
  sharedData.streams = newStreamSet; // copy the array, dont copy the reference
  buildMapAndWaveforms (sharedData);
}

export function updateQuakesAndPicks(quakesAndPicks) {
  sharedData.quakesAndPicks = quakesAndPicks;
  addPicksToWaveform();
}

async function buildMapAndWaveforms (sharedData) {
  logDebug(">>>> In buildMapAndWaveforms");
  sharedData.networks = await getFDSNNetworkList(sharedData.streams, sharedData.duration);
  sharedData.slConfigs = buildSeedlinkConfig(sharedData.streams);
  addStations2Map(mymap, sharedData.networks);
  drawWaveforms(sharedData);
  logDebug("<<<< Out buildMapAndWaveforms");
}


function addPicksToWaveform() {
  logDebug(">>> in addPicksToWaveform");

  let sdds;
  if (!(rtDisp && sharedData.quakesAndPicks && sharedData.quakesAndPicks.size > 0)) {
    return;
  }
  sdds = rtDisp.organizedDisplay.seisData;
  let quakeList = [];
  
  for (const quake of sharedData.quakesAndPicks.values()) {
    // todo check what order are the quakes in . should it be most recent first, or most recent last? 
    // this might affect any sorting done using distance from quake. it seems to use quakelist[0] as the 
    // point of reference.
    quakeList.push(quake);
  }
  for (const sdd of sdds) {
    sdd.quakeList = quakeList;
    // addQuake does not clear prev entries, nor avoid dups.
    // sdd.addQuake(quakeList);
    let netsta = sdd.networkCode +'.' + sdd.stationCode;
    let markers = [];
    for (const quake of quakeList) {
      for (const pick of quake.pickList) {
        const pickNetSta = pick.networkCode + '.' + pick.stationCode;
        if (pickNetSta == netsta){
          let name = pick.phaseHint == 'P'? pick.phaseHint: ' '+pick.phaseHint;
          markers.push({
            markertype: pick.phaseHint + "pick",
            name: pick.phaseHint,
            time: pick.time,
            description: "Event id: " + quake.eventId
          });
        }
      }
    }
    sdd.clearMarkers();
    sdd.addMarkers(markers);
  }
  logDebug("<<< Out addPicksToWaveform. ");
}
const seismographCss = `.marker.Ppick polygon{ fill: rgba(106, 90, 205, 0.4); }
  .marker.Spick polygon{ fill: rgba(255, 165, 100, 0.4); }
  svg.seismograph g.title text tspan.titleText{stroke: none; fill: #003B4C; color: #003B4C; }`;

const orgDispItemCss = `sp-seismograph{
          border:1px solid #eeeeee;
          margin:1px 2px 1px 2px;
          background-color:#fff }`;

function updRTDisplay(orgDisp) {
  logDebug('>>> in updRTDisplay');
  // Set styles , should be done everytime it is redrawn in case the plot type is changed
  let orgItems = orgDisp.getDisplayItems();

  for (let oi of orgItems) {
    oi.onRedraw = () => {
      if (oi.plottype === sp.organizeddisplay.SEISMOGRAPH) {
        oi.addStyle(orgDispItemCss, "pqrsOrgDispItemStyle");
        oi.getContainedPlotElements().forEach((pe) => {
          pe.addStyle(seismographCss, "pqrsSeismographStyle");
        });
      }
    }
  }
  // Add picks to the waveform
  addPicksToWaveform();
  logDebug('<<< out updRTDisplay');
}
function clearWaveforms() {
  logDebug(">>> clearWaveforms ");
  if (sharedData.seedlink || !sharedData.stopped) {
    slDisconnect();
    if (rtDisp.organizedDisplay){
      realtimeDiv.removeChild(rtDisp.organizedDisplay);
    }
    sharedData.seedlink = null;
    lastPacketReceived = null;
  }
}
function drawWaveforms(data) {
  logDebug(">>> in drawWaveforms");
  sharedData = data;
  clearWaveforms();

  if (sharedData.networks.length==0){
    return;
  }
  const rtConfig = {
    duration: sharedData.duration,
    networkList: sharedData.networks,
  };
  rtDisp = sp.animatedseismograph.createRealtimeDisplay(rtConfig);
  rtDisp.organizedDisplay.tools = false;
  rtDisp.organizedDisplay.onRedraw = updRTDisplay;
  rtDisp.organizedDisplay.overlayby=sp.organizeddisplay.OVERLAY_INDIVIDUAL;

  rtDisp.organizedDisplay.addSortingFunction("north_to_south",
    (sdd) => {
      return sdd.hasChannel() ? 90-sdd.channel.latitude : 90;
    }
  );
  rtDisp.organizedDisplay.sortby = "north_to_south";

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
  seisConfig.yLabel = "Amplitude ({{#each seisDataList}}{{ this.channel.instrumentSensitivity.inputUnits }}{{/each}})";
  seisConfig.ySublabelIsUnits = false;
  seisConfig.yAxisNumTickHint = 4;
  seisConfig.allowZoom = false;
  // #003B4C: caltech deep blue
  // #00A1DF: caltech bright blue
  // #1c4b82: color used in poster
  // #87CEEB : skyblue - default color in seisplotjs
  seisConfig.lineColors = [
      "#00A1DF",
      "#87CEEB",
      "#1c4b82",
      "#003B4C",
      "#00879e",
      "royalblue",
      ];
  seisConfig.markerFlagpoleBase = 'bottom';
  seisConfig.title = "{{#each seisDataList}}<tspan class='titleText'>{{ this.channel.nslc }} ({{ this.channel.latitude }}, {{ this.channel.longitude }})</tspan>{{else}}No Data{{/each}}";
  const bottomSeisConfig = seisConfig.clone();
  bottomSeisConfig.margin.bottom=18;
  bottomSeisConfig.isXAxis = true;


  rtDisp.organizedDisplay.bottomSeismographConfig = bottomSeisConfig;
  realtimeDiv.appendChild(rtDisp.organizedDisplay);
  slConnect();
  logDebug("<<<< out of drawWaveforms");
}

function slErrorHandler(error) {
  logWarn("in my error handler. seed link error ", error);
}

function slCloseHandler(evt) {
  logDebug('Seed link connection closed ', evt);
}

function slConnect() {
  logDebug(">>>> in slConnect");
  if (!sharedData.seedlink) {
    sharedData.seedlink = new sp.seedlink.SeedlinkConnection(
      settings.SEEDLINK_URL,
      sharedData.slConfigs,
      (packet) => {
        lastPacketReceived = packet;
        rtDisp.packetHandler(packet);
        updateNumPackets();
      },
      slErrorHandler,
      slCloseHandler
    );
  }
  if (sharedData.seedlink) {
    let now = sp.luxon.DateTime.utc();
    let start = now.minus(sharedData.duration);
    if (lastPacketReceived && lastPacketReceived.miniseed.header.endTime > start) {
      start = lastPacketReceived.miniseed.header.endTime;
    }
    sharedData.seedlink.setTimeCommand(start)
    sharedData.seedlink.connect();
    sharedData.stopped = false;
    statusElem.textContent='';
    logInfo(`Connected to Seedlink at ${now}.`);
  }
  logDebug("<<<< out slConnect");
}

function slDisconnect() {
  logDebug(">>> in slDisconnect");
  let now = sp.luxon.DateTime.utc();
  if (sharedData.seedlink) {
    sharedData.seedlink.close();
    sharedData.seedlink = null;
    logInfo(`Disconnected from Seedlink at ${now}. Last packet end time: ${lastPacketReceived.miniseed.header.endTime}`);
  }
  sharedData.stopped=true;
  statusElem.textContent=`Disconnected at ${now}`;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    slDisconnect();
    if (rtDisp) {rtDisp.animationScaler.pause();}
  }
  else {
    slConnect();
    rtDisp.animationScaler.animate();
  }
});