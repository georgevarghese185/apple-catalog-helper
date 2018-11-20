const fs = require('fs');
const fetch = require('node-fetch');
const readline = require('readline');
const ask = require('./ask')
const verifyDir = require('./files').verifyDir
const lstat = require('./files').lstat
const fileExists = require('./files').fileExists;

// looks for a downloading.json file in the given dir. A downloading.json is a JSON
// file that contains downloading filenames and their url and temporary name while
// it's being downloaded (filename.part). If a download was interrupted, this file
// can be checked in the next run to see if any files were still being downloaded
// so that resuming the download can be attempted. If a downloading.json is not
// found in the dir, a new empty one will be created
const getDownloadingJSON = async function(dir) {
  let json;
  const jsonFile = `${dir}/downloading.json`;

  //update the downloading.json file with the local `json` object
  let commit = function() {
    return new Promise(function(resolve, reject) {
      fs.unlink(jsonFile, e => {
        fs.writeFile(jsonFile, JSON.stringify(json, null, 2), function(err) {
          if(err) reject(err);
          else resolve();
        })
      })
    });
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

  //Create a new file in the dir (overwrite if it exists)
  let createFile = function(fileName) {
    return new Promise(function(resolve, reject) {
      fs.open(`${dir}/${fileName}`, 'w+', (err, fd) => {
        if(err) reject(err);
        else {
          fs.close(fd, () => {});
          resolve();
        }
      })
    });
  }

  //get the size of a file in the dir
  let getSize = async function(fileName) {
    let stats = await lstat(`${dir}/${fileName}`);
    return stats.size;
  }

  //rename a file in the dir
  let renameFile = function(oldName, newName) {
    return new Promise(function(resolve, reject) {
      fs.rename(`${dir}/${oldName}`, `${dir}/${newName}`, err => {
        if (err) reject(err);
        else resolve();
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

  //If any downloading file entries exist in the read json, (from a possible previous
  //run that might have been interrupted) check if the incomplete `.part` file
  //for that file exists. If it exists, download can be resumed on that .part file.
  //If it doesn't exists, remove the file entry from downloading.json
  Promise.all(
    Object.keys(json).map(async f => {
      let exists = await fileExists(`${dir}/${json[f].tempName}`);
      if(!exists) {
        delete json[f]
        await commit();
      }
    })
  );

  //save whatever we have so far to downloading.json
  await commit();

  return {
    //contains downloading/downloaded file names as keys, each one containing the
    //url of the file and the temporary file name given to it while downloading.
    //Do NOT update this object directly. Use the methods below to update it.
    files: json,

    //Add a new file entry to the downloading.json
    newFile: async function(fileName, url) {
      let tempName = fileName + ".part";
      json[fileName] = {url, tempName};
      await createFile(tempName)
      await commit();
    },

    //Get the completed number of bytes in the temporary file for the given fileName
    getCompletedBytes: async function(fileName) {
      return getSize(json[fileName].tempName);
    },

    //Notify that a download completed. This will rename the temporary file to the
    //actual file name and remove the file entry from downloading.json
    downloadComplete: async function(fileName) {
      await renameFile(json[fileName].tempName, fileName);
      delete json[fileName];
      await commit();
    }
  }
}

//Delete a downloading.json file in a directory. Best to call this once you're done
//downloading all required files in that dir
const deleteDownloadJSON = function(dir) {
  const jsonFile = `${dir}/downloading.json`;
  fs.unlink(jsonFile, e => {})
}

//Creates and returns an object representing a file to be downloaded. This file manages
//the downloading and writing of bytes of the given file url and it also updates the
//downloading.json (represented by the `downloading` object argument) when the download
//completes
const createDownloader = function (url, dir, fileName, fileSize, completed, downloading) {
  let fd;
  let _onProgress = () => {};
  let _resolve;
  let _reject;
  let _completed = JSON.parse(JSON.stringify(completed)); //make a local copy
  let _fileSize = JSON.parse(JSON.stringify(fileSize)); //make a local copy
  let _tempName = downloading.files[fileName].tempName;

  //Return an error to the caller of `download()`
  let error = function(e) {
    fs.close(fd,(e) => {})
    _reject(e);
  }

  //Return successfully to the caller of `download()`
  let done = function() {
    fs.close(fd,(e) => {});
    if(_completed == _fileSize) {
      downloading.downloadComplete(fileName).then(_resolve).catch(error);
    } else {
      error(new Error("Missing bytes"))
    }
  }

  //For every new chunk of data, write it to the file. If an onProgress listener
  //was supplied by `onProgress()`, it will also be called with the completed bytes
  //and total size. (Useful for printng file download progress)
  let newChunk = function(buf) {
    fs.writeSync(fd, buf, 0, null, _completed);
    _completed += buf.length;
    _onProgress(_completed, _fileSize);
  }

  //Open the file with the given mode
  let openFile = function(mode) {
    return fs.openSync(`${dir}/${_tempName}`, mode);
  }

  //Start downloading
  let start = function() {
    fd = openFile('r+');

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

  //If a file with this name already exists, ask the user if they want to skip re-downloading
  //this file (which will overwrite the existing one)
  let exists = await fileExists(`${dir}/${fileName}`);
  if(exists) {
    let skipFile = await ask(`\n${fileName} already exists in this directory. Do you want to `
      + "skip downloading it? If you choose not to skip, the existing file will be "
      + "overwritten.\n\nSkip file? [y/n]: "
    );
    if(skipFile.toLowerCase() == "y" || skipFile.toLowerCase() == "yes") {
      //delete any temporary download files if they exist
      if(downloading.files[fileName]) {
        fs.unlink(`${dir}/${downloading.files[fileName].tempName}`, e => {})
      }
      return
    }
  }

  //If an incomplete download of this file exists, ask the user if they want to
  //continue from where it left off or redownload it.
  if(downloading.files[fileName] && downloading.files[fileName].url == url) {
    let existingFileSize = await downloading.getCompletedBytes(fileName);
    let completedPercent = Math.round(existingFileSize/fileSize*100*100)/100

    let resume = await ask(`\n${fileName} has been partially downloaded (${completedPercent}%). Would you like to resume it? [y/n]: `);
    if(resume && (resume.toLowerCase() == "y" || resume.toLowerCase() == "yes")) {
      completed = existingFileSize;
    } else {
      await downloading.newFile(fileName, url);
    }
  } else {
    await downloading.newFile(fileName, url);
  }

  let downloader = createDownloader(url, dir, fileName, fileSize, completed, downloading);
  //This function prints the file progress to the console as the download progresses
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
  console.log("\n")
}

module.exports = {
  downloadFile,
  deleteDownloadJSON
}
