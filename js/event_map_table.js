import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";
import {updateQuakesAndPicks} from "./waveform.js";
import {logDebug, logInfo, logWarn, logError, drawLegend} from "./utils.js";
import {settings} from "./constants.js";

const errorSel = "section.left-sidebar error-text";

const quakesForRT = new Map();
const mymap = document.querySelector("sp-station-quake-map#regionalmap");
const myworldmap = document.querySelector("sp-station-quake-map#worldmap");
const evtStatusElem = document.querySelector("span#id_evt_status");
const QUAKE_COL = sp.infotable.QUAKE_COLUMN;

// Use for filter regional quake data to build quake tables
const localRegion = /^ci/i;
const duration6h = sp.luxon.Duration.fromObject({"hours": 6});
const duration7d = sp.luxon.Duration.fromObject({"days": 7});

//Constants used by the RT waveform. event age has to be newer than MAX_RT_DURATION
const durationMaxRT = sp.luxon.Duration.fromISO(settings.MAX_RT_DURATION);
//how to often to check and clear expired events and picks
const durationClear = sp.luxon.Duration.fromISO(settings.CLEAR_DURATION);

// define and add styles to maps and quake tables.
let mapstyle = `div.stationMapMarker {
    color: rgb(60,19,8,0.7);
    stroke: black;
    text-shadow:unset;
  }
  .leaflet-marker-icon {
    width:10px;
    height:10px;
  }
  .leaflet-control-attribution {
    font-size:9px;
  }
  path.quakeMapMarker {
    fill-opacity: 0.6;
    stroke-width:1px;
    stroke: black;
  }
`;
for (let quakeLevel of settings.QUAKE_AGE_LEVELS) {
  mapstyle += `  path.${quakeLevel.name}{
    fill: ${quakeLevel.color};
  }
`;
}
const geoJsonStyleMap = new Map();
for (let layer of settings.GEOJSON_LAYERS) {
  let styles = {
      color: layer.color,
      weight: layer.weight,
      fillOpacity:0,
    }
  geoJsonStyleMap.set(layer.name, styles);
}

mymap.addStyle(mapstyle);
myworldmap.addStyle(mapstyle);

const quakeTableElems = document.querySelectorAll("sp-quake-table");
for (let elem of quakeTableElems) {
  elem.addStyle(`table.wrapper {table-layout:fixed; width: 100%; }
  table tr td {padding:1px 5px}
  thead th:nth-child(1) {width: 15%;}
  thead th:nth-child(2) {width: 20%;}
  thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(6) {width: 10%;}
  thead th:nth-child(7) {width: 25%;}`);
}

function isValidJson (jsonData) {
  return true;
  // TODO Needs to be filled
}

function parseEventJson(jsonData) {
  let quakeList = [];
  for (let entry of jsonData) {
    let evtId = entry.source + entry.sourceCode;
    const quake = new sp.quakeml.Quake();
    quake.publicId = `quakeml:earthquake.usgs.gov/fdsnws/event/1/query?eventid=${evtId}`;
    quake.eventId=evtId;
    let eventTime = sp.util.isoToDateTime(entry.eventTime);
    const origin = new sp.quakeml.Origin(eventTime, entry.latitude, entry.longitude);

    origin.depth = entry.depth*1000;
    quake.originList.push(origin);
    const mag = new sp.quakeml.Magnitude(entry.magnitude);
    mag.type = entry["magnitude-type"]; // dot (object) notation fails because of the hyphen in key name. hence using dict lookup
    quake.magnitudeList.push(mag);
    quake.preferredOrigin = origin;
    quake.preferredMagnitude = mag;
    quake.descriptionList.push(new sp.quakeml.EventDescription(entry.title));
    quakeList.push(quake);
  }
  return quakeList;
}

async function loadQuakeJson(url) {
  try {
    logDebug("Fetching quakes from ", url);
    let response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.status);
    }
    let quakejson = await response.json();
    if (isValidJson(quakejson)) {
      let quakes = parseEventJson(quakejson);
      evtStatusElem.textContent = `Last updated: ${sp.luxon.DateTime.utc()}`;
      return quakes;
    } else {
      throw new TypeError(`Invalid data!`);
    }
  }
  catch (e) {
    logError(errorSel, `Unable to get quakes from ${url}.`, e);
    return [];
  }
}

