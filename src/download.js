const fs = require('fs');
const fetch = require('node-fetch');
const readline = require('readline');
const ask = require('./ask')
const verifyDir = require('./files').verifyDir

// looks for a downloading.json file in the given dir. A downloading.json is a JSON
// file containing information about how much of each file in that dir has already
// been downloaded. The downloading.json can be updated as the files are downloaded
// so that in case the script is interrupted halfway and restarted later, the file
// can resume downloading from where it was last interrupted. If a downloading.json
// is not found in the dir, a new empty one will be created
const getDownloadingJSON = async function(dir) {
  let json;
  const jsonFile = `${dir}/downloading.json`;

  //update the downloading.json file with the local `json` object
  let commit = function() {
    return new Promise(function(resolve, reject) {
      fs.writeFile(jsonFile, JSON.stringify(json, null, 2), function(err) {
        if(err) reject(err);
        else resolve();
      })
    });
  }

  //same as `commit` but synchronous
  let commitSync = function() {
    fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));
  }

  //read an existing downloading.json file. Throws an error if it doesn't exist
  let readJSON = function() {
    return new Promise(function(resolve, reject) {
      fs.readFile(jsonFile, (err, data) =>{
        if(err) reject(err);
        else resolve(data);
      })
    });
  }

  //attempt to read an existing downloading.json file and load it into the local
  //`json` object. If it failed to read an existing downloading.json, it will just
  //initialize `json` to an empty object
  try {
    let file = await readJSON();
    json = JSON.parse(file.toString());
  } catch(e) {
    json = {};
  }

  return {
    //contains downloading/downloaded file names as keys, each one containing the
    //total size of that file and how many bytes have been downloaded so far. do
    //NOT update this object directly. Use the methods below to update it.
    files: json,

    //Add a new file entry to the downloading.json
    newFile: async function(fileName) {
      json[fileName] = {};
      await commit();
    },

    //Set the completed amount of bytes for a file in downloading.json. Make sure
    //you called `newFile` for the file first
    setCompleted: async function(fileName, completed) {
      json[fileName].completed = completed;
      await commit();
    },

    //same as `setCompleted` but synchronous
    setCompletedSync: function(fileName, completed) {
      json[fileName].completed = completed;
      commitSync();
    },

    //Set the total file size for a file in downloading.json. Make sure
    //you called `newFile` for the file first
    setFileSize: async function(fileName, fileSize) {
      json[fileName].fileSize = fileSize;
      await commit();
    }
  }
}

//Delete a downloading.json file in a directory. Best to call this once you're done
//downloading all required files in that dir
const deleteDownloadJSON = function() {
  const jsonFile = `${dir}/downloading.json`;
  fs.unlink(jsonFile, e => {})
}

