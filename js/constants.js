export const settings = Object.freeze({
  "RS_URL": "https://export2.gps.caltech.edu/ringserver",
  "SEEDLINK_URL": "wss://export2.gps.caltech.edu/ringserver/seedlink",
  "FDSN_WS": "service.scedc.caltech.edu",
  "EVENT_WS": "service.scedc.caltech.edu",
  "DEFAULT_RT_DURATION": "PT90M",
  "MAX_RT_DURATION": "PT120M",
  "CLEAR_DURATION": "PT5M",
  "REFRESH_RATE": "60000",
  "QUAKE_JSON": "feeds/scsn_events.json",
  "QUAKE_AGE_LEVELS": [{"label": "Last Hour", "name": "quake-last-hour", "duration": "PT1H", "color": "#ff0000"},
                {"label": "Last Day", "name": "quake-last-day", "duration": "P1D", "color": "#0000ff"},
                {"label": "Last Week", "name": "quake-last-week", "duration": "P1W", "color": "#ffff00"}],
  "QUAKE_MAG_LEVELS": [1, 3, 5, 7, 9],
  "GEOJSON_LAYERS": [{"label": "SCSN Polygon", "url": "map_layers/SCboundary.json", 
      "name": "scsn-polygon", "color": "#FF6C0C", "weight": 2},
      {"label": "CA Faults", "url": "map_layers/ca_faults.json", 
      "name": "scsn-ca-faults", "color": "#9e9e9e", "weight": 1},
      {"label": "RidgeCrest DAS Array", "url": "map_layers/Ridgecrest_waterfall_array_1.geojson", 
      "name": "scsn-ridgecrest-das", "color": "#7A303F", "weight": 2},],
  "PRESET_CHAN_LISTS": [
      {"name": "Hallway",
       "channels": ["CI_MLAC__BHZ", "CI_WRC2__BHZ", "CI_SHO__BHZ", "CI_ISA__BHZ", "CI_CAR__BHZ", "CI_AVM__BHZ",
            "CI_IRM__BHZ","CI_DJJ__BHZ", "CI_BEL__BHZ","CI_RVR__BHZ", "CI_PALA__BHZ", "CI_SLH__BHZ", 
            "CI_GOR__BHZ", "CI_GLA__BHZ", "CI_WMD__BHZ", "CI_BAR__BHZ", "CI_IKP__BHZ"]},
   ],
  "DEFAULT_CHAN_LIST": "Hallway"
});
/* use these settings in both the files*/