function quakes2map(quakeList, mapElem) {
  let now = sp.luxon.DateTime.utc();
  let quakes1hour = [];
  let quakes1day = [];
  let quakes1week = [];
  let quakesByAge = new Map();
  for (let quakeLevel of settings.QUAKE_AGE_LEVELS) {
    quakesByAge.set(quakeLevel.name, []);
  }

  for (let quake of quakeList) {
    let howOld = now - quake.time;
    // 3 disjoint sets for maps. quakes in last hour, last day, last week
    for (let quakeLevel of settings.QUAKE_AGE_LEVELS) {
      if (howOld <= sp.luxon.Duration.fromISO(quakeLevel.duration)) {
        quakesByAge.get(quakeLevel.name).push(quake);
        break;
      }
    }
  }
  // all quakes could be added in one go like this
  // mapElem.addQuake(quakes); but that has not been done
  // because quakemarkers need to be colored differently based
  // on how recent they are.
  mapElem.quakeList=[]; //clear previously loaded quakes (if any)

  for (let quakeLevel of settings.QUAKE_AGE_LEVELS) {
    let quakes = quakesByAge.get(quakeLevel.name);
    mapElem.addQuake(quakes, quakeLevel.name);
  }
  mapElem.drawQuakeLayer();
}

async function quakes2table (quakeList, quaketblid) {
  let elem = document.querySelector("sp-quake-table#" + quaketblid);
  elem.quakeList = quakeList;
  elem.columnLabels = columnLabels;
  elem.columnValues = columnValues;
}
async function buildEventMapAndTable() {
  let quakesRegional = await loadQuakeJson(settings.QUAKE_JSON_REGIONAL);
  let quakesGlobalM5_5 = await loadQuakeJson(settings.QUAKE_JSON_GLOBAL);
  quakes2map(quakesRegional, mymap);
  quakes2map(quakesGlobalM5_5, myworldmap);

  //Filtering for tables: 1. local quakes in last 6h,
  //    2. local quakes in last 7 days with mag >=3
  let now = sp.luxon.DateTime.utc();
  let quakes6hLocal = [];
  let quakes7dLocalM3 = [];
  for (let quake of quakesRegional) {
    let howOld = now - quake.time;
    if (howOld <= duration6h) {
      quakes6hLocal.push(quake);
    }
    if (howOld <= duration7d && quake.magnitude.mag >= 3.0) {
      quakes7dLocalM3.push(quake);
    }
    //Get picks for CI events in the last 2 hours
    if ((howOld <= durationMaxRT)
        && (localRegion.test(quake.eventId))){
      let id = quake.eventId.replace(localRegion, '');
      if (!quakesForRT.has(id)) {
        getEventPicks(id);
      }
    }
  }
  quakes2table(quakes6hLocal, "quake6h_ca")
  quakes2table(quakes7dLocalM3, "quake7d_ca_mag3")
  quakes2table(quakesGlobalM5_5, "quake7d_mag5_5");
  // array.filter works fine, but it is internally looping
  // over the entire array each time a filter is needed.
  // and since we have multiple filters, running the classic for loop
  // and if/elseif is more efficient.
  /*
  let quakes6hLocal = quakeList.filter(function (quake) {
    return (now - quake.time <= duration6h);
  });
  let quakes7dLocalM3 = quakeList.filter(function (quake) {
    return ((now - quake.time <= duration7d) &&
      quake.magnitude.mag >= 3.0);
  });
  */
}

async function addGeoJsonLayer2map(layerLabel, geojsonurl, layerName) {
  try {
    logDebug("Fetching geojsonlayer: ", geojsonurl);
    let response = await fetch(geojsonurl);
    if (!response.ok) {
      throw new Error(response.status);
    }
    let layerJson = await response.json();
    let styles = geoJsonStyleMap.get(layerName);
    let sfunc = function(f) { return styles};
    mymap.addGeoJsonLayer(layerLabel, layerJson, sfunc);
  }
  catch (e) {
    logWarn(`Unable to fetch ${layerLabel}.`, e);
  }
}

