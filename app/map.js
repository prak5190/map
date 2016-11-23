var cfg = require('../properties.js');
var GoogleMapsAPI = require('googlemaps');
var assert = require('assert');
assert(!!cfg.gmap_key);
var publicConfig = {
  key: cfg.gmap_key,
  stagger_time:       1000, // for elevationPath
  encode_polylines:   false,
  secure:             true
};
var gmAPI = new GoogleMapsAPI(publicConfig);


// geocode API
var geocodeParams = {
  "address":    "121, Curtain Road, EC2A 3AD, London UK",
  "components": "components=country:GB",
  "bounds":     "55,-1|54,1",
  "language":   "en",
  "region":     "uk"
};

gmAPI.geocode(geocodeParams, function(err, result){
  console.log(result);
});

// reverse geocode API
var reverseGeocodeParams = {
  "latlng":        "51.1245,-0.0523",
  "result_type":   "postal_code",
  "language":      "en",
  "location_type": "APPROXIMATE"
};

gmAPI.reverseGeocode(reverseGeocodeParams, function(err, result){
  console.log(result);
});



gmAPI.directions({
        origin: 'Madison , Wi, USA',
        destination: 'Chicago, Il, USA'
      }, function(err, data) {
	console.log(JSON.stringify(data));
      });
