const fs = require('fs');

//Verify that the given dir exists, that it is a dir, and that we have sufficient
//write permissions on it. Throws an error of these are not satisfied
const verifyDir = async function(dir) {
  let lstat = function(d) {
    return new Promise(function(resolve, reject) {
      fs.lstat(d, (err, stat) => err ? reject(err) : resolve(stat));
    });
  }
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

module.exports = {
  verifyDir
}
