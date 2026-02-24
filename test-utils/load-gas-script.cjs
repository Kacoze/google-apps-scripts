const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGasScript(relativePath, injectedGlobals) {
  const filePath = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(filePath, "utf8");

  const sandbox = {
    module: { exports: {} },
    exports: {},
    Logger: { log: function () {} },
    LockService: {
      getScriptLock: function () {
        return {
          tryLock: function () {
            return true;
          },
          releaseLock: function () {},
          hasLock: function () {
            return true;
          }
        };
      }
    },
    CalendarApp: {
      getCalendarById: function () {
        return null;
      }
    },
    Calendar: {
      Events: {
        insert: function () {},
        list: function () {
          return { items: [] };
        }
      }
    },
    Session: {
      getScriptTimeZone: function () {
        return "UTC";
      }
    },
    Utilities: {
      sleep: function () {},
      base64Encode: function (value) {
        return Buffer.from(String(value)).toString("base64");
      }
    },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function () {
            return "";
          }
        };
      }
    },
    CacheService: {
      getScriptCache: function () {
        return {
          get: function () {
            return null;
          },
          put: function () {},
          remove: function () {}
        };
      }
    },
    UrlFetchApp: {
      fetch: function () {
        return {
          getResponseCode: function () {
            return 200;
          },
          getContentText: function () {
            return '{"ok":true}';
          },
          getHeaders: function () {
            return {};
          }
        };
      }
    },
    ContentService: {
      createTextOutput: function (value) {
        return value;
      }
    },
    MailApp: {
      sendEmail: function () {}
    },
    Date: Date,
    JSON: JSON,
    Math: Math,
    String: String,
    Number: Number,
    Array: Array,
    Object: Object,
    RegExp: RegExp,
    parseInt: parseInt,
    parseFloat: parseFloat
  };

  Object.assign(sandbox, injectedGlobals || {});
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return { exports: sandbox.module.exports, sandbox: sandbox };
}

module.exports = { loadGasScript };
