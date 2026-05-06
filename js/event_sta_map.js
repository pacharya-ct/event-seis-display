import * as sp from "../lib/seisplotjs_standalone.mjs";

/*
 * Create a map object with functions to addStation, addQuake, set home location, and draw layers
 */

export class EventStaMap {
    mapElem = "";
    map = "";
    centerLon = 0;
    magScale = 2;
    zoom = 7;
    quakeList = [];
    quakeClassMap = new Map();
    stationMap = new Map();
    stationClassMap = new Map();
    geojsonlayers = new Map();
    geojsonlayerstyles = new Map();

    constructor(mapElem, mapConfig, geojsonList) {
        this.mapElem = mapElem;
        this.magScale = mapConfig.magScaleFactor;
        this.centerLon = mapConfig.centerLon;
        this.viewLat = mapConfig.viewLat;
        this.viewLon = mapConfig.viewLon;
        this.zoom = mapConfig.zoom;

        this.map = L.map(this.mapElem).setView([this.viewLat, this.viewLon], this.zoom);

        L.tileLayer("https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles © Esri — Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), ©OpenStreetMap contributors, and the GIS User Community"
        }).addTo(this.map);

        this.geojsonList = geojsonList;
        this.quakeLayer = L.layerGroup();
        this.stationLayer = L.layerGroup();
        this.layerCtrl = L.control.layers();
        this.layerCtrl.addOverlay(this.quakeLayer, 'Quakes');
        this.layerCtrl.addOverlay(this.stationLayer, 'Stations');
        this.layerCtrl.addTo(this.map);
    }
    addQuakes(quakes, cssClass) {
      for (let quake of quakes){
        this.quakeList.push(quake);
        // save the style for each quake
        const clsList = this.quakeClassMap.get(quake.eventId);
        if (clsList) {
          clsList.push(cssClass);
        }
        else {
          this.quakeClassMap.set(quake.eventId, [cssClass]);
        }
      }
    }
    clearQuakes() {
      this.quakeList = [];      
    }
    addStations(stations, cssClass) {
      for (let station of stations){
        let id = station.codes();
        this.stationMap.set(id, station);
        this.stationClassMap.set(id, cssClass);
      }
    }
    clearStations() {
      this.stationMap.clear();
      this.stationClassMap.clear();
    }
    addGeoJsonLayer(layername, layerdata, sfunc) {
      this.geojsonlayers.set(layername, layerdata);
      this.geojsonlayerstyles.set(layername, sfunc);
    }
    drawQuakeLayer(){
      this.quakeLayer.clearLayers();
      for (let q of this.quakeList) {
        let cls = this.quakeClassMap.get(q.eventId);
        let qm = createQuakeMarker(q, this.magScale, cls, this.centerLon);
        qm.addTo(this.quakeLayer);
        qm.addEventListener("click", (evt) => {
            const ce = sp.quakeml.createQuakeClickEvent(q, evt.originalEvent);
            this.mapElem.dispatchEvent(ce);
        });
      }
      if (this.map){
        this.quakeLayer.addTo(this.map);
      }
    }
    drawStationLayer(){
      this.stationLayer.clearLayers();
      const ttOpts = {permanent:true, direction:'bottom', className: 'stationTooltip'};
      const isize = 14;

      for (const [stationcode, station] of this.stationMap) {
        let clsName = this.stationClassMap.get(stationcode);
        const icon = L.divIcon({
          html: sp.leafletutil.createStationSVG(isize, "TRIANGLE"),
          iconSize: [isize, isize],
          iconAnchor: [isize/2,isize/2],
          className: clsName,
        });

        const sLon =
          station.longitude - this.centerLon <= 180
            ? station.longitude
            : station.longitude - 360;
        const m = L.marker([station.latitude, sLon], {icon: icon,});
        m.bindTooltip(stationcode, ttOpts);
        m.addTo(this.stationLayer);
      }
      if (this.map){
        this.stationLayer.addTo(this.map);
      }
    }
    drawGeoJsonLayers() {
      //Add layers to the map
      for (const [layername, layerdata] of this.geojsonlayers) {
        let layerstyle = this.geojsonlayerstyles.get(layername);
        L.geoJSON(layerdata, {style: layerstyle}).addTo(this.map);
      }
    }
}

function createQuakeMarker(quake, magScaleFactor, classList, centerLon) {
  const allClassList = classList ? classList.slice() : [];
  const qLon =
    quake.longitude - centerLon <= 180
      ? quake.longitude
      : quake.longitude - 360;
  // in case no mag
  const magnitude = quake.magnitude ? quake.magnitude.mag : 1;
  const radius = getRadiusForMag(magnitude, magScaleFactor);
  const circle = L.circleMarker([quake.latitude, qLon], {
    color: "currentColor",
    radius: radius,
    className: allClassList.join(" "),
  });
  const magStr = quake.magnitude ? quake.magnitude.toString() : "unkn";
  circle.bindTooltip(`${quake.time.toISO()} ${magStr}`);
  return circle;
}

function getRadiusForMag(magnitude, magScaleFactor) {
  // in case no mag
  let radius = magnitude ? magnitude * magScaleFactor : 1;
  if (radius < 1) {
    radius = 1;
  }
  return radius;
}