const Module = require("module");
const path = require("path");

function resolveFrom(targetModulePath, request) {
  return Module._resolveFilename(request, {
    id: targetModulePath,
    filename: targetModulePath,
    paths: Module._nodeModulePaths(path.dirname(targetModulePath)),
  });
}

function loadWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originalLoad = Module._load;

  delete require.cache[resolvedTarget];

  Module._load = function patchedLoad(request, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(request, parent);
    if (Object.prototype.hasOwnProperty.call(mocks, resolvedRequest)) {
      return mocks[resolvedRequest];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(resolvedTarget);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedTarget];
  }
}

module.exports = {
  loadWithMocks,
  resolveFrom,
};
