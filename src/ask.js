const readline = require('readline')

module.exports = async function(msg) {
  return new Promise(function(resolve, reject) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(msg, (input) => {
      rl.close();
      resolve(input);
    });
  });
}
