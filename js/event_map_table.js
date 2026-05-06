import * as sp from "../lib/seisplotjs_standalone.mjs";
import {updateQuakesAndPicks} from "./waveform.js";
import {logDebug, logInfo, logWarn, logError, drawLegend} from "./utils.js";
import {settings} from "./constants.js";
import {EventStaMap} from "./event_sta_map.js";
sp.cssutil.insertCSS(sp.leafletutil.leaflet_css, "spjs_leaflet");

const mapConfig = {
    "map": {
        "viewLat": 35.2, 
        "viewLon": -118,
        "zoom": 7,
        "centerLon": 0,
        "magScaleFactor": 2
    },
    "worldmap": {
        "viewLat": 20, 
        "viewLon": -118,
        "zoom": 1,
        "centerLon": 0,
        "magScaleFactor": 2
    }
  };
const errorSel = "section.left-sidebar error-text";

const quakesForRT = new Map();
const mymapelem = document.querySelector("div#id_regionalmap");
const myworldmapelem = document.querySelector("div#id_worldmap");

const mymap = new EventStaMap(mymapelem, mapConfig.map, "");
const myworldmap = new EventStaMap(myworldmapelem, mapConfig.worldmap, "");

//define keys that can be used to access the map object when called from another file
export const REGIONAL_MAP = 'regional_map';
export const WORLD_MAP = 'world_map';
export function getMap(maptype) {
  if (maptype == REGIONAL_MAP) {
    return mymap;
  }
  else if (maptype == WORLD_MAP) {
    return myworldmap;
  }
} 
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
const durationFetchPickDelay = sp.luxon.Duration.fromISO(settings.FETCH_PICK_DELAY);

// deep copy and sort asc for defining which set a quake should be put in.
//    sort desc for adding to map layer.
const quakeLevelSortedAsc = JSON.parse(JSON.stringify(settings.QUAKE_AGE_LEVELS));
quakeLevelSortedAsc.sort((a,b) => sp.luxon.Duration.fromISO(a.duration) - sp.luxon.Duration.fromISO(b.duration));
const quakeLevelSortedDesc = quakeLevelSortedAsc.toReversed();

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
  // ensure the json file contains data > regional_7days & global_7days_mag5_5 and events under both
  if ('data' in jsonData ) {
    if ('regional_7days' in jsonData.data && 'global_7days_mag5_5' in jsonData.data) {
      if (jsonData.data.regional_7days.events !== undefined && 
        jsonData.data.global_7days_mag5_5.events !== undefined) {
        return true;
      }
    }
  }
  return false;
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
      const quakesRegional = parseEventJson(quakejson.data.regional_7days.events);
      const quakesGlobal = parseEventJson(quakejson.data.global_7days_mag5_5.events);

      evtStatusElem.textContent = `Last updated: ${quakejson.lastupdated}`;
      return {'quakesRegional': quakesRegional,
        'quakesGlobal': quakesGlobal};
    } else {
      throw new TypeError(`Invalid data!`);
    }
  }
  catch (e) {
    pauseEventRefresh();
    logError(errorSel, `Unable to get quakes from ${url}.`, e);
    return [];
  }
}

function quakes2map(quakeList, evtMap) {
  let now = sp.luxon.DateTime.utc();
  let quakes1hour = [];
  let quakes1day = [];
  let quakes1week = [];
  let quakesByAge = new Map();
  for (let quakeLevel of quakeLevelSortedAsc) {
    quakesByAge.set(quakeLevel.name, []);
  }

  for (let quake of quakeList) {
    let howOld = now - quake.time;
    // 3 disjoint sets for maps. quakes in last hour, last day, last week. 
    // newest first
    for (let quakeLevel of quakeLevelSortedAsc) {
      if (howOld <= sp.luxon.Duration.fromISO(quakeLevel.duration)) {
        quakesByAge.get(quakeLevel.name).push(quake);
        break;
      }
    }
  }
  // all quakes could be added in one go like this
  // evtMap.addQuake(quakes); but that has not been done
  // because quakemarkers need to be colored differently based
  // on how recent they are.

  evtMap.quakeList=[]; //clear previously loaded quakes (if any)

  // quake age sorted by oldest first to add to the map
  for (let quakeLevel of quakeLevelSortedDesc) {
    let quakes = quakesByAge.get(quakeLevel.name);
    evtMap.addQuakes(quakes, quakeLevel.name);
  }
  evtMap.drawQuakeLayer();
}