function clearQuakesForRT() {
  const now = sp.luxon.DateTime.utc();
  let expired = [];
  // check when was the last time quakes were cleared
  // to prevent it from running too often
  if ((now - lastcleared) >= durationClear) {
    for (const[id, quake] of quakesForRT.entries()) {
      //check if quake older than "durationMaxRT" time
      if ((now - quake.time) >= durationMaxRT) {
        expired.push(id);
      }
    }
    // Remove the expired quakes from the map
    for (let id of expired) {
      logDebug('Removing expired event ', id);
      quakesForRT.delete(id);
    }
    lastcleared = now;
  }
}
async function getEventPicks(eventId) {
  logDebug(">>>> getEventPicks with eventId:", eventId);
  if (!settings.EVENT_WS) {
    logWarn('Event Webservice is not defined. Skip fetching picks');
    return;
  }
  if (!eventId) {
    logWarn('Event ID not provided. Skip fetching picks');
    return;
  }
  //Fetch from ws only if it is not already loaded into quakesForRT
  if (!quakesForRT.has(eventId)) {
    let eventQuery = new sp.fdsnevent.EventQuery(settings.EVENT_WS);
    eventQuery.eventId(eventId);
    eventQuery.includeArrivals(true);
    eventQuery.formURL();
    let allPickNetStas = new Set();
    let quakeList = await eventQuery.query();
    for (let quake of quakeList) {
      let id = quake.eventId;
      if (!(quakesForRT.has(id))) {
        quakesForRT.set(id, quake);
      }
      // get stations that have a pick - this is only for logging
      if (quake.pickList) {
        for (let pick of quake.pickList){
          allPickNetStas.add(pick.networkCode + '.' + pick.stationCode);
        }
      }
    }
    clearQuakesForRT();
    updateQuakesAndPicks(quakesForRT);
    logInfo(`Eventid ${eventId}. Picked on channels: `, allPickNetStas);
  }
  logDebug("<<<< getEventPicks");
}

// Define the columns for the quake info tables
let customDateFormat = function (datetimeobj) {
  return datetimeobj.toISODate() + ' ' + datetimeobj.toLocaleString(sp.luxon.DateTime.TIME_24_WITH_SECONDS);
}
let columnLabels = new Map();
columnLabels.set(QUAKE_COL.EVENTID, "EventID");
columnLabels.set(QUAKE_COL.TIME, "Time (UTC)");
columnLabels.set(QUAKE_COL.LAT, "Lat");
columnLabels.set(QUAKE_COL.LON, "Lon");
columnLabels.set(QUAKE_COL.MAG, "Mag, Type");
columnLabels.set(QUAKE_COL.DEPTH, "Depth (km)");
columnLabels.set(QUAKE_COL.DESC, "Desc");

let columnValues = new Map();
columnValues.set(QUAKE_COL.EVENTID, q => q.eventId);
columnValues.set(QUAKE_COL.TIME, q => customDateFormat(q.time));
columnValues.set(QUAKE_COL.LAT, q => sp.infotable.latlonFormat.format(q.latitude));
columnValues.set(QUAKE_COL.LON, q => sp.infotable.latlonFormat.format(q.longitude));
columnValues.set(QUAKE_COL.DEPTH, q => sp.infotable.depthNoUnitFormat.format(q.depthKm));
columnValues.set(QUAKE_COL.MAG,
  q => {let magtype = q.magnitude.type ? " " + q.magnitude.type : "";
        let mag = sp.infotable.magFormat.format(q.magnitude.mag) + magtype;
        return mag; });

columnValues.set(QUAKE_COL.DESC, q => q.description);

// Add geojson layers
for (let layer of settings.GEOJSON_LAYERS) {
  await addGeoJsonLayer2map(layer.label, layer.url, layer.name);
}
mymap.drawGeoJsonLayers();
drawLegend(mymap);

let eventIntervalId;
function pauseEventRefresh() {
  clearInterval(eventIntervalId);
  eventIntervalId = null;
}
function startEventRefresh() {
  // clear any previous jobs if present
  if (eventIntervalId) {
    pauseEventRefresh();
  }
  buildEventMapAndTable();
  // Refresh the map and table every minute
  eventIntervalId = setInterval(buildEventMapAndTable, settings.REFRESH_RATE);
}
startEventRefresh();
let lastcleared = sp.luxon.DateTime.utc();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseEventRefresh();
  }
  else {
    startEventRefresh();
  }
});

