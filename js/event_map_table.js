import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";

const JSON_MIME = "application/json";
const timeoutSec = 10;
const resSettings = await fetch("../conf/settings.json")
const settings = await resSettings.json()

const mymap = document.querySelector("sp-station-quake-map#regionalmap");
const myworldmap = document.querySelector("sp-station-quake-map#worldmap");
let QUAKE_COL = sp.infotable.QUAKE_COLUMN;
console.log("packets", numPackets);
//mymap.magScale(2);
let mapstyle = `div.stationMapMarker {
    color: #1c4b82;
    width: 5px;
    height: 5px;
    opacity: 0.7;
  }
  .leaflet-marker-icon {
    width:17px;
    height:17px;
  }
  .leaflet-control-attribution {
    font-size:9px;
  }
  path.quakeMapMarker {
    fill-opacity: 0.6;
    stroke-width:1px;
    stroke: black;
  }
  path.quake-lasthour{
    fill: #ff0000;
    //stroke: yellow;
    z-index: 10;
  }  
  path.quake-lastday{
    fill: #0000ff;
    //stroke: yellow;
    z-index: 5;
  }  
  path.quake-lastweek{
    fill: #ffff00;
    //stroke: yellow;
    z-index:2;
  }  
  path.scsn-polygon {
    stroke: #ff6d1e;
    stroke-width: 2px;
    fill-opacity:0;
  }
  path.scsn-das {
    stroke: #ff0000;
    stroke-width: 2px;
    fill-opacity:0;
  }
  path.scsn-ca-faults {
    stroke: #9e9e9e;
    stroke-width: 1px;
    fill-opacity:0;
  }
`;
mymap.addStyle(mapstyle);
myworldmap.addStyle(mapstyle);

let quakeTableElems = document.querySelectorAll("sp-quake-table");
for (let elem of quakeTableElems) {
  elem.addStyle(`table {height:130px; margin:0 auto;} 
  table tr td {padding:1px 5px} `);
}

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

// returns Promise<QuakeList>
function loadEventJson(url) {
  return new Promise((resolve, reject) => {
    const fetchInit = sp.util.defaultFetchInitObj(JSON_MIME);
    sp.util.doFetchWithTimeout(url, fetchInit, timeoutSec * 1000)
      .then((response) => {
        if (response.status !== 200) {
          // no data
          return [];
        } else {
          return response.json();
        }
      })
      .then((jsonData) => {
        if (isValidJson(jsonData)) {
          let quakes = parseEventJson(jsonData);
          resolve(quakes);
        } else {
          //throw new TypeError(`Invalid data!`);
          reject('Invalid data');
        }
      })
  })
}
let quakes2map = function(url, mapElem, errorSel){
  loadEventJson(url)
    .then((quakes) => {
      // all quakes could be added in one go like this 
      // mapElem.addQuake(quakes); but that has not been done
      // because quakemarkers need to be colored differently based 
      // on how recent they are. 
      let now = sp.luxon.DateTime.utc();
      let lasthour = now.minus({hours: 1});
      let lastday = now.minus({days:1});
      let lastweek = now.minus({days:7});
      let quakes_lasthour = [];
      let quakes_lastday = [];
      let quakes_lastweek = [];
      for (let quake of quakes) {
        if (quake.time >= lasthour) {
          quakes_lasthour.push(quake);
        }
        else if (quake.time >= lastday ) {
          quakes_lastday.push(quake);
        }
        else if (quake.time >= lastweek ) {
          quakes_lastweek.push(quake);
        }
        else {
          //console.log("Event older than 7 days not displayed on map");
        }
      }
      mapElem.quakeList=[]; //clear previously loaded quakes (if any)
      mapElem.addQuake(quakes_lastweek, "quake-lastweek");  
      mapElem.addQuake(quakes_lastday, "quake-lastday");  
      mapElem.addQuake(quakes_lasthour, "quake-lasthour");  
      mapElem.drawQuakeLayer();
    })
    .catch(function (error) {
      const errTag = document.querySelector(errorSel);
      errTag.innerHTML = `
      <p>Error loading data. ${error}</p>
    `;
      console.assert(false, error);
    });
}

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
columnValues.set(QUAKE_COL.TIME, q => customDateFormat(q.time));
columnValues.set(QUAKE_COL.DEPTH, q => sp.infotable.depthNoUnitFormat.format(q.depthKm));
columnValues.set(QUAKE_COL.MAG, 
  q => {let magtype = q.magnitude.type ? " " + q.magnitude.type : "";
        let mag = sp.infotable.magFormat.format(q.magnitude.mag) + magtype;
        return mag; });