//Creates and returns an object representing a file to be downloaded. This file manages
//the downloading and writing of bytes of the given file url and it also updates the
//downloading.json (represented by the `downloading` object argument) as the file
//download progresses
const createDownloader = function (url, dir, fileName, fileSize, completed, downloading) {
  let fd;
  let _onProgress = () => {};
  let _resolve;
  let _reject;
  let _completed = JSON.parse(JSON.stringify(completed)); //make a local copy
  let _fileSize = JSON.parse(JSON.stringify(fileSize)); //make a local copy

  //Return an error to the caller of `download()`
  let error = function(e) {
    fs.close(fd,(e) => {})
    _reject(e);
  }

  //Return successfully to the caller of `download()`
  let done = function() {
    fs.close(fd,(e) => {});
    if(_completed == _fileSize) {
      _resolve();
    } else {
      error(new Error("Missing bytes"))
    }
  }

  //For every new chunk of data, write it to the file and update the downloading.json
  //of the progress. If an onProgress listener was supplied by `onProgress()`, it
  //will also be called with the completed bytes and total size. (Useful for printng
  //file download progress)
  let newChunk = function(buf) {
    fs.writeSync(fd, buf, 0, null, _completed);
    _completed += buf.length;
    downloading.setCompletedSync(fileName, _completed);
    _onProgress(_completed, _fileSize);
  }

  //Open the file with the given mode
  let openFile = function(mode) {
    return fs.openSync(`${dir}/${fileName}`, mode);
  }

  //Start downloading
  let start = function() {
    //Try opening the file in read/write mode. If it fails, the file hasn't been
    //created yet. In that case, create it by opening the file in write mode first,
    //which will create the file, and then try opening it again in read/write mode
    try {
      fd = openFile('r+');
    } catch(e) {
      try {
        fd = openFile('w');
        fs.closeSync(fd);
        fd = openFile('r+');
      } catch(e2) {
        throw e2;
      }
    }

    let options = {};

    //If the file has already been partially downloaded, set a "Range" header in
    //the request to tell the server to return only the remaining bytes
    if(_completed > 0) {
      options.headers = {
        "Range": `bytes=${_completed}-${_fileSize}`
      }
    }

    //Make the request for the file and set handlers for the response stream
    fetch(url, options)
      .then(r => {
        r.body.on('data', newChunk)
        r.body.on('error', error)
        r.body.on('end', done)
      })
      .catch(error);
  }

  return {
    //Start downloading
    download: async function() {
      return new Promise(function(resolve, reject) {
        _resolve = resolve;
        _reject = reject;
        try {
          start();
        } catch(e) {
          reject(e);
        }
      });
    },

    //Set a listener for progress updates. The given function will be called with
    //2 arguments: the completed number of bytes and the total number of bytes
    onProgress: function(callback) {
      _onProgress = callback;
    }
  }
}


//Make a "headers only" request to the server to get the total file size
const getFileSize = async function(url) {
  let resp = await fetch(url, {method: "HEAD"});
  return parseInt(resp.headers.get("content-length"));
}

//Download a file from a url under the given file name and in the given directory
const downloadFile = async function(url, fileName, dir) {
  await verifyDir(dir);

  let downloading = await getDownloadingJSON(dir); // get/create the downloading.json for the directory
  let fileSize = await getFileSize(url);
  let completed = 0;

  //If an entry for the file already exists in downloading.json, a previous download may have been interrupted
  if(downloading.files[fileName]) {
    if(!downloading.files[fileName].fileSize || downloading.files[fileName].fileSize != fileSize) {
      await downloading.setFileSize(fileName, fileSize);
    }

    if(!downloading.files[fileName].completed) {
      //initialize completed bytes to 0
      await downloading.setCompleted(0);
    } else {
      //check if the file has already finished downloading
      if(downloading.files[fileName].completed == fileSize) {
        return;
      }

      //Ask the user if they would like to resume the partial download
      let completedPercent = Math.round(downloading.files[fileName].completed/fileSize*100*100)/100
      let resume = await ask(`${fileName} has been partially downloaded (${completedPercent}%). Would you like to resume it? [y/n]: `);

      if(resume && (resume.toLowerCase() == "y" || resume.toLowerCase() == "yes")) {
        completed = downloading.files[fileName].completed;
      } else {
        downloading.setCompleted(fileName, 0);
      }
    }
  } else {
    await downloading.newFile(fileName);
    await downloading.setFileSize(fileName, fileSize);
    await downloading.setCompleted(fileName, completed);
  }

  let downloader = createDownloader(url, dir, fileName, fileSize, completed, downloading);
  (function(){
    let progress = 0;
    var writeProgress = function(s) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(s)
    }

    console.log("\n");
    writeProgress(`Downloading ${fileName}: 0%`);

    downloader.onProgress((completed, fileSize) => {
      if(completed/fileSize == 1) {
        writeProgress(`Downloading ${fileName}: 100%`);
        process.stdout.write("\n");
      } else {
        let newProgress = Math.round(completed/fileSize*100*100)/100
        if(newProgress - progress > 0.5) {
          writeProgress(`Downloading ${fileName}: ${newProgress}%`);
          progress = newProgress;
        }
      }
    })
  })();
  await downloader.download();
}

module.exports = {
  downloadFile,
  deleteDownloadJSON
}
