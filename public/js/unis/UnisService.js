/*
 * Unis Service
 * public/js/unis/
 * UnisService.js
 */

function unisService($q, $http, $timeout, SocketService, CommChannel) {
  var ttl_off_limit = 60; // 1 minute
  var ttl_wiggle = 5;  
  var service = {};
  var dataIdCbMap = {};
  
  service.nodes        = [];
  service.ports        = [];
  service.links        = [];
  service.measurements = [];
  service.metadata     = [];
  service.services     = [];

  getUniqueById = function(ary) {
    var curr = [];
    var ret = [];
    for(var i = 0; i < ary.length; i++) {
      if(curr.indexOf(ary[i].id) == -1) {
	curr.push(ary[i].id);
	ret.push(ary[i]);
      }
    }
    return ret;
  };

  var getUniqueByField = function(ary, f) {
    var curr = [];
    var ret = [];
    for(var i = 0; i < ary.length; i++) {
      if(curr.indexOf(ary[i][f]) == -1) {
	curr.push(ary[i][f]);
	ret.push(ary[i]);
      }
    }
    return ret;
  };
  
  getServiceName = function(item) {
    var name;
    if (typeof item.accessPoint != 'undefined') {
      name = ((item.accessPoint || "").split("://")[1] || "").split(":")[0] || "" ;
    } else if (typeof item.name != 'undefined') {
      name = item.name;
    }
    return name;
  };

  
  
  hasLocationInfo = function(item) {
    return (typeof item.location != 'undefined'
            && typeof item.location.longitude != 'undefined'
            && typeof item.location.latitude != 'undefined'
            && item.location.longitude != 0
            && item.location.city
            && item.location.latitude != 0);
  };
  
  getInstitutionName = function(item) {
    service.ports.forEach(function(p) {
      if (typeof p.properties != 'undefined'
	  && typeof p.properties.ipv4 != 'undefined'
	  && typeof item.listeners != 'undefined') {
	item.listeners.forEach(function(l) {
	  if (l.tcp.split("/")[0] == p.properties.ipv4.address
	      && !item.location.institution)
	    item.location.institution = p.nodeRef.replace(/(.*)(domain=)(.*):.*$/, "$3");
	});
      };
    });
  };
  
  updateServiceEntry = function(item) {
    var now = Math.round(new Date().getTime() / 1e3) // seconds
    item.ttl = Math.round(((item.ttl + (item.ts / 1e6)) - now));
    var d = $q.defer();
    if (!hasLocationInfo(item)) {
      var url = DLT_PROPS.FreeGeoIpUrl + getServiceName(item);      
      $http.get(url).
	success(function(data, status, headers, config) {
	  item.location = {
	    'latitude': data.latitude,
	    'longitude': data.longitude,
	    'state': data.region_code,
	    'country': data.country_code,
	    'zipcode': data.zip_code,
	    'city': data.city
	  };
	  getInstitutionName(item);
          d.resolve();
	}).
	error(function(data, status, headers, config) {
	  console.log("Error: ", status);
          d.resolve();
	});
    } else {
      d.resolve();
    }
    // send a resolve promise anyway
    return d.promise;
  };

  service.getMetadataId = function(id, cb) {
    $http.get('/api/metadata/' + id)
      .success(function(data) {
        //console.log('Metadata Request: ' + data);
        cb(data);
      })
      .error(function(data) {
        console.log('Metadata Error: ' + data);
      });
  };
  
  // Note: getting also invokes subscription
  service.getDataId = function(id, n, cb, uname) {
    var qstr = '/api/data/' + id;
    if (!n) {
      n = 300;
    }
    qstr += '?limit=' + n;
    $http.get(qstr).success(function(data) {
      //console.log('HTTP Data Response: ' + data);
      cb(data);
      service.subDataId(id, cb, uname);
    }).error(function(data) {
      console.log('HTTP Data Error: ' + data);
    });
  };

  service.subDataId = function(id, cb, uname) {
    uname = uname || "__nvrDelete"+ Math.random();
    if (id in dataIdCbMap) {
      dataIdCbMap[id][uname] = cb;
    }
    else {
      //console.log("emitting data request for: ", id, cb);
      SocketService.emit('data_request', {'id': id});
      var obj = {};
      obj[uname] = cb;
      dataIdCbMap[id] = obj;
    }
  };

  service.unsubDataId = function(id,uname) {
    if (uname) {
      var map = dataIdCbMap[id];
      if (map) {
        delete map[uname];
      }
      // Sticking to object keys as general assumption is that map counter cannot be much greater than 38-380
      if (Object.keys(map).length == 0) {
        // Unsubscribe the data id
        SocketService.emit('data_request', {'id': id , 'disconnect' : true});
      }
    }
  };

  SocketService.on('data_data', function(data) {
    var id;
    if (typeof data != 'object'){
      data = JSON.parse(data);
    };
    for (var id in data) {
      if (id in dataIdCbMap) {
	var map = dataIdCbMap[id];
	for (var i in map) {
          var cb = map[i];
          cb(data[id]);
	}
      }
    };
    // if ("id" in data) {
    //   id = data['id'];
    //   //console.log('Incoming data for ' + id + ' : ', data);
    //   if (id in dataIdCbMap) {
    // 	var map = dataIdCbMap[id];
    // 	for (var i in map) {
    //       var cb = map[i];
    //       cb(data['data']);
    // 	}
    //   }
    // }
  });

  finish = function() {
    var services = service.services;
    var prom = [] ;
    services.forEach(function(s) {
      prom.push(updateServiceEntry(s));
      // save the initial ts
      s.firstSeen = s.ts;
    });

    // set timer value
    onTimeout = function() {
      for(var i = services.length-1; i >= 0; i--) {
	if(services[i].ttl <= 0 && services[i].ttl >= -ttl_wiggle) {
	  services[i].status = 'Unknown';
	} else if(services[i].ttl < -ttl_wiggle) {
	  services[i].status = 'OFF';
	} else {
	  services[i].status = 'ON';
	}
	services[i].ttl--;
	if (services[i].ttl < -ttl_off_limit) {
	  // let's not remove 'off' depots yet
	  //services.splice(i, 1);
	}
      }
      //continue timer
      timeout = $timeout(onTimeout, 1000);
    };

    return $q.all(prom).then(function() {
      // start timer
      var timeout = $timeout(onTimeout, 1000);
    });
  };

  // socket handlers...
  SocketService.on('new_depot', function(depot_data) {
    if (typeof data ==	'string') {
      data = JSON.parse(data);
    }
    var data = depot_data.service;
    console.log('New depot data: ', data);
    var services = service.services;

    // always add a new blipp service entry
    if (data.serviceType == "ps:tools:blipp") {
      services.push(data);
      return;
    }

    var found = false;
    // search for duplicate services
    for(var i = 0; i < services.length; i++) {
      if(services[i].accessPoint == data.accessPoint) {
        // just update the ttl and ts with the new value, saving our stored info
        services[i].ttl = data.ttl;
        services[i].ts = data.ts;
        found = true;
        break;
      }
    }

    if (!found) {
      updateServiceEntry(data);
      data.firstSeen = data.ts;
      CommChannel.newData('new_service', depot_data);
    }
  });

  SocketService.on('update_depot', function(data) {
    if (typeof data =='string') {
      data = JSON.parse(data);
    }
    CommChannel.newData('new_metadata', data);
  });

  SocketService.on('port_data', function(data) {
    if (typeof data =='string') {
      data = JSON.parse(data);
    }
    console.log('Port data: ', data);
    service.ports.push(data);
    CommChannel.newData('new_port', data);
  });
  
  // We start here when the service is instantiated
  function makeMap(arr,key,isUnescape) {
    var get = function (model, path, def) {
      path = path || '';
      model = model || {};
      def = typeof def === 'undefined' ? '' : def;
      var parts = path.split('.');
      if (parts.length > 1 && typeof model[parts[0]] === 'object') {
	return get(model[parts[0]], parts.splice(1).join('.'), def);
      } else {
	return model[parts[0]] || def;
      }
    };
    var map = {};
    (arr||[]).forEach(function(x) {
      var val = get(x,key);
      if (isUnescape)
	val = unescape(val);
      if (!map[val])
	map[val] = [];
      map[val].push(x);
    });
    return map;
  }
  var initServicePromise;
  service.init = function() {
    initServicePromise = initServicePromise || $q.all([
      $http.get('/api/depots', { cache: true})
    ]).then(function(res) {
      service.depots = res[0].data;
      service.services = [];
      SocketService.emit('depot_request', {});
      return finish();
    });
    return initServicePromise;
  };
  var getVersionUrlMap = {};
  service.getVersionByUrl = function(url,fromCache) {
    if (fromCache && url in getVersionUrlMap) {
      return $q.when(getVersionUrlMap[url]);
    }
    return $http({
      method : 'get',
      url : '/api/getVersion',
      params: { url : url }
    }).then(function(data) {
      getVersionUrlMap[url] = data;
      return data;
    });
  };
  service.getVersionByHost = function(host,port) {
    return $http.get('/api/getVersion',{
      params : { host : host,port  :port }
    });
  };
  return service;
}





