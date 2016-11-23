/*
 * API and Browser Routes
 * app/
 * routes.js
 */
var path = require('path')
, fs = require('fs')
, readline = require('readline')
, http = require('http')
, https = require('https')
, url = require('url')
, cfg = require('../properties')
, util = require('util')
, _ = require('lodash')
, querystring = require('querystring')
, xmlparse = require('xml2js').parseString
, request = require('request')
, supertest = require('supertest')
, ejs = require('ejs')
, q = require('q');
var tough = require('tough-cookie');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

module.exports = function(app) {
  console.log("Starting server ");
  var viewsFolder = "../views";
  app.get('*.html',function(req,res) {
    res.render(path.join(viewsFolder,req.url));
  });
  app.get('*.ejs',function(req,res) {
    res.render(path.join(viewsFolder,req.url));
  });
  app.get('*', function(req, res) {
    res.render(path.join(viewsFolder,'index.ejs'),{apikey  : cfg.gmap_key});
  });
};
