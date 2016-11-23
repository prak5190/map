/*
 * Rest Services for Depot
 * public/js/services/
 * DepotService.js
 */

var ETS = {
  'used': "ps:tools:blipp:ibp_server:resource:usage:used",
  'free': "ps:tools:blipp:ibp_server:resource:usage:free",
  'user': "ps:tools:blipp:linux:cpu:utilization:user",
  'sys' : "ps:tools:blipp:linux:cpu:utilization:system",
  'in'  : "ps:tools:blipp:linux:network:utilization:bytes:in",
  'out' : "ps:tools:blipp:linux:network:utilization:bytes:out"
};

var MY_ETS = [ETS.used, ETS.free, ETS.in, ETS.out];

var format_GB = function(){
  return function(d){
    return (d/1e9).toFixed(2); // GB
  }
}
var format_rate = function(){
  return function(d){
    return (d/1).toFixed(3);
  }
}
var format_percent = function() {
  return function(d) {return (d*100).toFixed(2)}
}
var format_timestamp = function(){
  return function(d){
    var ts = d/1e3;
    return d3.time.format('%X')(new Date(ts));
  }
}

var ETS_CHART_CONFIG = {}
ETS_CHART_CONFIG['used'] = {selector: "#CHART-Time-GB",
			      xformat: format_timestamp, yformat: format_GB};
ETS_CHART_CONFIG['free'] = {selector: "#CHART-Time-GB",
			      xformat: format_timestamp, yformat: format_GB};
ETS_CHART_CONFIG['user'] = {selector: "#CHART-Time-Percent",
			      xformat: format_timestamp, yformat: format_percent};
ETS_CHART_CONFIG['system']  = {selector: "#CHART-Time-Percent",
			      xformat: format_timestamp, yformat: format_percent};
ETS_CHART_CONFIG['in']   = {selector: "#CHART-Time-Rate",
			      xformat: format_timestamp, yformat: format_rate};
ETS_CHART_CONFIG['out']  = {selector: "#CHART-Time-Rate",
			      xformat: format_timestamp, yformat: format_rate};
ETS_CHART_CONFIG[ETS.used] = {selector: "#CHART-Time-GB",
			      xformat: format_timestamp, yformat: format_GB};
ETS_CHART_CONFIG[ETS.free] = {selector: "#CHART-Time-GB",
			      xformat: format_timestamp, yformat: format_GB};
ETS_CHART_CONFIG[ETS.user] = {selector: "#CHART-Time-Percent",
			      xformat: format_timestamp, yformat: format_percent};
ETS_CHART_CONFIG[ETS.sys]  = {selector: "#CHART-Time-Percent",
			      xformat: format_timestamp, yformat: format_percent};
ETS_CHART_CONFIG[ETS.in]   = {selector: "#CHART-Time-Rate",
			      xformat: format_timestamp, yformat: format_rate};
ETS_CHART_CONFIG[ETS.out]  = {selector: "#CHART-Time-Rate",
			      xformat: format_timestamp, yformat: format_rate};

function getETSChartConfig(key){  
  var arr = key.split(":");
  return ETS_CHART_CONFIG[arr[arr.length-1]];
};

function depotService($http, UnisService, CommChannel) {
  var service = {};
  // depots is a map of service IDs
  service.depots = {};

  function getValues(depot) {
    var mds = depot.metadata;
    // get values for each metadata
    mds.forEach(function(md) {
      if (MY_ETS.indexOf(md.eventType) >= 0) {
        var isRate = false;
	var onData = function(data) {
	  // in case we do ask for the most recent value right away again...
          var depotData = [];
          var oldDepotDt = [];
          if($.isArray(data)) {
            // data from the subscription
            depotData = data.pop();
            oldDepotDt = data[data.length-1];
          } else {
            // this gets the last element, which is the most recent in a published message
            depotData = data[md.id].pop();
            oldDepotDt = data[md.id][data[md.id].length-1];
          }
          var y = Number(depotData.value) || 0;
          if (isRate) {
            var x = Number(depotData.ts) || 0;
            var oldx = Number(oldDepotDt.ts) || 0;
            var oldy = Number(oldDepotDt.value) || 0;            
            var timeD = x/1e6 - oldx/1e6;
            // Now use this old value to calculate rate
            var yVal;
            if (Math.round(timeD) == 0)
              yVal = y;
            else 
              yVal = ((y - oldy) / timeD).toFixed(2);
            depot[md.eventType] =  yVal;
          } else {
            depot[md.eventType] = y;
          }
	};
	UnisService.subDataId(md.id, onData, "depot_"+md.id);
      }
    });
  };

  function updateDepots(md,services) {
    if (MY_ETS.indexOf(md.eventType) >= 0) {
      services.forEach(function(s) {
	for (var key in service.depots) {
	  var d = service.depots[key];
	  if (d.service.id == s) {
	    // don't duplicate
	    var found = 0;
	    for (var i=0; i<d.metadata.length; i++) {
	      if (d.metadata[i].eventType === md.eventType) {
		found = 1;
	      }
	    }
	    if (!found) {
	      d.metadata.push(md);
	      getValues(d);
	    }
	  }
	}
      });
    }
  };

  // function createDepot(s) {
  //   var mds = getMetadata(s);
  //   var depot = {
  //     'metadata': mds,
  //     'service': s
  //   };
  //   getValues(depot);
  //   service.depots[s.id] = depot;
  //   // save a reference to the depot object in the service entry
  //   s.depot = depot;
  // };
  function make_depot(d) {
    var mds = d.metadata;
    var s = d.service;
    getValues(d);
    UnisService.services.push(s);
    service.depots[s.id] = d;
    // save a reference to the depot object in the service entry
    s.depot = d;
  }
  // depot tracking service waits until UNIS has data
  UnisService.init().then(function() {
    console.log("Depot service initializing...");
    UnisService.depots.forEach(function(d) {
      make_depot(d);
    });
    // UnisService.services.forEach(function(s) {
    //   if (s.serviceType == "ibp_server") {
    // 	createDepot(s);
    //   }
    // });
  });

  CommChannel.onNewData('new_service', function(s) {
    make_depot(s);
  });

  CommChannel.onNewData('new_metadata', function(data) {
    // update depot eT mappings when we see new metadata
    updateDepots(data.md,data.services);
  });

  CommChannel.onNewData('new_port', function(md) {
    // update depot service intitution names (gleaned from nodeRef URNs)
    for (var key in service.depots) {
      var d = service.depots[key];
      getInstitutionName(d.service);
    }
  });

  return service;
}
