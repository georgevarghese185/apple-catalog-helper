const http = require('http');
const fetch = require('node-fetch');
const xml2js = require('xml2js')


//Uses xml2js to parse the given XML string to a JSON
const parseXMLString = async function(xmlString) {
  return await new Promise(function(resolve, reject) {
    xml2js.parseString(xmlString, (err, result) => {
      if(err) {
        reject(err);
      } else {
        resolve(result);
      }
    })
  });
}

//Takes a URL to an XML and downloads and parses it to a JSON using xml2js
const fetchXML = async function(url) {
  let resp = await fetch(url);
  let xmlString = await resp.text();
  let xml = await parseXMLString(xmlString);
  return xml;
}

//Given a catalog (JSON of Apple's catalog XML) it finds all the versions of BaseSystem.dmg in it and returns their download URLs in an array
const getBaseSystemURLs = function(catalog) {
  var baseSystems = [];
  catalog.plist.dict.map(d =>
    d.dict.map(d =>
      d.dict.map(d =>
        d.array.map(a =>
          a.dict.map(d => {
            var baseSystem = d.string.find(s => s.match(/^http.*BaseSystem.dmg$/))
            if(baseSystem) baseSystems.push(baseSystem);
          })
        )
      )
    )
  )
  return baseSystems;
}

//Given a catalog and a 'XXX-XXXX' looking key, it finds the and returns the URL of the corresponding English.dist file (which contains the build number info of that key)
const getDistURL = function(catalog, key) {
  var url;
  var keyExp = key.replace('-', '\\-'); //escape the hyphen in the key string for the Regex
  catalog.plist.dict.map(d =>
    d.dict.map(d =>
      d.dict.map(d =>
        d.dict.map(d => {
          let _url;
          if(d.string) {
            _url = d.string.find(s => s.match(new RegExp(`^http.*${keyExp}\.English\.dist$`)))
            if(_url) url = _url;
          }
        })
      )
    )
  );
  return url;
}

//Given an English.dist XML, returns the VERSION and BUILD strings of that version
const getBuildInfo = function(dist) {
  let versionNumber;
  let build;
  dist["installer-gui-script"].auxinfo.map(a =>
    a.dict.map(d =>
      d.key.map((k, i) => {
        if(k == "VERSION") {
          dist["installer-gui-script"].auxinfo.map(a => a.dict.map(d => versionNumber = d.string[i]));
        } else if(k == "BUILD") {
          dist["installer-gui-script"].auxinfo.map(a => a.dict.map(d => build = d.string[i]));
        }
      })
    )
  );

  return {build, versionNumber};
}

//Given an Apple catalog XML (parsed to JSON using xml2js) return an array of different versions and links to download the macOS files for each version
const getVersions = async function(catalog) {
  let baseSystemURLs = getBaseSystemURLs(catalog); //To find the different versions in the XML, find all BaseSystem.dmg download links and start from there
  let versions = await Promise.all(
    baseSystemURLs.map(async b => {
      let url = b.match(/^(http.*\/)BaseSystem\.dmg/)[1]; //Remove BaseSystem.dmg to get the base URL of each macOS
      let key = b.match(/\/(\d+\-\d+)\//)[1]; //We need this to get the corresponding English.dist file containing build version numbers

      //Download the English.dist and get build and version numbers from it
      let distUrl = getDistURL(catalog, key);
      let dist = await fetchXML(distUrl);
      let buildInfo = getBuildInfo(dist);

      //Links to all required macOS files for install mac (just the base url + each file's name)
      let files = [
        url + "BaseSystem.dmg",
        url + "BaseSystem.chunklist",
        url + "InstallInfo.plist",
        url + "InstallESDDmg.pkg",
        url + "AppleDiagnostics.dmg",
        url + "AppleDiagnostics.chunklist"
      ]

      return {url, key, buildInfo, files};
    }
  ));

  return versions;
}

// const start = async function(catalogUrl) {
//   console.log("Downloading catalog")
//   let versions = await getVersions(catalogUrl);
//
//   let message = versions.map((v, i) => )
// }

fetchXML('https://swscan.apple.com/content/catalogs/others/index-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard.merged-1.sucatalog.gz')
  .then(catalog =>
    getVersions(catalog)
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(console.log)
  ).catch(console.log)
