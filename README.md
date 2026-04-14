# event-seis-display
## Visualize how a network detects earthquakes in real time

Display realtime seismic waveforms, stations and events on map, picks (phase arrivals) for events on the waveforms

![SCSN Live](./docs/scsn_live.png)


## Prerequisites
- SeedLink server with websocket proxy set up  
 [Instructions to proxy seedlink and datalink over websockets using apache2](https://github.com/crotwell/seisplotjs/wiki/Proxy-seedlink-and-datalink-over-websockets-using-apache2)
- FDSN Station Web Service
- FDSN Event Web Service (with arrivals)
- Event JSON ( built from PDL or another source)

## Installation
- Clone the repo.
- Look at constants.js to edit all network specific information like the server urls, channel lists, geojson files etc. 
- feeds/scsn_events.json is provided as an example for the file format expected by event_map_table.js. It is not meant to be a static file and should be continously updated but not updated in the repo.
