"use strict";

var defaults = require("lodash/object/defaults");
var fs = require("fs-extra");
var path = require("path");
var chokidar = require("chokidar");
var _ = require('lodash');


module.exports = function (source, targets, opts) {
  opts = defaults(opts || {}, {
    "watch": true,
    "delete": true,
    "depth": Infinity
  });

  if (typeof opts.depth !== "number" || isNaN(opts.depth)) {
    return false;
  }

  // Initial mirror
  var mirrored = mirror(source, targets, opts, 0);


  if (opts.watch) {
    // Watcher to keep in sync from that
    var watchAll = [...targets,source];
    chokidar.watch(source, {
      "persistent": true,
      "depth": opts.depth,
      "ignoreInitial": true
      // TODO "ignore": opts.ignore
    })
    //.on("raw", console.log.bind(console, "raw"))
    .on("ready", () => console.log("watch", source))
    .on("add", watcherCopy(source, targets, opts))
    .on("addDir", watcherCopy(source, targets, opts))
    .on("change", watcherCopy(source, targets, opts))
    .on("unlink", watcherDestroy(source, targets, opts))
    .on("unlinkDir", watcherDestroy(source, targets, opts))
    .on("error", watcherError(opts));
  }
};

function watcherCopy (source, targets, opts) {
  return function (f, stats) {
      _.forEach(targets,function(t){
          copy(f, [path.join(t, path.relative(source, f))]);
      })
  };
}

function watcherDestroy (source, targets, opts) {
  return function (f) {
      _.forEach(targets,function(t){
          deleteExtra([path.join(t, path.relative(source, f))], opts);
      })

  };
}

function watcherError (opts) {
  return function (err) {
      console.log(err)
  };
}

function mirror (source, targets, opts, depth) {
  // Specifc case where the very source is gone
  var sourceStat;
  try {
    sourceStat = fs.statSync(source);
  } catch (e) {
    // Source not found: destroy target?
    _.forEach(targets, function(t){
        if (fs.existsSync(t)) {
           deleteExtra([t], opts);
        }
    })

  }

  var targetStat = [];
  try {
    _.forEach(targets, function(t){
        targetStat.push(fs.statSync(t));
    })

  } catch (e) {
    // Target not found? good, direct copy
    return copy(source, targets);
  }

  if (sourceStat.isDirectory()) {
    if (depth === opts.depth) {
      return true;
    }

    // copy from source to target
    var copied = fs.readdirSync(source).every(function (f) {
        var newTargets = [];
        _.forEach(targets, function(t,i){
            newTargets[i] = path.join(t, f)
        })
        return mirror(path.join(source, f), newTargets , opts, depth + 1);
    });

    // check for extraneous
    var deletedExtra;
    _.forEach(targets, function(t){
        fs.readdirSync(t).every(function (f) {
          return fs.existsSync(path.join(source, f)) || deleteExtra([path.join(t, f)], opts);
      });
      deletedExtra = true;
    })

    return true;

  } else if (sourceStat.isFile()) {
      _.forEach(targetStat, function(t){
          if(t.isFile()){
              if (sourceStat.mtime > t.mtime) {
                return copy(source, targets);
              } else {
                return true;
              }
          }
      })
    // compare update-time before overwriting

  } else if (opts.delete) {
    // incompatible types: destroy target and copy
    return destroy(targets) && copy(source, targets);
  } else if (sourceStat.isFile() && targetStat.isDirectory()) {
    // incompatible types
    return false;
  } else if (sourceStat.isDirectory() && targetStat.isFile()) {
    // incompatible types
    return false;
  } else {
    throw new Error("Unexpected case: WTF?");
  }
}

function deleteExtra (fileordirs, opts) {
  if (opts.delete) {
    return destroy(fileordirs);
  } else {
    return true;
  }
}

function copy (source, targets) {
  try {
      _.forEach(targets,function(t){
          fs.copySync(source, t);
      })

    return true;
  } catch (e) {
      console.log(e);
    return false;
  }
}

function destroy (fileordirs) {
  try {
      _.forEach(fileordirs, function(f){
          fs.remove(f);
      })

    return true;
  } catch (e) {
      console.log(e)
    return false;
  }
}
