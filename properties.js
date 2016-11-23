/* Configuration file - Configure all source info here .. remove all URL related info from other files */
var fs = require('fs'),
_ = require('underscore');
// var bunyan = require('bunyan');
var hostname = "dlt.crest.iu.edu";
var self = {
  port : process.env.PORT || 42424,
  gmap_key : "AIzaSyCwbndfhup8BdMP3-nkc9W57E1TVCbINkk"
};

module.exports = self;
