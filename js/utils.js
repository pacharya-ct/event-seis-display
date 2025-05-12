import * as sp from "../lib/seisplotjs_3.1.5-SNAPSHOT_standalone.mjs";
import {settings} from "./constants.js";

export function logDebug(...args) {
  //console.log(...args);
}
export function logInfo(...args) {
  console.log(...args);
}
export function logWarn(...args) {
  console.warn(...args);
}

export function logError(errorSel, ...args) {
  console.log(errorSel);
  let sel = errorSel ? errorSel: "div#error"; 
  const errDiv = document.querySelector(sel);
  if (errDiv){
    const p = errDiv.appendChild(document.createElement("p"));
    p.className = "error-text";
    let msg = "";
    for (const arg of args) {
      msg += arg + " ";
    }
    p.textContent = msg;
  }
  console.error(...args);
}

export function addToDebug(message) {
  // when deploying to production, comment out the 
  // line that writes out to console.log
  const debugDiv = document.querySelector("div#debug");
  if (!debugDiv) {
    console.log(message);
  }
  else {
    const pre = debugDiv.appendChild(document.createElement("pre"));
    const code = pre.appendChild(document.createElement("code"));
    code.textContent = message;
  }
}
export function clearDebug() {
  const debugDiv = document.querySelector("div#debug");
  if (!debugDiv) {
    return;
  }
  while (debugDiv.firstChild) {
    debugDiv.removeChild(debugDiv.firstChild);
  }
}

export function addWarning(message) {
  // separate function, so this can be left ON to log to console 
  // while the addToDebug console logging can be turned off 
  const debugDiv = document.querySelector("div#warning");
  if (!debugDiv) {
    console.log(message);
  }
  else {
    const pre = debugDiv.appendChild(document.createElement("pre"));
    const code = pre.appendChild(document.createElement("code"));
    code.textContent = message;
  }
}
export function addError(message, errorsel) {
  // separate function, so this can be left ON to log to console 
  // while the addToDebug console logging can be turned off
  let sel = errorsel ? errorsel: "div#error"; 
  const debugDiv = document.querySelector(sel);
  if (!debugDiv) {
    console.log(message);
  }
  else {
    const pre = debugDiv.appendChild(document.createElement("pre"));
    const code = pre.appendChild(document.createElement("code"));
    code.textContent = message;
  }
}


export function drawLegend(mymap, legendSel) {
  // default values
  const defLegendSel = "map-legend";
  const sel = legendSel ? legendSel : defLegendSel;
  const legendElem = document.querySelector(sel);

  for (let ql of settings.QUAKE_AGE_LEVELS) {
    let svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElem.setAttribute("width", "25");
    svgElem.setAttribute("height", "18");
    let circleElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleElem.setAttribute("cx", 10);
    circleElem.setAttribute("cy", 10);
    circleElem.setAttribute("r", 6);
    circleElem.setAttribute("fill", ql.color);
    circleElem.setAttribute("stroke", "black");
    circleElem.setAttribute("stroke-width", "1");
    svgElem.appendChild(circleElem);
    legendElem.appendChild(svgElem);
    legendElem.appendChild(document.createTextNode(ql.label));
  }
  legendElem.appendChild(document.createElement('br'));
  for (let mag of settings.QUAKE_MAG_LEVELS) {
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