async function quakes2table (quakeList, quaketblid) {
  let elem = document.querySelector("sp-quake-table#" + quaketblid);
  elem.quakeList = quakeList;
  elem.columnLabels = columnLabels;
  elem.columnValues = columnValues;
}
async function buildEventMapAndTable() {
  let quakes = await loadQuakeJson(settings.QUAKE_JSON);
  if (quakes.length == 0) {
    return;
  }
  quakes2map(quakes.quakesRegional, mymap);
  quakes2map(quakes.quakesGlobal, myworldmap);

  //Filtering for tables: 1. local quakes in last 6h,
  //    2. local quakes in last 7 days with mag >=3
  let now = sp.luxon.DateTime.utc();
  let quakes6hLocal = [];
  let quakes7dLocalM3 = [];
  for (let quake of quakes.quakesRegional) {
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
      getEventPicks(id);
    }
  }
  quakes2table(quakes6hLocal, "quake6h_ca")
  quakes2table(quakes7dLocalM3, "quake7d_ca_mag3")
  quakes2table(quakes.quakesGlobal, "quake7d_mag5_5");
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

async function addGeoJsonLayer2map(layerLabel, geojsonurl, layerName, layerstyle) {
  try {
    logDebug("Fetching geojsonlayer: ", geojsonurl);
    let response = await fetch(geojsonurl);
    if (!response.ok) {
      throw new Error(response.status);
    }
    let layerJson = await response.json();
    let sfunc = function(f) { return layerstyle};
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
let refreshList = [];
/*
eventId should not contain the "ci" prefix
*/
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
  let numPicks = 0;
  //Based on how soon the eventws is queried after the event we receive either RT or PP picks.
  //While it great to get something from RT, the display should be updated with the picks from PP. 
  //Instead of polling repeatedly to see if PP has updated the origin, query the eventws after 
  //durationFetchPickDelay time has passed since origin time. Do this once. 
  //Maintain a list of eventid that have been refetched so as to not refetch again.

  let fetch = false;
  let refetch = false;
  // first time fetching. Just get it
  if (!quakesForRT.has(eventId)) {
    fetch = true;
  }
  else {
    let q = quakesForRT.get(eventId);
     if (!refreshList.includes(eventId) && ((sp.luxon.DateTime.utc() - q.time) >= durationFetchPickDelay)) {
      // refetch only if durationFetchPickDelay time has passed since origin and 
      // it has not been refreshed. This does mean events older than durationFetchPickDelay will 
      // also get refreshed once, but we can live with it.
      // This is because the q object does not contain the xml creation time
      // found at eventParameters > creationInfo > creationTime. It has the time under "event" which 
      // is server update time. Not useful for us. 
      refetch = true;
    }
  }
  if (fetch || refetch) {
    let eventQuery = new sp.fdsnevent.EventQuery(settings.EVENT_WS);
    eventQuery.eventId(eventId);
    eventQuery.includeArrivals(true);
    eventQuery.formURL();
    let allPickNetStas = new Set();
    let quakeList = await eventQuery.query();
    for (let quake of quakeList) {
      let id = quake.eventId.replace(localRegion, '');
      if (!(quakesForRT.has(id))) {
        quakesForRT.set(id, quake);
      }
      if (refetch) {
        refreshList.push(id);
      }
      // get stations that have a pick - this is only for logging
      if (quake.pickList) {
        for (let pick of quake.pickList){
          allPickNetStas.add(pick.networkCode + '.' + pick.stationCode);
        }
        numPicks = quake.pickList.length;
      }
    }
    clearQuakesForRT();
    updateQuakesAndPicks(quakesForRT);
    logInfo(`Eventid ${eventId}. Total Picks: ${numPicks} at ${sp.luxon.DateTime.utc()}. `, allPickNetStas);
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
  let layerstyle = {
      color: layer.color,
      weight: layer.weight,
      fillOpacity: 0,
  }
  await addGeoJsonLayer2map(layer.label, layer.url, layer.name, layerstyle);
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