columnValues.set(QUAKE_COL.DESC, q => q.description);

let quakes2table = function (url, quaketblid) {
  let elem = document.querySelector("sp-quake-table#" + quaketblid);
  loadEventJson(url)
    .then((quakes) => {
      elem.quakeList = quakes;
      elem.columnLabels = columnLabels;
      elem.columnValues = columnValues;
    })
}
let buildEventMapAndTable = function () {
  quakes2map("feeds/regional_7days.json", mymap, "section.left-sidebar error-text")
  quakes2map("feeds/global_7days_mag5_5.json", myworldmap, "section.left-sidebar error-text")

  quakes2table("feeds/regional_6hours.json", "quake6h_ca")
  quakes2table("feeds/regional_7days_mag3.json", "quake7d_ca_mag3")
  quakes2table("feeds/global_7days_mag5_5.json", "quake7d_mag5_5")
}

let drawLegend = function () {
  let legendElem = document.querySelector('map-legend');

  let ageLegend = {"Last Hour": "#ff0000", "Last Day": "#0000ff", "Last Week": "#ffff00"};
  let magLegend = [1, 3, 5, 7, 9];
  
  for (let [key, colorval] of Object.entries(ageLegend)) {
    let svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElem.setAttribute("width", "25");
    svgElem.setAttribute("height", "18");
    let circleElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleElem.setAttribute("cx", 10);
    circleElem.setAttribute("cy", 10);
    circleElem.setAttribute("r", 6);
    circleElem.setAttribute("fill", colorval);
    circleElem.setAttribute("stroke", "black");
    circleElem.setAttribute("stroke-width", "1");
    svgElem.appendChild(circleElem);
    legendElem.appendChild(svgElem);
    legendElem.appendChild(document.createTextNode(key));
  }
  legendElem.appendChild(document.createElement('br'));
  for (let mag of magLegend) {
    let svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let radius = sp.leafletutil.getRadiusForMag(mag, mymap.magScale);
    svgElem.setAttribute("width", 10+radius*2);
    svgElem.setAttribute("height", "52");
    let circleElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleElem.setAttribute("cx", 8+radius);
    circleElem.setAttribute("cy", 26);
    circleElem.setAttribute("r", radius);
    circleElem.setAttribute("fill", "white");
    circleElem.setAttribute("stroke", "black");
    circleElem.setAttribute("stroke-width", "1");
//    circleElem.setAttribute("fill", "#ff6e1e");
    svgElem.appendChild(circleElem);
    legendElem.appendChild(svgElem);
    legendElem.appendChild(document.createTextNode("M " + mag));
  }
}

drawLegend();

async function addGeoJsonLayer2map(layername, geojsonurl, layerclass) {
  try {
    let response = await fetch(geojsonurl);
    if (!response.ok) {
      if (response.status === 404){
        console.log("Resource not found:", geojsonurl)
        return null;
      }
      console.log("Other error ", response.status);
      return null;
    }
    let layerjson = await response.json();
    mymap.addGeoJsonLayer(layername, layerjson, layerclass);
  }
  catch (e) {
    console.log("Error fetching " + layername + e);
  }
}

await addGeoJsonLayer2map("SCSN Polygon", "map_layers/SCboundary.json", "scsn-polygon");
await addGeoJsonLayer2map("CA Faults", "map_layers/ca_faults.json", "scsn-ca-faults");
await addGeoJsonLayer2map("RidgeCrest DAS Array", "map_layers/Ridgecrest_waterfall_array_1.geojson", "scsn-das");
mymap.drawGeoJsonLayers();
mymap.drawLayers();

buildEventMapAndTable();
// Refresh the map and table every minute
//let eventTimer = setInterval(buildEventMapAndTable, 60000);
