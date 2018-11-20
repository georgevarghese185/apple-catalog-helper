const fs = require('fs');

//fs.lstat as a promise
const lstat = function(d) {
  return new Promise(function(resolve, reject) {
    fs.lstat(d, (err, stat) => err ? reject(err) : resolve(stat));
  });
}

//Verify that the given dir exists, that it is a dir, and that we have sufficient
//write permissions on it. Throws an error of these are not satisfied
const verifyDir = async function(dir) {
  let access = function(d) {
    return new Promise(function(resolve, reject) {
      fs.access(d, fs.constants.W_OK, (err) => err ? reject(err) : resolve());
    });
  }

  let stat;
  try {
    stat = await lstat(dir);
  } catch(e) {
    throw new Error(e.toString())
  }

  if(!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory`)
  }

  try {
    await access(dir);
  } catch(e) {
    throw new Error(`Can't write to ${dir}. Make sure you have access to it`)
  }
}

//Create a directory
const makeDir = function (dir) {
  return new Promise(function(resolve, reject) {
    fs.mkdir(dir, (err) => {
      if(err) reject(err);
      else resolve()
    })
  });
}

//Checks if the given file exists by seeing if fs.lstat throws an exception or not
const fileExists = async function(file) {
  try {
    await lstat(file);
    return true;
  } catch(e) {
    return false;
  }
}

//rename a file
const renameFile = function(oldFile, newFile) {
  return new Promise(function(resolve, reject) {
    fs.rename(oldFile, newFile, err => {
      if (err) reject(err);
      else resolve();
    })
  });
}

const deleteFile = function(file) {
  return new Promise(function(resolve, reject) {
    fs.unlink(file, e => {resolve()});
  });
}

const readFile = function(file) {
  return new Promise(function(resolve, reject) {
    fs.readFile(file, (err, data) =>{
      if(err) reject(err);
      else resolve(data);
    })
  });
}

const writeFile = function(file, data) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(file, data, function(err) {
      if(err) reject(err);
      else resolve();
    })
  });
}

module.exports = {
  lstat,
  verifyDir,
  makeDir,
  fileExists,
  renameFile,
  deleteFile,
  readFile,
  writeFile
}
