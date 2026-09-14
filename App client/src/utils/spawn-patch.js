const child_process = require('child_process');
const originalSpawn = child_process.spawn;

function applySpawnPatch() {
  const patchedSpawn = function(command, args, options) {
    if (command && (command.includes('CameraWebApp') || (args && args.some(arg => String(arg).includes('CameraWebApp'))))) {
      if (options && Array.isArray(options.stdio)) {
        // Force stdin to be 'pipe' so we can write to it
        options.stdio[0] = 'pipe';
      }
      const child = originalSpawn.call(child_process, command, args, options);
      if (child && child.stdout && child.stdin) {
        child.stdout.on('data', (data) => {
          const text = data.toString();
          if (text.includes("return to the TOP-MENU") || text.includes("Please input '0'")) {
            try {
              child.stdin.write('0\n');
            } catch (err) {
              // Ignore write errors if process is already dead
            }
          }
        });
      }
      return child;
    }
    return originalSpawn.call(child_process, command, args, options);
  };

  child_process.spawn = patchedSpawn;
  try {
    require('node:child_process').spawn = patchedSpawn;
  } catch (e) {}
}

module.exports = {
  applySpawnPatch
};
