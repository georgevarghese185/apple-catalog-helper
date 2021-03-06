const http = require('http');
const fetch = require('node-fetch');
const xml2js = require('xml2js')
const ask = require('./ask')
const verifyDir = require('./files').verifyDir
const makeDir = require('./files').makeDir
const downloadFile = require('./download').downloadFile
const deleteDownloadJSON = require('./download').deleteDownloadJSON;
const fileExists = require('./files').fileExists;
const renameFile = require('./files').renameFile;
const readFile = require('./files').readFile;
const writeFile = require('./files').writeFile;

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

const renameInstallESD = async function(dir) {
  console.log("\n\nRenaming InstallESDDmg.pkg -> InstallESD.dmg");
  await renameFile(`${dir}/InstallESDDmg.pkg`, `${dir}/InstallESD.dmg`);

  console.log("Updating InstallInfo.plist..")
  let info = (await readFile(`${dir}/InstallInfo.plist`)).toString();

  //remove chunklistURL and chunklistid keys
  info = info.replace(/[\n\r]\s+<key>chunklistURL<\/key>[\n\r]\s+<string>InstallESDDmg\.chunklist<\/string>/, "");
  info = info.replace(/[\n\r]\s+<key>chunklistid<\/key>[\n\r]\s+<string>com\.apple\.chunklist\.InstallESDDmg<\/string>/, "");

  //rename InstallESDDmg to InstallESD
  info = info.replace("InstallESDDmg.pkg", "InstallESD.dmg")
  info = info.replace("com.apple.pkg.InstallESDDmg", "com.apple.dmg.InstallESD")

  await writeFile(`${dir}/InstallInfo.plist`, info);
}

const start = async function(catalogUrl) {
  let pathSeparator = process.platform == "win32" ? "\\" : "/"
  let currentDir = process.argv[0].substring(0, process.argv[0].lastIndexOf(pathSeparator)); //only works in built binary
  console.log("Downloading catalog..")
  var catalog = await fetchXML(catalogUrl);
  let versions = await getVersions(catalog);

  let optionsMsg = versions.reduce((m, v, i) => m + `\n[${i+1}] ${v.buildInfo.versionNumber} (${v.buildInfo.build})`, "");

  console.log("\nmacOS Verions available in catalog:\n" + optionsMsg);
  let downloadVersion = parseInt(await ask(`\nWhich version are you looking to download? [${1}-${versions.length}]: `)) - 1;
  if(Number.isNaN(downloadVersion) || downloadVersion < 0 || downloadVersion >= versions.length) {
    throw new Error("Not a valid choice")
  }

  console.log(`

Do you want to
[1] Start downloading the required files
[2] See the download links so you can download it manually
` );

  let choice = await ask("\Your choice: ")

  if(choice < 1 || choice > 2) {
    throw new Error("Not a valid choice")
  }

  if(choice == 2) {
    console.log("Download links: \n");
    let links = versions[downloadVersion].files.reduce((m, url) => m + `\n${url}`, "")
    console.log(links)
  } else {
    console.log(`\n\nEnter the path where you want to download the files (Default: ${currentDir})`);
    let downloadDir = await ask("\nEnter path: ");
    downloadDir = downloadDir == "" ? currentDir : downloadDir;
    console.log("\n")

    await verifyDir(downloadDir);
    downloadDir = downloadDir + "/SharedSupport";
    if(!await fileExists(downloadDir)) {
      await makeDir(downloadDir)
    }

    let getFileName = url => url.substring(url.lastIndexOf('/') + 1)
    let files = versions[downloadVersion].files;

    for(var i = 0; i < files.length; i++) {
      let url = files[i]
      await downloadFile(url, getFileName(url), downloadDir)
    }

    await deleteDownloadJSON(downloadDir);
    console.log("\n\n\nAll required files have been downloaded!");

    console.log("\nWould you like to automatically rename InstallESDDmg.pkg to InstallESD.dmg " +
      "and update InstallInfo.plist? This step is required for creating a macOS installer from these files");
    let rename = await ask("\nRename file and update plist [y/n]: ");
    if(rename.toLowerCase() == "y" || rename.toLowerCase == "yes") {
      await renameInstallESD(downloadDir);
    }

    await ask("\n\nDone! Press any key to exit..");
  }
}


if(!process.argv[2]) {
  ask("Please pass an Apple Catalog URL\nPress any key to exit..").then(() => {}).catch(() => {});
} else {
  start(process.argv[2]).then(() => {})
  .catch((e) => {
    console.log("\n")
    console.log(e);
    ask("\nPress any key to exit..").then(() => {}).catch(() => {});
  })
}
