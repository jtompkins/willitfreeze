"format register";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare, execute) {
    if (typeof name != 'string')
      throw "System.register provided no module name";
    
    var entry;

    // dynamic
    if (typeof declare == 'boolean') {
      entry = {
        declarative: false,
        deps: deps,
        execute: execute,
        executingRequire: declare
      };
    }
    else {
      // ES6 declarative
      entry = {
        declarative: true,
        deps: deps,
        declare: declare
      };
    }

    entry.name = name;
    
    // we never overwrite an existing define
    if (!defined[name])
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }

  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      
      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;
      
      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {
        
        // if already in a group, remove from the old group
        if (depEntry.groupIndex) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });
    
    module.setters = declaration.setters;
    module.execute = declaration.execute;

    if (!module.setters || !module.execute)
      throw new TypeError("Invalid System.register form for " + entry.name);

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = { 'default': depEntry.module.exports, __useDefault: true };
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);
    
      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);
    
    if (output)
      module.exports = output;
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    var module = entry.declarative ? entry.module.exports : { 'default': entry.module.exports, '__useDefault': true };

    // return the defined module object
    return modules[name] = module;
  };

  return function(main, declare) {

    var System;

    // if there's a system loader, define onto it
    if (typeof System != 'undefined' && System.register) {
      declare(System);
      System['import'](main);
    }
    // otherwise, self execute
    else {
      declare(System = {
        register: register, 
        get: load, 
        set: function(name, module) {
          modules[name] = module; 
        },
        newModule: function(module) {
          return module;
        },
        global: global 
      });
      load(main);
    }
  };

})(typeof window != 'undefined' ? window : global)
/* ('mainModule', function(System) {
  System.register(...);
}); */
('app', function(System) {




(function() {
function define(){};  define.amd = {};
(function(global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = global.document ? factory(global, true) : function(w) {
      if (!w.document) {
        throw new Error("jQuery requires a window with a document");
      }
      return factory(w);
    };
  } else {
    factory(global);
  }
}(typeof window !== "undefined" ? window : this, function(window, noGlobal) {
  var arr = [];
  var slice = arr.slice;
  var concat = arr.concat;
  var push = arr.push;
  var indexOf = arr.indexOf;
  var class2type = {};
  var toString = class2type.toString;
  var hasOwn = class2type.hasOwnProperty;
  var support = {};
  var document = window.document,
      version = "2.1.3",
      jQuery = function(selector, context) {
        return new jQuery.fn.init(selector, context);
      },
      rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
      rmsPrefix = /^-ms-/,
      rdashAlpha = /-([\da-z])/gi,
      fcamelCase = function(all, letter) {
        return letter.toUpperCase();
      };
  jQuery.fn = jQuery.prototype = {
    jquery: version,
    constructor: jQuery,
    selector: "",
    length: 0,
    toArray: function() {
      return slice.call(this);
    },
    get: function(num) {
      return num != null ? (num < 0 ? this[num + this.length] : this[num]) : slice.call(this);
    },
    pushStack: function(elems) {
      var ret = jQuery.merge(this.constructor(), elems);
      ret.prevObject = this;
      ret.context = this.context;
      return ret;
    },
    each: function(callback, args) {
      return jQuery.each(this, callback, args);
    },
    map: function(callback) {
      return this.pushStack(jQuery.map(this, function(elem, i) {
        return callback.call(elem, i, elem);
      }));
    },
    slice: function() {
      return this.pushStack(slice.apply(this, arguments));
    },
    first: function() {
      return this.eq(0);
    },
    last: function() {
      return this.eq(-1);
    },
    eq: function(i) {
      var len = this.length,
          j = +i + (i < 0 ? len : 0);
      return this.pushStack(j >= 0 && j < len ? [this[j]] : []);
    },
    end: function() {
      return this.prevObject || this.constructor(null);
    },
    push: push,
    sort: arr.sort,
    splice: arr.splice
  };
  jQuery.extend = jQuery.fn.extend = function() {
    var options,
        name,
        src,
        copy,
        copyIsArray,
        clone,
        target = arguments[0] || {},
        i = 1,
        length = arguments.length,
        deep = false;
    if (typeof target === "boolean") {
      deep = target;
      target = arguments[i] || {};
      i++;
    }
    if (typeof target !== "object" && !jQuery.isFunction(target)) {
      target = {};
    }
    if (i === length) {
      target = this;
      i--;
    }
    for (; i < length; i++) {
      if ((options = arguments[i]) != null) {
        for (name in options) {
          src = target[name];
          copy = options[name];
          if (target === copy) {
            continue;
          }
          if (deep && copy && (jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)))) {
            if (copyIsArray) {
              copyIsArray = false;
              clone = src && jQuery.isArray(src) ? src : [];
            } else {
              clone = src && jQuery.isPlainObject(src) ? src : {};
            }
            target[name] = jQuery.extend(deep, clone, copy);
          } else if (copy !== undefined) {
            target[name] = copy;
          }
        }
      }
    }
    return target;
  };
  jQuery.extend({
    expando: "jQuery" + (version + Math.random()).replace(/\D/g, ""),
    isReady: true,
    error: function(msg) {
      throw new Error(msg);
    },
    noop: function() {},
    isFunction: function(obj) {
      return jQuery.type(obj) === "function";
    },
    isArray: Array.isArray,
    isWindow: function(obj) {
      return obj != null && obj === obj.window;
    },
    isNumeric: function(obj) {
      return !jQuery.isArray(obj) && (obj - parseFloat(obj) + 1) >= 0;
    },
    isPlainObject: function(obj) {
      if (jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow(obj)) {
        return false;
      }
      if (obj.constructor && !hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
        return false;
      }
      return true;
    },
    isEmptyObject: function(obj) {
      var name;
      for (name in obj) {
        return false;
      }
      return true;
    },
    type: function(obj) {
      if (obj == null) {
        return obj + "";
      }
      return typeof obj === "object" || typeof obj === "function" ? class2type[toString.call(obj)] || "object" : typeof obj;
    },
    globalEval: function(code) {
      var script,
          indirect = eval;
      code = jQuery.trim(code);
      if (code) {
        if (code.indexOf("use strict") === 1) {
          script = document.createElement("script");
          script.text = code;
          document.head.appendChild(script).parentNode.removeChild(script);
        } else {
          indirect(code);
        }
      }
    },
    camelCase: function(string) {
      return string.replace(rmsPrefix, "ms-").replace(rdashAlpha, fcamelCase);
    },
    nodeName: function(elem, name) {
      return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
    },
    each: function(obj, callback, args) {
      var value,
          i = 0,
          length = obj.length,
          isArray = isArraylike(obj);
      if (args) {
        if (isArray) {
          for (; i < length; i++) {
            value = callback.apply(obj[i], args);
            if (value === false) {
              break;
            }
          }
        } else {
          for (i in obj) {
            value = callback.apply(obj[i], args);
            if (value === false) {
              break;
            }
          }
        }
      } else {
        if (isArray) {
          for (; i < length; i++) {
            value = callback.call(obj[i], i, obj[i]);
            if (value === false) {
              break;
            }
          }
        } else {
          for (i in obj) {
            value = callback.call(obj[i], i, obj[i]);
            if (value === false) {
              break;
            }
          }
        }
      }
      return obj;
    },
    trim: function(text) {
      return text == null ? "" : (text + "").replace(rtrim, "");
    },
    makeArray: function(arr, results) {
      var ret = results || [];
      if (arr != null) {
        if (isArraylike(Object(arr))) {
          jQuery.merge(ret, typeof arr === "string" ? [arr] : arr);
        } else {
          push.call(ret, arr);
        }
      }
      return ret;
    },
    inArray: function(elem, arr, i) {
      return arr == null ? -1 : indexOf.call(arr, elem, i);
    },
    merge: function(first, second) {
      var len = +second.length,
          j = 0,
          i = first.length;
      for (; j < len; j++) {
        first[i++] = second[j];
      }
      first.length = i;
      return first;
    },
    grep: function(elems, callback, invert) {
      var callbackInverse,
          matches = [],
          i = 0,
          length = elems.length,
          callbackExpect = !invert;
      for (; i < length; i++) {
        callbackInverse = !callback(elems[i], i);
        if (callbackInverse !== callbackExpect) {
          matches.push(elems[i]);
        }
      }
      return matches;
    },
    map: function(elems, callback, arg) {
      var value,
          i = 0,
          length = elems.length,
          isArray = isArraylike(elems),
          ret = [];
      if (isArray) {
        for (; i < length; i++) {
          value = callback(elems[i], i, arg);
          if (value != null) {
            ret.push(value);
          }
        }
      } else {
        for (i in elems) {
          value = callback(elems[i], i, arg);
          if (value != null) {
            ret.push(value);
          }
        }
      }
      return concat.apply([], ret);
    },
    guid: 1,
    proxy: function(fn, context) {
      var tmp,
          args,
          proxy;
      if (typeof context === "string") {
        tmp = fn[context];
        context = fn;
        fn = tmp;
      }
      if (!jQuery.isFunction(fn)) {
        return undefined;
      }
      args = slice.call(arguments, 2);
      proxy = function() {
        return fn.apply(context || this, args.concat(slice.call(arguments)));
      };
      proxy.guid = fn.guid = fn.guid || jQuery.guid++;
      return proxy;
    },
    now: Date.now,
    support: support
  });
  jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
    class2type["[object " + name + "]"] = name.toLowerCase();
  });
  function isArraylike(obj) {
    var length = obj.length,
        type = jQuery.type(obj);
    if (type === "function" || jQuery.isWindow(obj)) {
      return false;
    }
    if (obj.nodeType === 1 && length) {
      return true;
    }
    return type === "array" || length === 0 || typeof length === "number" && length > 0 && (length - 1) in obj;
  }
  var Sizzle = (function(window) {
    var i,
        support,
        Expr,
        getText,
        isXML,
        tokenize,
        compile,
        select,
        outermostContext,
        sortInput,
        hasDuplicate,
        setDocument,
        document,
        docElem,
        documentIsHTML,
        rbuggyQSA,
        rbuggyMatches,
        matches,
        contains,
        expando = "sizzle" + 1 * new Date(),
        preferredDoc = window.document,
        dirruns = 0,
        done = 0,
        classCache = createCache(),
        tokenCache = createCache(),
        compilerCache = createCache(),
        sortOrder = function(a, b) {
          if (a === b) {
            hasDuplicate = true;
          }
          return 0;
        },
        MAX_NEGATIVE = 1 << 31,
        hasOwn = ({}).hasOwnProperty,
        arr = [],
        pop = arr.pop,
        push_native = arr.push,
        push = arr.push,
        slice = arr.slice,
        indexOf = function(list, elem) {
          var i = 0,
              len = list.length;
          for (; i < len; i++) {
            if (list[i] === elem) {
              return i;
            }
          }
          return -1;
        },
        booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",
        whitespace = "[\\x20\\t\\r\\n\\f]",
        characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",
        identifier = characterEncoding.replace("w", "w#"),
        attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace + "*([*^$|!~]?=)" + whitespace + "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace + "*\\]",
        pseudos = ":(" + characterEncoding + ")(?:\\((" + "('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" + "((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" + ".*" + ")\\)|)",
        rwhitespace = new RegExp(whitespace + "+", "g"),
        rtrim = new RegExp("^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g"),
        rcomma = new RegExp("^" + whitespace + "*," + whitespace + "*"),
        rcombinators = new RegExp("^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*"),
        rattributeQuotes = new RegExp("=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g"),
        rpseudo = new RegExp(pseudos),
        ridentifier = new RegExp("^" + identifier + "$"),
        matchExpr = {
          "ID": new RegExp("^#(" + characterEncoding + ")"),
          "CLASS": new RegExp("^\\.(" + characterEncoding + ")"),
          "TAG": new RegExp("^(" + characterEncoding.replace("w", "w*") + ")"),
          "ATTR": new RegExp("^" + attributes),
          "PSEUDO": new RegExp("^" + pseudos),
          "CHILD": new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i"),
          "bool": new RegExp("^(?:" + booleans + ")$", "i"),
          "needsContext": new RegExp("^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i")
        },
        rinputs = /^(?:input|select|textarea|button)$/i,
        rheader = /^h\d$/i,
        rnative = /^[^{]+\{\s*\[native \w/,
        rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
        rsibling = /[+~]/,
        rescape = /'|\\/g,
        runescape = new RegExp("\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig"),
        funescape = function(_, escaped, escapedWhitespace) {
          var high = "0x" + escaped - 0x10000;
          return high !== high || escapedWhitespace ? escaped : high < 0 ? String.fromCharCode(high + 0x10000) : String.fromCharCode(high >> 10 | 0xD800, high & 0x3FF | 0xDC00);
        },
        unloadHandler = function() {
          setDocument();
        };
    try {
      push.apply((arr = slice.call(preferredDoc.childNodes)), preferredDoc.childNodes);
      arr[preferredDoc.childNodes.length].nodeType;
    } catch (e) {
      push = {apply: arr.length ? function(target, els) {
          push_native.apply(target, slice.call(els));
        } : function(target, els) {
          var j = target.length,
              i = 0;
          while ((target[j++] = els[i++])) {}
          target.length = j - 1;
        }};
    }
    function Sizzle(selector, context, results, seed) {
      var match,
          elem,
          m,
          nodeType,
          i,
          groups,
          old,
          nid,
          newContext,
          newSelector;
      if ((context ? context.ownerDocument || context : preferredDoc) !== document) {
        setDocument(context);
      }
      context = context || document;
      results = results || [];
      nodeType = context.nodeType;
      if (typeof selector !== "string" || !selector || nodeType !== 1 && nodeType !== 9 && nodeType !== 11) {
        return results;
      }
      if (!seed && documentIsHTML) {
        if (nodeType !== 11 && (match = rquickExpr.exec(selector))) {
          if ((m = match[1])) {
            if (nodeType === 9) {
              elem = context.getElementById(m);
              if (elem && elem.parentNode) {
                if (elem.id === m) {
                  results.push(elem);
                  return results;
                }
              } else {
                return results;
              }
            } else {
              if (context.ownerDocument && (elem = context.ownerDocument.getElementById(m)) && contains(context, elem) && elem.id === m) {
                results.push(elem);
                return results;
              }
            }
          } else if (match[2]) {
            push.apply(results, context.getElementsByTagName(selector));
            return results;
          } else if ((m = match[3]) && support.getElementsByClassName) {
            push.apply(results, context.getElementsByClassName(m));
            return results;
          }
        }
        if (support.qsa && (!rbuggyQSA || !rbuggyQSA.test(selector))) {
          nid = old = expando;
          newContext = context;
          newSelector = nodeType !== 1 && selector;
          if (nodeType === 1 && context.nodeName.toLowerCase() !== "object") {
            groups = tokenize(selector);
            if ((old = context.getAttribute("id"))) {
              nid = old.replace(rescape, "\\$&");
            } else {
              context.setAttribute("id", nid);
            }
            nid = "[id='" + nid + "'] ";
            i = groups.length;
            while (i--) {
              groups[i] = nid + toSelector(groups[i]);
            }
            newContext = rsibling.test(selector) && testContext(context.parentNode) || context;
            newSelector = groups.join(",");
          }
          if (newSelector) {
            try {
              push.apply(results, newContext.querySelectorAll(newSelector));
              return results;
            } catch (qsaError) {} finally {
              if (!old) {
                context.removeAttribute("id");
              }
            }
          }
        }
      }
      return select(selector.replace(rtrim, "$1"), context, results, seed);
    }
    function createCache() {
      var keys = [];
      function cache(key, value) {
        if (keys.push(key + " ") > Expr.cacheLength) {
          delete cache[keys.shift()];
        }
        return (cache[key + " "] = value);
      }
      return cache;
    }
    function markFunction(fn) {
      fn[expando] = true;
      return fn;
    }
    function assert(fn) {
      var div = document.createElement("div");
      try {
        return !!fn(div);
      } catch (e) {
        return false;
      } finally {
        if (div.parentNode) {
          div.parentNode.removeChild(div);
        }
        div = null;
      }
    }
    function addHandle(attrs, handler) {
      var arr = attrs.split("|"),
          i = attrs.length;
      while (i--) {
        Expr.attrHandle[arr[i]] = handler;
      }
    }
    function siblingCheck(a, b) {
      var cur = b && a,
          diff = cur && a.nodeType === 1 && b.nodeType === 1 && (~b.sourceIndex || MAX_NEGATIVE) - (~a.sourceIndex || MAX_NEGATIVE);
      if (diff) {
        return diff;
      }
      if (cur) {
        while ((cur = cur.nextSibling)) {
          if (cur === b) {
            return -1;
          }
        }
      }
      return a ? 1 : -1;
    }
    function createInputPseudo(type) {
      return function(elem) {
        var name = elem.nodeName.toLowerCase();
        return name === "input" && elem.type === type;
      };
    }
    function createButtonPseudo(type) {
      return function(elem) {
        var name = elem.nodeName.toLowerCase();
        return (name === "input" || name === "button") && elem.type === type;
      };
    }
    function createPositionalPseudo(fn) {
      return markFunction(function(argument) {
        argument = +argument;
        return markFunction(function(seed, matches) {
          var j,
              matchIndexes = fn([], seed.length, argument),
              i = matchIndexes.length;
          while (i--) {
            if (seed[(j = matchIndexes[i])]) {
              seed[j] = !(matches[j] = seed[j]);
            }
          }
        });
      });
    }
    function testContext(context) {
      return context && typeof context.getElementsByTagName !== "undefined" && context;
    }
    support = Sizzle.support = {};
    isXML = Sizzle.isXML = function(elem) {
      var documentElement = elem && (elem.ownerDocument || elem).documentElement;
      return documentElement ? documentElement.nodeName !== "HTML" : false;
    };
    setDocument = Sizzle.setDocument = function(node) {
      var hasCompare,
          parent,
          doc = node ? node.ownerDocument || node : preferredDoc;
      if (doc === document || doc.nodeType !== 9 || !doc.documentElement) {
        return document;
      }
      document = doc;
      docElem = doc.documentElement;
      parent = doc.defaultView;
      if (parent && parent !== parent.top) {
        if (parent.addEventListener) {
          parent.addEventListener("unload", unloadHandler, false);
        } else if (parent.attachEvent) {
          parent.attachEvent("onunload", unloadHandler);
        }
      }
      documentIsHTML = !isXML(doc);
      support.attributes = assert(function(div) {
        div.className = "i";
        return !div.getAttribute("className");
      });
      support.getElementsByTagName = assert(function(div) {
        div.appendChild(doc.createComment(""));
        return !div.getElementsByTagName("*").length;
      });
      support.getElementsByClassName = rnative.test(doc.getElementsByClassName);
      support.getById = assert(function(div) {
        docElem.appendChild(div).id = expando;
        return !doc.getElementsByName || !doc.getElementsByName(expando).length;
      });
      if (support.getById) {
        Expr.find["ID"] = function(id, context) {
          if (typeof context.getElementById !== "undefined" && documentIsHTML) {
            var m = context.getElementById(id);
            return m && m.parentNode ? [m] : [];
          }
        };
        Expr.filter["ID"] = function(id) {
          var attrId = id.replace(runescape, funescape);
          return function(elem) {
            return elem.getAttribute("id") === attrId;
          };
        };
      } else {
        delete Expr.find["ID"];
        Expr.filter["ID"] = function(id) {
          var attrId = id.replace(runescape, funescape);
          return function(elem) {
            var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
            return node && node.value === attrId;
          };
        };
      }
      Expr.find["TAG"] = support.getElementsByTagName ? function(tag, context) {
        if (typeof context.getElementsByTagName !== "undefined") {
          return context.getElementsByTagName(tag);
        } else if (support.qsa) {
          return context.querySelectorAll(tag);
        }
      } : function(tag, context) {
        var elem,
            tmp = [],
            i = 0,
            results = context.getElementsByTagName(tag);
        if (tag === "*") {
          while ((elem = results[i++])) {
            if (elem.nodeType === 1) {
              tmp.push(elem);
            }
          }
          return tmp;
        }
        return results;
      };
      Expr.find["CLASS"] = support.getElementsByClassName && function(className, context) {
        if (documentIsHTML) {
          return context.getElementsByClassName(className);
        }
      };
      rbuggyMatches = [];
      rbuggyQSA = [];
      if ((support.qsa = rnative.test(doc.querySelectorAll))) {
        assert(function(div) {
          docElem.appendChild(div).innerHTML = "<a id='" + expando + "'></a>" + "<select id='" + expando + "-\f]' msallowcapture=''>" + "<option selected=''></option></select>";
          if (div.querySelectorAll("[msallowcapture^='']").length) {
            rbuggyQSA.push("[*^$]=" + whitespace + "*(?:''|\"\")");
          }
          if (!div.querySelectorAll("[selected]").length) {
            rbuggyQSA.push("\\[" + whitespace + "*(?:value|" + booleans + ")");
          }
          if (!div.querySelectorAll("[id~=" + expando + "-]").length) {
            rbuggyQSA.push("~=");
          }
          if (!div.querySelectorAll(":checked").length) {
            rbuggyQSA.push(":checked");
          }
          if (!div.querySelectorAll("a#" + expando + "+*").length) {
            rbuggyQSA.push(".#.+[+~]");
          }
        });
        assert(function(div) {
          var input = doc.createElement("input");
          input.setAttribute("type", "hidden");
          div.appendChild(input).setAttribute("name", "D");
          if (div.querySelectorAll("[name=d]").length) {
            rbuggyQSA.push("name" + whitespace + "*[*^$|!~]?=");
          }
          if (!div.querySelectorAll(":enabled").length) {
            rbuggyQSA.push(":enabled", ":disabled");
          }
          div.querySelectorAll("*,:x");
          rbuggyQSA.push(",.*:");
        });
      }
      if ((support.matchesSelector = rnative.test((matches = docElem.matches || docElem.webkitMatchesSelector || docElem.mozMatchesSelector || docElem.oMatchesSelector || docElem.msMatchesSelector)))) {
        assert(function(div) {
          support.disconnectedMatch = matches.call(div, "div");
          matches.call(div, "[s!='']:x");
          rbuggyMatches.push("!=", pseudos);
        });
      }
      rbuggyQSA = rbuggyQSA.length && new RegExp(rbuggyQSA.join("|"));
      rbuggyMatches = rbuggyMatches.length && new RegExp(rbuggyMatches.join("|"));
      hasCompare = rnative.test(docElem.compareDocumentPosition);
      contains = hasCompare || rnative.test(docElem.contains) ? function(a, b) {
        var adown = a.nodeType === 9 ? a.documentElement : a,
            bup = b && b.parentNode;
        return a === bup || !!(bup && bup.nodeType === 1 && (adown.contains ? adown.contains(bup) : a.compareDocumentPosition && a.compareDocumentPosition(bup) & 16));
      } : function(a, b) {
        if (b) {
          while ((b = b.parentNode)) {
            if (b === a) {
              return true;
            }
          }
        }
        return false;
      };
      sortOrder = hasCompare ? function(a, b) {
        if (a === b) {
          hasDuplicate = true;
          return 0;
        }
        var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
        if (compare) {
          return compare;
        }
        compare = (a.ownerDocument || a) === (b.ownerDocument || b) ? a.compareDocumentPosition(b) : 1;
        if (compare & 1 || (!support.sortDetached && b.compareDocumentPosition(a) === compare)) {
          if (a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a)) {
            return -1;
          }
          if (b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b)) {
            return 1;
          }
          return sortInput ? (indexOf(sortInput, a) - indexOf(sortInput, b)) : 0;
        }
        return compare & 4 ? -1 : 1;
      } : function(a, b) {
        if (a === b) {
          hasDuplicate = true;
          return 0;
        }
        var cur,
            i = 0,
            aup = a.parentNode,
            bup = b.parentNode,
            ap = [a],
            bp = [b];
        if (!aup || !bup) {
          return a === doc ? -1 : b === doc ? 1 : aup ? -1 : bup ? 1 : sortInput ? (indexOf(sortInput, a) - indexOf(sortInput, b)) : 0;
        } else if (aup === bup) {
          return siblingCheck(a, b);
        }
        cur = a;
        while ((cur = cur.parentNode)) {
          ap.unshift(cur);
        }
        cur = b;
        while ((cur = cur.parentNode)) {
          bp.unshift(cur);
        }
        while (ap[i] === bp[i]) {
          i++;
        }
        return i ? siblingCheck(ap[i], bp[i]) : ap[i] === preferredDoc ? -1 : bp[i] === preferredDoc ? 1 : 0;
      };
      return doc;
    };
    Sizzle.matches = function(expr, elements) {
      return Sizzle(expr, null, null, elements);
    };
    Sizzle.matchesSelector = function(elem, expr) {
      if ((elem.ownerDocument || elem) !== document) {
        setDocument(elem);
      }
      expr = expr.replace(rattributeQuotes, "='$1']");
      if (support.matchesSelector && documentIsHTML && (!rbuggyMatches || !rbuggyMatches.test(expr)) && (!rbuggyQSA || !rbuggyQSA.test(expr))) {
        try {
          var ret = matches.call(elem, expr);
          if (ret || support.disconnectedMatch || elem.document && elem.document.nodeType !== 11) {
            return ret;
          }
        } catch (e) {}
      }
      return Sizzle(expr, document, null, [elem]).length > 0;
    };
    Sizzle.contains = function(context, elem) {
      if ((context.ownerDocument || context) !== document) {
        setDocument(context);
      }
      return contains(context, elem);
    };
    Sizzle.attr = function(elem, name) {
      if ((elem.ownerDocument || elem) !== document) {
        setDocument(elem);
      }
      var fn = Expr.attrHandle[name.toLowerCase()],
          val = fn && hasOwn.call(Expr.attrHandle, name.toLowerCase()) ? fn(elem, name, !documentIsHTML) : undefined;
      return val !== undefined ? val : support.attributes || !documentIsHTML ? elem.getAttribute(name) : (val = elem.getAttributeNode(name)) && val.specified ? val.value : null;
    };
    Sizzle.error = function(msg) {
      throw new Error("Syntax error, unrecognized expression: " + msg);
    };
    Sizzle.uniqueSort = function(results) {
      var elem,
          duplicates = [],
          j = 0,
          i = 0;
      hasDuplicate = !support.detectDuplicates;
      sortInput = !support.sortStable && results.slice(0);
      results.sort(sortOrder);
      if (hasDuplicate) {
        while ((elem = results[i++])) {
          if (elem === results[i]) {
            j = duplicates.push(i);
          }
        }
        while (j--) {
          results.splice(duplicates[j], 1);
        }
      }
      sortInput = null;
      return results;
    };
    getText = Sizzle.getText = function(elem) {
      var node,
          ret = "",
          i = 0,
          nodeType = elem.nodeType;
      if (!nodeType) {
        while ((node = elem[i++])) {
          ret += getText(node);
        }
      } else if (nodeType === 1 || nodeType === 9 || nodeType === 11) {
        if (typeof elem.textContent === "string") {
          return elem.textContent;
        } else {
          for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
            ret += getText(elem);
          }
        }
      } else if (nodeType === 3 || nodeType === 4) {
        return elem.nodeValue;
      }
      return ret;
    };
    Expr = Sizzle.selectors = {
      cacheLength: 50,
      createPseudo: markFunction,
      match: matchExpr,
      attrHandle: {},
      find: {},
      relative: {
        ">": {
          dir: "parentNode",
          first: true
        },
        " ": {dir: "parentNode"},
        "+": {
          dir: "previousSibling",
          first: true
        },
        "~": {dir: "previousSibling"}
      },
      preFilter: {
        "ATTR": function(match) {
          match[1] = match[1].replace(runescape, funescape);
          match[3] = (match[3] || match[4] || match[5] || "").replace(runescape, funescape);
          if (match[2] === "~=") {
            match[3] = " " + match[3] + " ";
          }
          return match.slice(0, 4);
        },
        "CHILD": function(match) {
          match[1] = match[1].toLowerCase();
          if (match[1].slice(0, 3) === "nth") {
            if (!match[3]) {
              Sizzle.error(match[0]);
            }
            match[4] = +(match[4] ? match[5] + (match[6] || 1) : 2 * (match[3] === "even" || match[3] === "odd"));
            match[5] = +((match[7] + match[8]) || match[3] === "odd");
          } else if (match[3]) {
            Sizzle.error(match[0]);
          }
          return match;
        },
        "PSEUDO": function(match) {
          var excess,
              unquoted = !match[6] && match[2];
          if (matchExpr["CHILD"].test(match[0])) {
            return null;
          }
          if (match[3]) {
            match[2] = match[4] || match[5] || "";
          } else if (unquoted && rpseudo.test(unquoted) && (excess = tokenize(unquoted, true)) && (excess = unquoted.indexOf(")", unquoted.length - excess) - unquoted.length)) {
            match[0] = match[0].slice(0, excess);
            match[2] = unquoted.slice(0, excess);
          }
          return match.slice(0, 3);
        }
      },
      filter: {
        "TAG": function(nodeNameSelector) {
          var nodeName = nodeNameSelector.replace(runescape, funescape).toLowerCase();
          return nodeNameSelector === "*" ? function() {
            return true;
          } : function(elem) {
            return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
          };
        },
        "CLASS": function(className) {
          var pattern = classCache[className + " "];
          return pattern || (pattern = new RegExp("(^|" + whitespace + ")" + className + "(" + whitespace + "|$)")) && classCache(className, function(elem) {
            return pattern.test(typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "");
          });
        },
        "ATTR": function(name, operator, check) {
          return function(elem) {
            var result = Sizzle.attr(elem, name);
            if (result == null) {
              return operator === "!=";
            }
            if (!operator) {
              return true;
            }
            result += "";
            return operator === "=" ? result === check : operator === "!=" ? result !== check : operator === "^=" ? check && result.indexOf(check) === 0 : operator === "*=" ? check && result.indexOf(check) > -1 : operator === "$=" ? check && result.slice(-check.length) === check : operator === "~=" ? (" " + result.replace(rwhitespace, " ") + " ").indexOf(check) > -1 : operator === "|=" ? result === check || result.slice(0, check.length + 1) === check + "-" : false;
          };
        },
        "CHILD": function(type, what, argument, first, last) {
          var simple = type.slice(0, 3) !== "nth",
              forward = type.slice(-4) !== "last",
              ofType = what === "of-type";
          return first === 1 && last === 0 ? function(elem) {
            return !!elem.parentNode;
          } : function(elem, context, xml) {
            var cache,
                outerCache,
                node,
                diff,
                nodeIndex,
                start,
                dir = simple !== forward ? "nextSibling" : "previousSibling",
                parent = elem.parentNode,
                name = ofType && elem.nodeName.toLowerCase(),
                useCache = !xml && !ofType;
            if (parent) {
              if (simple) {
                while (dir) {
                  node = elem;
                  while ((node = node[dir])) {
                    if (ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1) {
                      return false;
                    }
                  }
                  start = dir = type === "only" && !start && "nextSibling";
                }
                return true;
              }
              start = [forward ? parent.firstChild : parent.lastChild];
              if (forward && useCache) {
                outerCache = parent[expando] || (parent[expando] = {});
                cache = outerCache[type] || [];
                nodeIndex = cache[0] === dirruns && cache[1];
                diff = cache[0] === dirruns && cache[2];
                node = nodeIndex && parent.childNodes[nodeIndex];
                while ((node = ++nodeIndex && node && node[dir] || (diff = nodeIndex = 0) || start.pop())) {
                  if (node.nodeType === 1 && ++diff && node === elem) {
                    outerCache[type] = [dirruns, nodeIndex, diff];
                    break;
                  }
                }
              } else if (useCache && (cache = (elem[expando] || (elem[expando] = {}))[type]) && cache[0] === dirruns) {
                diff = cache[1];
              } else {
                while ((node = ++nodeIndex && node && node[dir] || (diff = nodeIndex = 0) || start.pop())) {
                  if ((ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1) && ++diff) {
                    if (useCache) {
                      (node[expando] || (node[expando] = {}))[type] = [dirruns, diff];
                    }
                    if (node === elem) {
                      break;
                    }
                  }
                }
              }
              diff -= last;
              return diff === first || (diff % first === 0 && diff / first >= 0);
            }
          };
        },
        "PSEUDO": function(pseudo, argument) {
          var args,
              fn = Expr.pseudos[pseudo] || Expr.setFilters[pseudo.toLowerCase()] || Sizzle.error("unsupported pseudo: " + pseudo);
          if (fn[expando]) {
            return fn(argument);
          }
          if (fn.length > 1) {
            args = [pseudo, pseudo, "", argument];
            return Expr.setFilters.hasOwnProperty(pseudo.toLowerCase()) ? markFunction(function(seed, matches) {
              var idx,
                  matched = fn(seed, argument),
                  i = matched.length;
              while (i--) {
                idx = indexOf(seed, matched[i]);
                seed[idx] = !(matches[idx] = matched[i]);
              }
            }) : function(elem) {
              return fn(elem, 0, args);
            };
          }
          return fn;
        }
      },
      pseudos: {
        "not": markFunction(function(selector) {
          var input = [],
              results = [],
              matcher = compile(selector.replace(rtrim, "$1"));
          return matcher[expando] ? markFunction(function(seed, matches, context, xml) {
            var elem,
                unmatched = matcher(seed, null, xml, []),
                i = seed.length;
            while (i--) {
              if ((elem = unmatched[i])) {
                seed[i] = !(matches[i] = elem);
              }
            }
          }) : function(elem, context, xml) {
            input[0] = elem;
            matcher(input, null, xml, results);
            input[0] = null;
            return !results.pop();
          };
        }),
        "has": markFunction(function(selector) {
          return function(elem) {
            return Sizzle(selector, elem).length > 0;
          };
        }),
        "contains": markFunction(function(text) {
          text = text.replace(runescape, funescape);
          return function(elem) {
            return (elem.textContent || elem.innerText || getText(elem)).indexOf(text) > -1;
          };
        }),
        "lang": markFunction(function(lang) {
          if (!ridentifier.test(lang || "")) {
            Sizzle.error("unsupported lang: " + lang);
          }
          lang = lang.replace(runescape, funescape).toLowerCase();
          return function(elem) {
            var elemLang;
            do {
              if ((elemLang = documentIsHTML ? elem.lang : elem.getAttribute("xml:lang") || elem.getAttribute("lang"))) {
                elemLang = elemLang.toLowerCase();
                return elemLang === lang || elemLang.indexOf(lang + "-") === 0;
              }
            } while ((elem = elem.parentNode) && elem.nodeType === 1);
            return false;
          };
        }),
        "target": function(elem) {
          var hash = window.location && window.location.hash;
          return hash && hash.slice(1) === elem.id;
        },
        "root": function(elem) {
          return elem === docElem;
        },
        "focus": function(elem) {
          return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
        },
        "enabled": function(elem) {
          return elem.disabled === false;
        },
        "disabled": function(elem) {
          return elem.disabled === true;
        },
        "checked": function(elem) {
          var nodeName = elem.nodeName.toLowerCase();
          return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
        },
        "selected": function(elem) {
          if (elem.parentNode) {
            elem.parentNode.selectedIndex;
          }
          return elem.selected === true;
        },
        "empty": function(elem) {
          for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
            if (elem.nodeType < 6) {
              return false;
            }
          }
          return true;
        },
        "parent": function(elem) {
          return !Expr.pseudos["empty"](elem);
        },
        "header": function(elem) {
          return rheader.test(elem.nodeName);
        },
        "input": function(elem) {
          return rinputs.test(elem.nodeName);
        },
        "button": function(elem) {
          var name = elem.nodeName.toLowerCase();
          return name === "input" && elem.type === "button" || name === "button";
        },
        "text": function(elem) {
          var attr;
          return elem.nodeName.toLowerCase() === "input" && elem.type === "text" && ((attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text");
        },
        "first": createPositionalPseudo(function() {
          return [0];
        }),
        "last": createPositionalPseudo(function(matchIndexes, length) {
          return [length - 1];
        }),
        "eq": createPositionalPseudo(function(matchIndexes, length, argument) {
          return [argument < 0 ? argument + length : argument];
        }),
        "even": createPositionalPseudo(function(matchIndexes, length) {
          var i = 0;
          for (; i < length; i += 2) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "odd": createPositionalPseudo(function(matchIndexes, length) {
          var i = 1;
          for (; i < length; i += 2) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "lt": createPositionalPseudo(function(matchIndexes, length, argument) {
          var i = argument < 0 ? argument + length : argument;
          for (; --i >= 0; ) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "gt": createPositionalPseudo(function(matchIndexes, length, argument) {
          var i = argument < 0 ? argument + length : argument;
          for (; ++i < length; ) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        })
      }
    };
    Expr.pseudos["nth"] = Expr.pseudos["eq"];
    for (i in {
      radio: true,
      checkbox: true,
      file: true,
      password: true,
      image: true
    }) {
      Expr.pseudos[i] = createInputPseudo(i);
    }
    for (i in {
      submit: true,
      reset: true
    }) {
      Expr.pseudos[i] = createButtonPseudo(i);
    }
    function setFilters() {}
    setFilters.prototype = Expr.filters = Expr.pseudos;
    Expr.setFilters = new setFilters();
    tokenize = Sizzle.tokenize = function(selector, parseOnly) {
      var matched,
          match,
          tokens,
          type,
          soFar,
          groups,
          preFilters,
          cached = tokenCache[selector + " "];
      if (cached) {
        return parseOnly ? 0 : cached.slice(0);
      }
      soFar = selector;
      groups = [];
      preFilters = Expr.preFilter;
      while (soFar) {
        if (!matched || (match = rcomma.exec(soFar))) {
          if (match) {
            soFar = soFar.slice(match[0].length) || soFar;
          }
          groups.push((tokens = []));
        }
        matched = false;
        if ((match = rcombinators.exec(soFar))) {
          matched = match.shift();
          tokens.push({
            value: matched,
            type: match[0].replace(rtrim, " ")
          });
          soFar = soFar.slice(matched.length);
        }
        for (type in Expr.filter) {
          if ((match = matchExpr[type].exec(soFar)) && (!preFilters[type] || (match = preFilters[type](match)))) {
            matched = match.shift();
            tokens.push({
              value: matched,
              type: type,
              matches: match
            });
            soFar = soFar.slice(matched.length);
          }
        }
        if (!matched) {
          break;
        }
      }
      return parseOnly ? soFar.length : soFar ? Sizzle.error(selector) : tokenCache(selector, groups).slice(0);
    };
    function toSelector(tokens) {
      var i = 0,
          len = tokens.length,
          selector = "";
      for (; i < len; i++) {
        selector += tokens[i].value;
      }
      return selector;
    }
    function addCombinator(matcher, combinator, base) {
      var dir = combinator.dir,
          checkNonElements = base && dir === "parentNode",
          doneName = done++;
      return combinator.first ? function(elem, context, xml) {
        while ((elem = elem[dir])) {
          if (elem.nodeType === 1 || checkNonElements) {
            return matcher(elem, context, xml);
          }
        }
      } : function(elem, context, xml) {
        var oldCache,
            outerCache,
            newCache = [dirruns, doneName];
        if (xml) {
          while ((elem = elem[dir])) {
            if (elem.nodeType === 1 || checkNonElements) {
              if (matcher(elem, context, xml)) {
                return true;
              }
            }
          }
        } else {
          while ((elem = elem[dir])) {
            if (elem.nodeType === 1 || checkNonElements) {
              outerCache = elem[expando] || (elem[expando] = {});
              if ((oldCache = outerCache[dir]) && oldCache[0] === dirruns && oldCache[1] === doneName) {
                return (newCache[2] = oldCache[2]);
              } else {
                outerCache[dir] = newCache;
                if ((newCache[2] = matcher(elem, context, xml))) {
                  return true;
                }
              }
            }
          }
        }
      };
    }
    function elementMatcher(matchers) {
      return matchers.length > 1 ? function(elem, context, xml) {
        var i = matchers.length;
        while (i--) {
          if (!matchers[i](elem, context, xml)) {
            return false;
          }
        }
        return true;
      } : matchers[0];
    }
    function multipleContexts(selector, contexts, results) {
      var i = 0,
          len = contexts.length;
      for (; i < len; i++) {
        Sizzle(selector, contexts[i], results);
      }
      return results;
    }
    function condense(unmatched, map, filter, context, xml) {
      var elem,
          newUnmatched = [],
          i = 0,
          len = unmatched.length,
          mapped = map != null;
      for (; i < len; i++) {
        if ((elem = unmatched[i])) {
          if (!filter || filter(elem, context, xml)) {
            newUnmatched.push(elem);
            if (mapped) {
              map.push(i);
            }
          }
        }
      }
      return newUnmatched;
    }
    function setMatcher(preFilter, selector, matcher, postFilter, postFinder, postSelector) {
      if (postFilter && !postFilter[expando]) {
        postFilter = setMatcher(postFilter);
      }
      if (postFinder && !postFinder[expando]) {
        postFinder = setMatcher(postFinder, postSelector);
      }
      return markFunction(function(seed, results, context, xml) {
        var temp,
            i,
            elem,
            preMap = [],
            postMap = [],
            preexisting = results.length,
            elems = seed || multipleContexts(selector || "*", context.nodeType ? [context] : context, []),
            matcherIn = preFilter && (seed || !selector) ? condense(elems, preMap, preFilter, context, xml) : elems,
            matcherOut = matcher ? postFinder || (seed ? preFilter : preexisting || postFilter) ? [] : results : matcherIn;
        if (matcher) {
          matcher(matcherIn, matcherOut, context, xml);
        }
        if (postFilter) {
          temp = condense(matcherOut, postMap);
          postFilter(temp, [], context, xml);
          i = temp.length;
          while (i--) {
            if ((elem = temp[i])) {
              matcherOut[postMap[i]] = !(matcherIn[postMap[i]] = elem);
            }
          }
        }
        if (seed) {
          if (postFinder || preFilter) {
            if (postFinder) {
              temp = [];
              i = matcherOut.length;
              while (i--) {
                if ((elem = matcherOut[i])) {
                  temp.push((matcherIn[i] = elem));
                }
              }
              postFinder(null, (matcherOut = []), temp, xml);
            }
            i = matcherOut.length;
            while (i--) {
              if ((elem = matcherOut[i]) && (temp = postFinder ? indexOf(seed, elem) : preMap[i]) > -1) {
                seed[temp] = !(results[temp] = elem);
              }
            }
          }
        } else {
          matcherOut = condense(matcherOut === results ? matcherOut.splice(preexisting, matcherOut.length) : matcherOut);
          if (postFinder) {
            postFinder(null, results, matcherOut, xml);
          } else {
            push.apply(results, matcherOut);
          }
        }
      });
    }
    function matcherFromTokens(tokens) {
      var checkContext,
          matcher,
          j,
          len = tokens.length,
          leadingRelative = Expr.relative[tokens[0].type],
          implicitRelative = leadingRelative || Expr.relative[" "],
          i = leadingRelative ? 1 : 0,
          matchContext = addCombinator(function(elem) {
            return elem === checkContext;
          }, implicitRelative, true),
          matchAnyContext = addCombinator(function(elem) {
            return indexOf(checkContext, elem) > -1;
          }, implicitRelative, true),
          matchers = [function(elem, context, xml) {
            var ret = (!leadingRelative && (xml || context !== outermostContext)) || ((checkContext = context).nodeType ? matchContext(elem, context, xml) : matchAnyContext(elem, context, xml));
            checkContext = null;
            return ret;
          }];
      for (; i < len; i++) {
        if ((matcher = Expr.relative[tokens[i].type])) {
          matchers = [addCombinator(elementMatcher(matchers), matcher)];
        } else {
          matcher = Expr.filter[tokens[i].type].apply(null, tokens[i].matches);
          if (matcher[expando]) {
            j = ++i;
            for (; j < len; j++) {
              if (Expr.relative[tokens[j].type]) {
                break;
              }
            }
            return setMatcher(i > 1 && elementMatcher(matchers), i > 1 && toSelector(tokens.slice(0, i - 1).concat({value: tokens[i - 2].type === " " ? "*" : ""})).replace(rtrim, "$1"), matcher, i < j && matcherFromTokens(tokens.slice(i, j)), j < len && matcherFromTokens((tokens = tokens.slice(j))), j < len && toSelector(tokens));
          }
          matchers.push(matcher);
        }
      }
      return elementMatcher(matchers);
    }
    function matcherFromGroupMatchers(elementMatchers, setMatchers) {
      var bySet = setMatchers.length > 0,
          byElement = elementMatchers.length > 0,
          superMatcher = function(seed, context, xml, results, outermost) {
            var elem,
                j,
                matcher,
                matchedCount = 0,
                i = "0",
                unmatched = seed && [],
                setMatched = [],
                contextBackup = outermostContext,
                elems = seed || byElement && Expr.find["TAG"]("*", outermost),
                dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
                len = elems.length;
            if (outermost) {
              outermostContext = context !== document && context;
            }
            for (; i !== len && (elem = elems[i]) != null; i++) {
              if (byElement && elem) {
                j = 0;
                while ((matcher = elementMatchers[j++])) {
                  if (matcher(elem, context, xml)) {
                    results.push(elem);
                    break;
                  }
                }
                if (outermost) {
                  dirruns = dirrunsUnique;
                }
              }
              if (bySet) {
                if ((elem = !matcher && elem)) {
                  matchedCount--;
                }
                if (seed) {
                  unmatched.push(elem);
                }
              }
            }
            matchedCount += i;
            if (bySet && i !== matchedCount) {
              j = 0;
              while ((matcher = setMatchers[j++])) {
                matcher(unmatched, setMatched, context, xml);
              }
              if (seed) {
                if (matchedCount > 0) {
                  while (i--) {
                    if (!(unmatched[i] || setMatched[i])) {
                      setMatched[i] = pop.call(results);
                    }
                  }
                }
                setMatched = condense(setMatched);
              }
              push.apply(results, setMatched);
              if (outermost && !seed && setMatched.length > 0 && (matchedCount + setMatchers.length) > 1) {
                Sizzle.uniqueSort(results);
              }
            }
            if (outermost) {
              dirruns = dirrunsUnique;
              outermostContext = contextBackup;
            }
            return unmatched;
          };
      return bySet ? markFunction(superMatcher) : superMatcher;
    }
    compile = Sizzle.compile = function(selector, match) {
      var i,
          setMatchers = [],
          elementMatchers = [],
          cached = compilerCache[selector + " "];
      if (!cached) {
        if (!match) {
          match = tokenize(selector);
        }
        i = match.length;
        while (i--) {
          cached = matcherFromTokens(match[i]);
          if (cached[expando]) {
            setMatchers.push(cached);
          } else {
            elementMatchers.push(cached);
          }
        }
        cached = compilerCache(selector, matcherFromGroupMatchers(elementMatchers, setMatchers));
        cached.selector = selector;
      }
      return cached;
    };
    select = Sizzle.select = function(selector, context, results, seed) {
      var i,
          tokens,
          token,
          type,
          find,
          compiled = typeof selector === "function" && selector,
          match = !seed && tokenize((selector = compiled.selector || selector));
      results = results || [];
      if (match.length === 1) {
        tokens = match[0] = match[0].slice(0);
        if (tokens.length > 2 && (token = tokens[0]).type === "ID" && support.getById && context.nodeType === 9 && documentIsHTML && Expr.relative[tokens[1].type]) {
          context = (Expr.find["ID"](token.matches[0].replace(runescape, funescape), context) || [])[0];
          if (!context) {
            return results;
          } else if (compiled) {
            context = context.parentNode;
          }
          selector = selector.slice(tokens.shift().value.length);
        }
        i = matchExpr["needsContext"].test(selector) ? 0 : tokens.length;
        while (i--) {
          token = tokens[i];
          if (Expr.relative[(type = token.type)]) {
            break;
          }
          if ((find = Expr.find[type])) {
            if ((seed = find(token.matches[0].replace(runescape, funescape), rsibling.test(tokens[0].type) && testContext(context.parentNode) || context))) {
              tokens.splice(i, 1);
              selector = seed.length && toSelector(tokens);
              if (!selector) {
                push.apply(results, seed);
                return results;
              }
              break;
            }
          }
        }
      }
      (compiled || compile(selector, match))(seed, context, !documentIsHTML, results, rsibling.test(selector) && testContext(context.parentNode) || context);
      return results;
    };
    support.sortStable = expando.split("").sort(sortOrder).join("") === expando;
    support.detectDuplicates = !!hasDuplicate;
    setDocument();
    support.sortDetached = assert(function(div1) {
      return div1.compareDocumentPosition(document.createElement("div")) & 1;
    });
    if (!assert(function(div) {
      div.innerHTML = "<a href='#'></a>";
      return div.firstChild.getAttribute("href") === "#";
    })) {
      addHandle("type|href|height|width", function(elem, name, isXML) {
        if (!isXML) {
          return elem.getAttribute(name, name.toLowerCase() === "type" ? 1 : 2);
        }
      });
    }
    if (!support.attributes || !assert(function(div) {
      div.innerHTML = "<input/>";
      div.firstChild.setAttribute("value", "");
      return div.firstChild.getAttribute("value") === "";
    })) {
      addHandle("value", function(elem, name, isXML) {
        if (!isXML && elem.nodeName.toLowerCase() === "input") {
          return elem.defaultValue;
        }
      });
    }
    if (!assert(function(div) {
      return div.getAttribute("disabled") == null;
    })) {
      addHandle(booleans, function(elem, name, isXML) {
        var val;
        if (!isXML) {
          return elem[name] === true ? name.toLowerCase() : (val = elem.getAttributeNode(name)) && val.specified ? val.value : null;
        }
      });
    }
    return Sizzle;
  })(window);
  jQuery.find = Sizzle;
  jQuery.expr = Sizzle.selectors;
  jQuery.expr[":"] = jQuery.expr.pseudos;
  jQuery.unique = Sizzle.uniqueSort;
  jQuery.text = Sizzle.getText;
  jQuery.isXMLDoc = Sizzle.isXML;
  jQuery.contains = Sizzle.contains;
  var rneedsContext = jQuery.expr.match.needsContext;
  var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);
  var risSimple = /^.[^:#\[\.,]*$/;
  function winnow(elements, qualifier, not) {
    if (jQuery.isFunction(qualifier)) {
      return jQuery.grep(elements, function(elem, i) {
        return !!qualifier.call(elem, i, elem) !== not;
      });
    }
    if (qualifier.nodeType) {
      return jQuery.grep(elements, function(elem) {
        return (elem === qualifier) !== not;
      });
    }
    if (typeof qualifier === "string") {
      if (risSimple.test(qualifier)) {
        return jQuery.filter(qualifier, elements, not);
      }
      qualifier = jQuery.filter(qualifier, elements);
    }
    return jQuery.grep(elements, function(elem) {
      return (indexOf.call(qualifier, elem) >= 0) !== not;
    });
  }
  jQuery.filter = function(expr, elems, not) {
    var elem = elems[0];
    if (not) {
      expr = ":not(" + expr + ")";
    }
    return elems.length === 1 && elem.nodeType === 1 ? jQuery.find.matchesSelector(elem, expr) ? [elem] : [] : jQuery.find.matches(expr, jQuery.grep(elems, function(elem) {
      return elem.nodeType === 1;
    }));
  };
  jQuery.fn.extend({
    find: function(selector) {
      var i,
          len = this.length,
          ret = [],
          self = this;
      if (typeof selector !== "string") {
        return this.pushStack(jQuery(selector).filter(function() {
          for (i = 0; i < len; i++) {
            if (jQuery.contains(self[i], this)) {
              return true;
            }
          }
        }));
      }
      for (i = 0; i < len; i++) {
        jQuery.find(selector, self[i], ret);
      }
      ret = this.pushStack(len > 1 ? jQuery.unique(ret) : ret);
      ret.selector = this.selector ? this.selector + " " + selector : selector;
      return ret;
    },
    filter: function(selector) {
      return this.pushStack(winnow(this, selector || [], false));
    },
    not: function(selector) {
      return this.pushStack(winnow(this, selector || [], true));
    },
    is: function(selector) {
      return !!winnow(this, typeof selector === "string" && rneedsContext.test(selector) ? jQuery(selector) : selector || [], false).length;
    }
  });
  var rootjQuery,
      rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,
      init = jQuery.fn.init = function(selector, context) {
        var match,
            elem;
        if (!selector) {
          return this;
        }
        if (typeof selector === "string") {
          if (selector[0] === "<" && selector[selector.length - 1] === ">" && selector.length >= 3) {
            match = [null, selector, null];
          } else {
            match = rquickExpr.exec(selector);
          }
          if (match && (match[1] || !context)) {
            if (match[1]) {
              context = context instanceof jQuery ? context[0] : context;
              jQuery.merge(this, jQuery.parseHTML(match[1], context && context.nodeType ? context.ownerDocument || context : document, true));
              if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) {
                for (match in context) {
                  if (jQuery.isFunction(this[match])) {
                    this[match](context[match]);
                  } else {
                    this.attr(match, context[match]);
                  }
                }
              }
              return this;
            } else {
              elem = document.getElementById(match[2]);
              if (elem && elem.parentNode) {
                this.length = 1;
                this[0] = elem;
              }
              this.context = document;
              this.selector = selector;
              return this;
            }
          } else if (!context || context.jquery) {
            return (context || rootjQuery).find(selector);
          } else {
            return this.constructor(context).find(selector);
          }
        } else if (selector.nodeType) {
          this.context = this[0] = selector;
          this.length = 1;
          return this;
        } else if (jQuery.isFunction(selector)) {
          return typeof rootjQuery.ready !== "undefined" ? rootjQuery.ready(selector) : selector(jQuery);
        }
        if (selector.selector !== undefined) {
          this.selector = selector.selector;
          this.context = selector.context;
        }
        return jQuery.makeArray(selector, this);
      };
  init.prototype = jQuery.fn;
  rootjQuery = jQuery(document);
  var rparentsprev = /^(?:parents|prev(?:Until|All))/,
      guaranteedUnique = {
        children: true,
        contents: true,
        next: true,
        prev: true
      };
  jQuery.extend({
    dir: function(elem, dir, until) {
      var matched = [],
          truncate = until !== undefined;
      while ((elem = elem[dir]) && elem.nodeType !== 9) {
        if (elem.nodeType === 1) {
          if (truncate && jQuery(elem).is(until)) {
            break;
          }
          matched.push(elem);
        }
      }
      return matched;
    },
    sibling: function(n, elem) {
      var matched = [];
      for (; n; n = n.nextSibling) {
        if (n.nodeType === 1 && n !== elem) {
          matched.push(n);
        }
      }
      return matched;
    }
  });
  jQuery.fn.extend({
    has: function(target) {
      var targets = jQuery(target, this),
          l = targets.length;
      return this.filter(function() {
        var i = 0;
        for (; i < l; i++) {
          if (jQuery.contains(this, targets[i])) {
            return true;
          }
        }
      });
    },
    closest: function(selectors, context) {
      var cur,
          i = 0,
          l = this.length,
          matched = [],
          pos = rneedsContext.test(selectors) || typeof selectors !== "string" ? jQuery(selectors, context || this.context) : 0;
      for (; i < l; i++) {
        for (cur = this[i]; cur && cur !== context; cur = cur.parentNode) {
          if (cur.nodeType < 11 && (pos ? pos.index(cur) > -1 : cur.nodeType === 1 && jQuery.find.matchesSelector(cur, selectors))) {
            matched.push(cur);
            break;
          }
        }
      }
      return this.pushStack(matched.length > 1 ? jQuery.unique(matched) : matched);
    },
    index: function(elem) {
      if (!elem) {
        return (this[0] && this[0].parentNode) ? this.first().prevAll().length : -1;
      }
      if (typeof elem === "string") {
        return indexOf.call(jQuery(elem), this[0]);
      }
      return indexOf.call(this, elem.jquery ? elem[0] : elem);
    },
    add: function(selector, context) {
      return this.pushStack(jQuery.unique(jQuery.merge(this.get(), jQuery(selector, context))));
    },
    addBack: function(selector) {
      return this.add(selector == null ? this.prevObject : this.prevObject.filter(selector));
    }
  });
  function sibling(cur, dir) {
    while ((cur = cur[dir]) && cur.nodeType !== 1) {}
    return cur;
  }
  jQuery.each({
    parent: function(elem) {
      var parent = elem.parentNode;
      return parent && parent.nodeType !== 11 ? parent : null;
    },
    parents: function(elem) {
      return jQuery.dir(elem, "parentNode");
    },
    parentsUntil: function(elem, i, until) {
      return jQuery.dir(elem, "parentNode", until);
    },
    next: function(elem) {
      return sibling(elem, "nextSibling");
    },
    prev: function(elem) {
      return sibling(elem, "previousSibling");
    },
    nextAll: function(elem) {
      return jQuery.dir(elem, "nextSibling");
    },
    prevAll: function(elem) {
      return jQuery.dir(elem, "previousSibling");
    },
    nextUntil: function(elem, i, until) {
      return jQuery.dir(elem, "nextSibling", until);
    },
    prevUntil: function(elem, i, until) {
      return jQuery.dir(elem, "previousSibling", until);
    },
    siblings: function(elem) {
      return jQuery.sibling((elem.parentNode || {}).firstChild, elem);
    },
    children: function(elem) {
      return jQuery.sibling(elem.firstChild);
    },
    contents: function(elem) {
      return elem.contentDocument || jQuery.merge([], elem.childNodes);
    }
  }, function(name, fn) {
    jQuery.fn[name] = function(until, selector) {
      var matched = jQuery.map(this, fn, until);
      if (name.slice(-5) !== "Until") {
        selector = until;
      }
      if (selector && typeof selector === "string") {
        matched = jQuery.filter(selector, matched);
      }
      if (this.length > 1) {
        if (!guaranteedUnique[name]) {
          jQuery.unique(matched);
        }
        if (rparentsprev.test(name)) {
          matched.reverse();
        }
      }
      return this.pushStack(matched);
    };
  });
  var rnotwhite = (/\S+/g);
  var optionsCache = {};
  function createOptions(options) {
    var object = optionsCache[options] = {};
    jQuery.each(options.match(rnotwhite) || [], function(_, flag) {
      object[flag] = true;
    });
    return object;
  }
  jQuery.Callbacks = function(options) {
    options = typeof options === "string" ? (optionsCache[options] || createOptions(options)) : jQuery.extend({}, options);
    var memory,
        fired,
        firing,
        firingStart,
        firingLength,
        firingIndex,
        list = [],
        stack = !options.once && [],
        fire = function(data) {
          memory = options.memory && data;
          fired = true;
          firingIndex = firingStart || 0;
          firingStart = 0;
          firingLength = list.length;
          firing = true;
          for (; list && firingIndex < firingLength; firingIndex++) {
            if (list[firingIndex].apply(data[0], data[1]) === false && options.stopOnFalse) {
              memory = false;
              break;
            }
          }
          firing = false;
          if (list) {
            if (stack) {
              if (stack.length) {
                fire(stack.shift());
              }
            } else if (memory) {
              list = [];
            } else {
              self.disable();
            }
          }
        },
        self = {
          add: function() {
            if (list) {
              var start = list.length;
              (function add(args) {
                jQuery.each(args, function(_, arg) {
                  var type = jQuery.type(arg);
                  if (type === "function") {
                    if (!options.unique || !self.has(arg)) {
                      list.push(arg);
                    }
                  } else if (arg && arg.length && type !== "string") {
                    add(arg);
                  }
                });
              })(arguments);
              if (firing) {
                firingLength = list.length;
              } else if (memory) {
                firingStart = start;
                fire(memory);
              }
            }
            return this;
          },
          remove: function() {
            if (list) {
              jQuery.each(arguments, function(_, arg) {
                var index;
                while ((index = jQuery.inArray(arg, list, index)) > -1) {
                  list.splice(index, 1);
                  if (firing) {
                    if (index <= firingLength) {
                      firingLength--;
                    }
                    if (index <= firingIndex) {
                      firingIndex--;
                    }
                  }
                }
              });
            }
            return this;
          },
          has: function(fn) {
            return fn ? jQuery.inArray(fn, list) > -1 : !!(list && list.length);
          },
          empty: function() {
            list = [];
            firingLength = 0;
            return this;
          },
          disable: function() {
            list = stack = memory = undefined;
            return this;
          },
          disabled: function() {
            return !list;
          },
          lock: function() {
            stack = undefined;
            if (!memory) {
              self.disable();
            }
            return this;
          },
          locked: function() {
            return !stack;
          },
          fireWith: function(context, args) {
            if (list && (!fired || stack)) {
              args = args || [];
              args = [context, args.slice ? args.slice() : args];
              if (firing) {
                stack.push(args);
              } else {
                fire(args);
              }
            }
            return this;
          },
          fire: function() {
            self.fireWith(this, arguments);
            return this;
          },
          fired: function() {
            return !!fired;
          }
        };
    return self;
  };
  jQuery.extend({
    Deferred: function(func) {
      var tuples = [["resolve", "done", jQuery.Callbacks("once memory"), "resolved"], ["reject", "fail", jQuery.Callbacks("once memory"), "rejected"], ["notify", "progress", jQuery.Callbacks("memory")]],
          state = "pending",
          promise = {
            state: function() {
              return state;
            },
            always: function() {
              deferred.done(arguments).fail(arguments);
              return this;
            },
            then: function() {
              var fns = arguments;
              return jQuery.Deferred(function(newDefer) {
                jQuery.each(tuples, function(i, tuple) {
                  var fn = jQuery.isFunction(fns[i]) && fns[i];
                  deferred[tuple[1]](function() {
                    var returned = fn && fn.apply(this, arguments);
                    if (returned && jQuery.isFunction(returned.promise)) {
                      returned.promise().done(newDefer.resolve).fail(newDefer.reject).progress(newDefer.notify);
                    } else {
                      newDefer[tuple[0] + "With"](this === promise ? newDefer.promise() : this, fn ? [returned] : arguments);
                    }
                  });
                });
                fns = null;
              }).promise();
            },
            promise: function(obj) {
              return obj != null ? jQuery.extend(obj, promise) : promise;
            }
          },
          deferred = {};
      promise.pipe = promise.then;
      jQuery.each(tuples, function(i, tuple) {
        var list = tuple[2],
            stateString = tuple[3];
        promise[tuple[1]] = list.add;
        if (stateString) {
          list.add(function() {
            state = stateString;
          }, tuples[i ^ 1][2].disable, tuples[2][2].lock);
        }
        deferred[tuple[0]] = function() {
          deferred[tuple[0] + "With"](this === deferred ? promise : this, arguments);
          return this;
        };
        deferred[tuple[0] + "With"] = list.fireWith;
      });
      promise.promise(deferred);
      if (func) {
        func.call(deferred, deferred);
      }
      return deferred;
    },
    when: function(subordinate) {
      var i = 0,
          resolveValues = slice.call(arguments),
          length = resolveValues.length,
          remaining = length !== 1 || (subordinate && jQuery.isFunction(subordinate.promise)) ? length : 0,
          deferred = remaining === 1 ? subordinate : jQuery.Deferred(),
          updateFunc = function(i, contexts, values) {
            return function(value) {
              contexts[i] = this;
              values[i] = arguments.length > 1 ? slice.call(arguments) : value;
              if (values === progressValues) {
                deferred.notifyWith(contexts, values);
              } else if (!(--remaining)) {
                deferred.resolveWith(contexts, values);
              }
            };
          },
          progressValues,
          progressContexts,
          resolveContexts;
      if (length > 1) {
        progressValues = new Array(length);
        progressContexts = new Array(length);
        resolveContexts = new Array(length);
        for (; i < length; i++) {
          if (resolveValues[i] && jQuery.isFunction(resolveValues[i].promise)) {
            resolveValues[i].promise().done(updateFunc(i, resolveContexts, resolveValues)).fail(deferred.reject).progress(updateFunc(i, progressContexts, progressValues));
          } else {
            --remaining;
          }
        }
      }
      if (!remaining) {
        deferred.resolveWith(resolveContexts, resolveValues);
      }
      return deferred.promise();
    }
  });
  var readyList;
  jQuery.fn.ready = function(fn) {
    jQuery.ready.promise().done(fn);
    return this;
  };
  jQuery.extend({
    isReady: false,
    readyWait: 1,
    holdReady: function(hold) {
      if (hold) {
        jQuery.readyWait++;
      } else {
        jQuery.ready(true);
      }
    },
    ready: function(wait) {
      if (wait === true ? --jQuery.readyWait : jQuery.isReady) {
        return;
      }
      jQuery.isReady = true;
      if (wait !== true && --jQuery.readyWait > 0) {
        return;
      }
      readyList.resolveWith(document, [jQuery]);
      if (jQuery.fn.triggerHandler) {
        jQuery(document).triggerHandler("ready");
        jQuery(document).off("ready");
      }
    }
  });
  function completed() {
    document.removeEventListener("DOMContentLoaded", completed, false);
    window.removeEventListener("load", completed, false);
    jQuery.ready();
  }
  jQuery.ready.promise = function(obj) {
    if (!readyList) {
      readyList = jQuery.Deferred();
      if (document.readyState === "complete") {
        setTimeout(jQuery.ready);
      } else {
        document.addEventListener("DOMContentLoaded", completed, false);
        window.addEventListener("load", completed, false);
      }
    }
    return readyList.promise(obj);
  };
  jQuery.ready.promise();
  var access = jQuery.access = function(elems, fn, key, value, chainable, emptyGet, raw) {
    var i = 0,
        len = elems.length,
        bulk = key == null;
    if (jQuery.type(key) === "object") {
      chainable = true;
      for (i in key) {
        jQuery.access(elems, fn, i, key[i], true, emptyGet, raw);
      }
    } else if (value !== undefined) {
      chainable = true;
      if (!jQuery.isFunction(value)) {
        raw = true;
      }
      if (bulk) {
        if (raw) {
          fn.call(elems, value);
          fn = null;
        } else {
          bulk = fn;
          fn = function(elem, key, value) {
            return bulk.call(jQuery(elem), value);
          };
        }
      }
      if (fn) {
        for (; i < len; i++) {
          fn(elems[i], key, raw ? value : value.call(elems[i], i, fn(elems[i], key)));
        }
      }
    }
    return chainable ? elems : bulk ? fn.call(elems) : len ? fn(elems[0], key) : emptyGet;
  };
  jQuery.acceptData = function(owner) {
    return owner.nodeType === 1 || owner.nodeType === 9 || !(+owner.nodeType);
  };
  function Data() {
    Object.defineProperty(this.cache = {}, 0, {get: function() {
        return {};
      }});
    this.expando = jQuery.expando + Data.uid++;
  }
  Data.uid = 1;
  Data.accepts = jQuery.acceptData;
  Data.prototype = {
    key: function(owner) {
      if (!Data.accepts(owner)) {
        return 0;
      }
      var descriptor = {},
          unlock = owner[this.expando];
      if (!unlock) {
        unlock = Data.uid++;
        try {
          descriptor[this.expando] = {value: unlock};
          Object.defineProperties(owner, descriptor);
        } catch (e) {
          descriptor[this.expando] = unlock;
          jQuery.extend(owner, descriptor);
        }
      }
      if (!this.cache[unlock]) {
        this.cache[unlock] = {};
      }
      return unlock;
    },
    set: function(owner, data, value) {
      var prop,
          unlock = this.key(owner),
          cache = this.cache[unlock];
      if (typeof data === "string") {
        cache[data] = value;
      } else {
        if (jQuery.isEmptyObject(cache)) {
          jQuery.extend(this.cache[unlock], data);
        } else {
          for (prop in data) {
            cache[prop] = data[prop];
          }
        }
      }
      return cache;
    },
    get: function(owner, key) {
      var cache = this.cache[this.key(owner)];
      return key === undefined ? cache : cache[key];
    },
    access: function(owner, key, value) {
      var stored;
      if (key === undefined || ((key && typeof key === "string") && value === undefined)) {
        stored = this.get(owner, key);
        return stored !== undefined ? stored : this.get(owner, jQuery.camelCase(key));
      }
      this.set(owner, key, value);
      return value !== undefined ? value : key;
    },
    remove: function(owner, key) {
      var i,
          name,
          camel,
          unlock = this.key(owner),
          cache = this.cache[unlock];
      if (key === undefined) {
        this.cache[unlock] = {};
      } else {
        if (jQuery.isArray(key)) {
          name = key.concat(key.map(jQuery.camelCase));
        } else {
          camel = jQuery.camelCase(key);
          if (key in cache) {
            name = [key, camel];
          } else {
            name = camel;
            name = name in cache ? [name] : (name.match(rnotwhite) || []);
          }
        }
        i = name.length;
        while (i--) {
          delete cache[name[i]];
        }
      }
    },
    hasData: function(owner) {
      return !jQuery.isEmptyObject(this.cache[owner[this.expando]] || {});
    },
    discard: function(owner) {
      if (owner[this.expando]) {
        delete this.cache[owner[this.expando]];
      }
    }
  };
  var data_priv = new Data();
  var data_user = new Data();
  var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
      rmultiDash = /([A-Z])/g;
  function dataAttr(elem, key, data) {
    var name;
    if (data === undefined && elem.nodeType === 1) {
      name = "data-" + key.replace(rmultiDash, "-$1").toLowerCase();
      data = elem.getAttribute(name);
      if (typeof data === "string") {
        try {
          data = data === "true" ? true : data === "false" ? false : data === "null" ? null : +data + "" === data ? +data : rbrace.test(data) ? jQuery.parseJSON(data) : data;
        } catch (e) {}
        data_user.set(elem, key, data);
      } else {
        data = undefined;
      }
    }
    return data;
  }
  jQuery.extend({
    hasData: function(elem) {
      return data_user.hasData(elem) || data_priv.hasData(elem);
    },
    data: function(elem, name, data) {
      return data_user.access(elem, name, data);
    },
    removeData: function(elem, name) {
      data_user.remove(elem, name);
    },
    _data: function(elem, name, data) {
      return data_priv.access(elem, name, data);
    },
    _removeData: function(elem, name) {
      data_priv.remove(elem, name);
    }
  });
  jQuery.fn.extend({
    data: function(key, value) {
      var i,
          name,
          data,
          elem = this[0],
          attrs = elem && elem.attributes;
      if (key === undefined) {
        if (this.length) {
          data = data_user.get(elem);
          if (elem.nodeType === 1 && !data_priv.get(elem, "hasDataAttrs")) {
            i = attrs.length;
            while (i--) {
              if (attrs[i]) {
                name = attrs[i].name;
                if (name.indexOf("data-") === 0) {
                  name = jQuery.camelCase(name.slice(5));
                  dataAttr(elem, name, data[name]);
                }
              }
            }
            data_priv.set(elem, "hasDataAttrs", true);
          }
        }
        return data;
      }
      if (typeof key === "object") {
        return this.each(function() {
          data_user.set(this, key);
        });
      }
      return access(this, function(value) {
        var data,
            camelKey = jQuery.camelCase(key);
        if (elem && value === undefined) {
          data = data_user.get(elem, key);
          if (data !== undefined) {
            return data;
          }
          data = data_user.get(elem, camelKey);
          if (data !== undefined) {
            return data;
          }
          data = dataAttr(elem, camelKey, undefined);
          if (data !== undefined) {
            return data;
          }
          return;
        }
        this.each(function() {
          var data = data_user.get(this, camelKey);
          data_user.set(this, camelKey, value);
          if (key.indexOf("-") !== -1 && data !== undefined) {
            data_user.set(this, key, value);
          }
        });
      }, null, value, arguments.length > 1, null, true);
    },
    removeData: function(key) {
      return this.each(function() {
        data_user.remove(this, key);
      });
    }
  });
  jQuery.extend({
    queue: function(elem, type, data) {
      var queue;
      if (elem) {
        type = (type || "fx") + "queue";
        queue = data_priv.get(elem, type);
        if (data) {
          if (!queue || jQuery.isArray(data)) {
            queue = data_priv.access(elem, type, jQuery.makeArray(data));
          } else {
            queue.push(data);
          }
        }
        return queue || [];
      }
    },
    dequeue: function(elem, type) {
      type = type || "fx";
      var queue = jQuery.queue(elem, type),
          startLength = queue.length,
          fn = queue.shift(),
          hooks = jQuery._queueHooks(elem, type),
          next = function() {
            jQuery.dequeue(elem, type);
          };
      if (fn === "inprogress") {
        fn = queue.shift();
        startLength--;
      }
      if (fn) {
        if (type === "fx") {
          queue.unshift("inprogress");
        }
        delete hooks.stop;
        fn.call(elem, next, hooks);
      }
      if (!startLength && hooks) {
        hooks.empty.fire();
      }
    },
    _queueHooks: function(elem, type) {
      var key = type + "queueHooks";
      return data_priv.get(elem, key) || data_priv.access(elem, key, {empty: jQuery.Callbacks("once memory").add(function() {
          data_priv.remove(elem, [type + "queue", key]);
        })});
    }
  });
  jQuery.fn.extend({
    queue: function(type, data) {
      var setter = 2;
      if (typeof type !== "string") {
        data = type;
        type = "fx";
        setter--;
      }
      if (arguments.length < setter) {
        return jQuery.queue(this[0], type);
      }
      return data === undefined ? this : this.each(function() {
        var queue = jQuery.queue(this, type, data);
        jQuery._queueHooks(this, type);
        if (type === "fx" && queue[0] !== "inprogress") {
          jQuery.dequeue(this, type);
        }
      });
    },
    dequeue: function(type) {
      return this.each(function() {
        jQuery.dequeue(this, type);
      });
    },
    clearQueue: function(type) {
      return this.queue(type || "fx", []);
    },
    promise: function(type, obj) {
      var tmp,
          count = 1,
          defer = jQuery.Deferred(),
          elements = this,
          i = this.length,
          resolve = function() {
            if (!(--count)) {
              defer.resolveWith(elements, [elements]);
            }
          };
      if (typeof type !== "string") {
        obj = type;
        type = undefined;
      }
      type = type || "fx";
      while (i--) {
        tmp = data_priv.get(elements[i], type + "queueHooks");
        if (tmp && tmp.empty) {
          count++;
          tmp.empty.add(resolve);
        }
      }
      resolve();
      return defer.promise(obj);
    }
  });
  var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;
  var cssExpand = ["Top", "Right", "Bottom", "Left"];
  var isHidden = function(elem, el) {
    elem = el || elem;
    return jQuery.css(elem, "display") === "none" || !jQuery.contains(elem.ownerDocument, elem);
  };
  var rcheckableType = (/^(?:checkbox|radio)$/i);
  (function() {
    var fragment = document.createDocumentFragment(),
        div = fragment.appendChild(document.createElement("div")),
        input = document.createElement("input");
    input.setAttribute("type", "radio");
    input.setAttribute("checked", "checked");
    input.setAttribute("name", "t");
    div.appendChild(input);
    support.checkClone = div.cloneNode(true).cloneNode(true).lastChild.checked;
    div.innerHTML = "<textarea>x</textarea>";
    support.noCloneChecked = !!div.cloneNode(true).lastChild.defaultValue;
  })();
  var strundefined = typeof undefined;
  support.focusinBubbles = "onfocusin" in window;
  var rkeyEvent = /^key/,
      rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
      rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
      rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;
  function returnTrue() {
    return true;
  }
  function returnFalse() {
    return false;
  }
  function safeActiveElement() {
    try {
      return document.activeElement;
    } catch (err) {}
  }
  jQuery.event = {
    global: {},
    add: function(elem, types, handler, data, selector) {
      var handleObjIn,
          eventHandle,
          tmp,
          events,
          t,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = data_priv.get(elem);
      if (!elemData) {
        return;
      }
      if (handler.handler) {
        handleObjIn = handler;
        handler = handleObjIn.handler;
        selector = handleObjIn.selector;
      }
      if (!handler.guid) {
        handler.guid = jQuery.guid++;
      }
      if (!(events = elemData.events)) {
        events = elemData.events = {};
      }
      if (!(eventHandle = elemData.handle)) {
        eventHandle = elemData.handle = function(e) {
          return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ? jQuery.event.dispatch.apply(elem, arguments) : undefined;
        };
      }
      types = (types || "").match(rnotwhite) || [""];
      t = types.length;
      while (t--) {
        tmp = rtypenamespace.exec(types[t]) || [];
        type = origType = tmp[1];
        namespaces = (tmp[2] || "").split(".").sort();
        if (!type) {
          continue;
        }
        special = jQuery.event.special[type] || {};
        type = (selector ? special.delegateType : special.bindType) || type;
        special = jQuery.event.special[type] || {};
        handleObj = jQuery.extend({
          type: type,
          origType: origType,
          data: data,
          handler: handler,
          guid: handler.guid,
          selector: selector,
          needsContext: selector && jQuery.expr.match.needsContext.test(selector),
          namespace: namespaces.join(".")
        }, handleObjIn);
        if (!(handlers = events[type])) {
          handlers = events[type] = [];
          handlers.delegateCount = 0;
          if (!special.setup || special.setup.call(elem, data, namespaces, eventHandle) === false) {
            if (elem.addEventListener) {
              elem.addEventListener(type, eventHandle, false);
            }
          }
        }
        if (special.add) {
          special.add.call(elem, handleObj);
          if (!handleObj.handler.guid) {
            handleObj.handler.guid = handler.guid;
          }
        }
        if (selector) {
          handlers.splice(handlers.delegateCount++, 0, handleObj);
        } else {
          handlers.push(handleObj);
        }
        jQuery.event.global[type] = true;
      }
    },
    remove: function(elem, types, handler, selector, mappedTypes) {
      var j,
          origCount,
          tmp,
          events,
          t,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = data_priv.hasData(elem) && data_priv.get(elem);
      if (!elemData || !(events = elemData.events)) {
        return;
      }
      types = (types || "").match(rnotwhite) || [""];
      t = types.length;
      while (t--) {
        tmp = rtypenamespace.exec(types[t]) || [];
        type = origType = tmp[1];
        namespaces = (tmp[2] || "").split(".").sort();
        if (!type) {
          for (type in events) {
            jQuery.event.remove(elem, type + types[t], handler, selector, true);
          }
          continue;
        }
        special = jQuery.event.special[type] || {};
        type = (selector ? special.delegateType : special.bindType) || type;
        handlers = events[type] || [];
        tmp = tmp[2] && new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)");
        origCount = j = handlers.length;
        while (j--) {
          handleObj = handlers[j];
          if ((mappedTypes || origType === handleObj.origType) && (!handler || handler.guid === handleObj.guid) && (!tmp || tmp.test(handleObj.namespace)) && (!selector || selector === handleObj.selector || selector === "**" && handleObj.selector)) {
            handlers.splice(j, 1);
            if (handleObj.selector) {
              handlers.delegateCount--;
            }
            if (special.remove) {
              special.remove.call(elem, handleObj);
            }
          }
        }
        if (origCount && !handlers.length) {
          if (!special.teardown || special.teardown.call(elem, namespaces, elemData.handle) === false) {
            jQuery.removeEvent(elem, type, elemData.handle);
          }
          delete events[type];
        }
      }
      if (jQuery.isEmptyObject(events)) {
        delete elemData.handle;
        data_priv.remove(elem, "events");
      }
    },
    trigger: function(event, data, elem, onlyHandlers) {
      var i,
          cur,
          tmp,
          bubbleType,
          ontype,
          handle,
          special,
          eventPath = [elem || document],
          type = hasOwn.call(event, "type") ? event.type : event,
          namespaces = hasOwn.call(event, "namespace") ? event.namespace.split(".") : [];
      cur = tmp = elem = elem || document;
      if (elem.nodeType === 3 || elem.nodeType === 8) {
        return;
      }
      if (rfocusMorph.test(type + jQuery.event.triggered)) {
        return;
      }
      if (type.indexOf(".") >= 0) {
        namespaces = type.split(".");
        type = namespaces.shift();
        namespaces.sort();
      }
      ontype = type.indexOf(":") < 0 && "on" + type;
      event = event[jQuery.expando] ? event : new jQuery.Event(type, typeof event === "object" && event);
      event.isTrigger = onlyHandlers ? 2 : 3;
      event.namespace = namespaces.join(".");
      event.namespace_re = event.namespace ? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)") : null;
      event.result = undefined;
      if (!event.target) {
        event.target = elem;
      }
      data = data == null ? [event] : jQuery.makeArray(data, [event]);
      special = jQuery.event.special[type] || {};
      if (!onlyHandlers && special.trigger && special.trigger.apply(elem, data) === false) {
        return;
      }
      if (!onlyHandlers && !special.noBubble && !jQuery.isWindow(elem)) {
        bubbleType = special.delegateType || type;
        if (!rfocusMorph.test(bubbleType + type)) {
          cur = cur.parentNode;
        }
        for (; cur; cur = cur.parentNode) {
          eventPath.push(cur);
          tmp = cur;
        }
        if (tmp === (elem.ownerDocument || document)) {
          eventPath.push(tmp.defaultView || tmp.parentWindow || window);
        }
      }
      i = 0;
      while ((cur = eventPath[i++]) && !event.isPropagationStopped()) {
        event.type = i > 1 ? bubbleType : special.bindType || type;
        handle = (data_priv.get(cur, "events") || {})[event.type] && data_priv.get(cur, "handle");
        if (handle) {
          handle.apply(cur, data);
        }
        handle = ontype && cur[ontype];
        if (handle && handle.apply && jQuery.acceptData(cur)) {
          event.result = handle.apply(cur, data);
          if (event.result === false) {
            event.preventDefault();
          }
        }
      }
      event.type = type;
      if (!onlyHandlers && !event.isDefaultPrevented()) {
        if ((!special._default || special._default.apply(eventPath.pop(), data) === false) && jQuery.acceptData(elem)) {
          if (ontype && jQuery.isFunction(elem[type]) && !jQuery.isWindow(elem)) {
            tmp = elem[ontype];
            if (tmp) {
              elem[ontype] = null;
            }
            jQuery.event.triggered = type;
            elem[type]();
            jQuery.event.triggered = undefined;
            if (tmp) {
              elem[ontype] = tmp;
            }
          }
        }
      }
      return event.result;
    },
    dispatch: function(event) {
      event = jQuery.event.fix(event);
      var i,
          j,
          ret,
          matched,
          handleObj,
          handlerQueue = [],
          args = slice.call(arguments),
          handlers = (data_priv.get(this, "events") || {})[event.type] || [],
          special = jQuery.event.special[event.type] || {};
      args[0] = event;
      event.delegateTarget = this;
      if (special.preDispatch && special.preDispatch.call(this, event) === false) {
        return;
      }
      handlerQueue = jQuery.event.handlers.call(this, event, handlers);
      i = 0;
      while ((matched = handlerQueue[i++]) && !event.isPropagationStopped()) {
        event.currentTarget = matched.elem;
        j = 0;
        while ((handleObj = matched.handlers[j++]) && !event.isImmediatePropagationStopped()) {
          if (!event.namespace_re || event.namespace_re.test(handleObj.namespace)) {
            event.handleObj = handleObj;
            event.data = handleObj.data;
            ret = ((jQuery.event.special[handleObj.origType] || {}).handle || handleObj.handler).apply(matched.elem, args);
            if (ret !== undefined) {
              if ((event.result = ret) === false) {
                event.preventDefault();
                event.stopPropagation();
              }
            }
          }
        }
      }
      if (special.postDispatch) {
        special.postDispatch.call(this, event);
      }
      return event.result;
    },
    handlers: function(event, handlers) {
      var i,
          matches,
          sel,
          handleObj,
          handlerQueue = [],
          delegateCount = handlers.delegateCount,
          cur = event.target;
      if (delegateCount && cur.nodeType && (!event.button || event.type !== "click")) {
        for (; cur !== this; cur = cur.parentNode || this) {
          if (cur.disabled !== true || event.type !== "click") {
            matches = [];
            for (i = 0; i < delegateCount; i++) {
              handleObj = handlers[i];
              sel = handleObj.selector + " ";
              if (matches[sel] === undefined) {
                matches[sel] = handleObj.needsContext ? jQuery(sel, this).index(cur) >= 0 : jQuery.find(sel, this, null, [cur]).length;
              }
              if (matches[sel]) {
                matches.push(handleObj);
              }
            }
            if (matches.length) {
              handlerQueue.push({
                elem: cur,
                handlers: matches
              });
            }
          }
        }
      }
      if (delegateCount < handlers.length) {
        handlerQueue.push({
          elem: this,
          handlers: handlers.slice(delegateCount)
        });
      }
      return handlerQueue;
    },
    props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),
    fixHooks: {},
    keyHooks: {
      props: "char charCode key keyCode".split(" "),
      filter: function(event, original) {
        if (event.which == null) {
          event.which = original.charCode != null ? original.charCode : original.keyCode;
        }
        return event;
      }
    },
    mouseHooks: {
      props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
      filter: function(event, original) {
        var eventDoc,
            doc,
            body,
            button = original.button;
        if (event.pageX == null && original.clientX != null) {
          eventDoc = event.target.ownerDocument || document;
          doc = eventDoc.documentElement;
          body = eventDoc.body;
          event.pageX = original.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
          event.pageY = original.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc && doc.clientTop || body && body.clientTop || 0);
        }
        if (!event.which && button !== undefined) {
          event.which = (button & 1 ? 1 : (button & 2 ? 3 : (button & 4 ? 2 : 0)));
        }
        return event;
      }
    },
    fix: function(event) {
      if (event[jQuery.expando]) {
        return event;
      }
      var i,
          prop,
          copy,
          type = event.type,
          originalEvent = event,
          fixHook = this.fixHooks[type];
      if (!fixHook) {
        this.fixHooks[type] = fixHook = rmouseEvent.test(type) ? this.mouseHooks : rkeyEvent.test(type) ? this.keyHooks : {};
      }
      copy = fixHook.props ? this.props.concat(fixHook.props) : this.props;
      event = new jQuery.Event(originalEvent);
      i = copy.length;
      while (i--) {
        prop = copy[i];
        event[prop] = originalEvent[prop];
      }
      if (!event.target) {
        event.target = document;
      }
      if (event.target.nodeType === 3) {
        event.target = event.target.parentNode;
      }
      return fixHook.filter ? fixHook.filter(event, originalEvent) : event;
    },
    special: {
      load: {noBubble: true},
      focus: {
        trigger: function() {
          if (this !== safeActiveElement() && this.focus) {
            this.focus();
            return false;
          }
        },
        delegateType: "focusin"
      },
      blur: {
        trigger: function() {
          if (this === safeActiveElement() && this.blur) {
            this.blur();
            return false;
          }
        },
        delegateType: "focusout"
      },
      click: {
        trigger: function() {
          if (this.type === "checkbox" && this.click && jQuery.nodeName(this, "input")) {
            this.click();
            return false;
          }
        },
        _default: function(event) {
          return jQuery.nodeName(event.target, "a");
        }
      },
      beforeunload: {postDispatch: function(event) {
          if (event.result !== undefined && event.originalEvent) {
            event.originalEvent.returnValue = event.result;
          }
        }}
    },
    simulate: function(type, elem, event, bubble) {
      var e = jQuery.extend(new jQuery.Event(), event, {
        type: type,
        isSimulated: true,
        originalEvent: {}
      });
      if (bubble) {
        jQuery.event.trigger(e, null, elem);
      } else {
        jQuery.event.dispatch.call(elem, e);
      }
      if (e.isDefaultPrevented()) {
        event.preventDefault();
      }
    }
  };
  jQuery.removeEvent = function(elem, type, handle) {
    if (elem.removeEventListener) {
      elem.removeEventListener(type, handle, false);
    }
  };
  jQuery.Event = function(src, props) {
    if (!(this instanceof jQuery.Event)) {
      return new jQuery.Event(src, props);
    }
    if (src && src.type) {
      this.originalEvent = src;
      this.type = src.type;
      this.isDefaultPrevented = src.defaultPrevented || src.defaultPrevented === undefined && src.returnValue === false ? returnTrue : returnFalse;
    } else {
      this.type = src;
    }
    if (props) {
      jQuery.extend(this, props);
    }
    this.timeStamp = src && src.timeStamp || jQuery.now();
    this[jQuery.expando] = true;
  };
  jQuery.Event.prototype = {
    isDefaultPrevented: returnFalse,
    isPropagationStopped: returnFalse,
    isImmediatePropagationStopped: returnFalse,
    preventDefault: function() {
      var e = this.originalEvent;
      this.isDefaultPrevented = returnTrue;
      if (e && e.preventDefault) {
        e.preventDefault();
      }
    },
    stopPropagation: function() {
      var e = this.originalEvent;
      this.isPropagationStopped = returnTrue;
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
    },
    stopImmediatePropagation: function() {
      var e = this.originalEvent;
      this.isImmediatePropagationStopped = returnTrue;
      if (e && e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }
      this.stopPropagation();
    }
  };
  jQuery.each({
    mouseenter: "mouseover",
    mouseleave: "mouseout",
    pointerenter: "pointerover",
    pointerleave: "pointerout"
  }, function(orig, fix) {
    jQuery.event.special[orig] = {
      delegateType: fix,
      bindType: fix,
      handle: function(event) {
        var ret,
            target = this,
            related = event.relatedTarget,
            handleObj = event.handleObj;
        if (!related || (related !== target && !jQuery.contains(target, related))) {
          event.type = handleObj.origType;
          ret = handleObj.handler.apply(this, arguments);
          event.type = fix;
        }
        return ret;
      }
    };
  });
  if (!support.focusinBubbles) {
    jQuery.each({
      focus: "focusin",
      blur: "focusout"
    }, function(orig, fix) {
      var handler = function(event) {
        jQuery.event.simulate(fix, event.target, jQuery.event.fix(event), true);
      };
      jQuery.event.special[fix] = {
        setup: function() {
          var doc = this.ownerDocument || this,
              attaches = data_priv.access(doc, fix);
          if (!attaches) {
            doc.addEventListener(orig, handler, true);
          }
          data_priv.access(doc, fix, (attaches || 0) + 1);
        },
        teardown: function() {
          var doc = this.ownerDocument || this,
              attaches = data_priv.access(doc, fix) - 1;
          if (!attaches) {
            doc.removeEventListener(orig, handler, true);
            data_priv.remove(doc, fix);
          } else {
            data_priv.access(doc, fix, attaches);
          }
        }
      };
    });
  }
  jQuery.fn.extend({
    on: function(types, selector, data, fn, one) {
      var origFn,
          type;
      if (typeof types === "object") {
        if (typeof selector !== "string") {
          data = data || selector;
          selector = undefined;
        }
        for (type in types) {
          this.on(type, selector, data, types[type], one);
        }
        return this;
      }
      if (data == null && fn == null) {
        fn = selector;
        data = selector = undefined;
      } else if (fn == null) {
        if (typeof selector === "string") {
          fn = data;
          data = undefined;
        } else {
          fn = data;
          data = selector;
          selector = undefined;
        }
      }
      if (fn === false) {
        fn = returnFalse;
      } else if (!fn) {
        return this;
      }
      if (one === 1) {
        origFn = fn;
        fn = function(event) {
          jQuery().off(event);
          return origFn.apply(this, arguments);
        };
        fn.guid = origFn.guid || (origFn.guid = jQuery.guid++);
      }
      return this.each(function() {
        jQuery.event.add(this, types, fn, data, selector);
      });
    },
    one: function(types, selector, data, fn) {
      return this.on(types, selector, data, fn, 1);
    },
    off: function(types, selector, fn) {
      var handleObj,
          type;
      if (types && types.preventDefault && types.handleObj) {
        handleObj = types.handleObj;
        jQuery(types.delegateTarget).off(handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType, handleObj.selector, handleObj.handler);
        return this;
      }
      if (typeof types === "object") {
        for (type in types) {
          this.off(type, selector, types[type]);
        }
        return this;
      }
      if (selector === false || typeof selector === "function") {
        fn = selector;
        selector = undefined;
      }
      if (fn === false) {
        fn = returnFalse;
      }
      return this.each(function() {
        jQuery.event.remove(this, types, fn, selector);
      });
    },
    trigger: function(type, data) {
      return this.each(function() {
        jQuery.event.trigger(type, data, this);
      });
    },
    triggerHandler: function(type, data) {
      var elem = this[0];
      if (elem) {
        return jQuery.event.trigger(type, data, elem, true);
      }
    }
  });
  var rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
      rtagName = /<([\w:]+)/,
      rhtml = /<|&#?\w+;/,
      rnoInnerhtml = /<(?:script|style|link)/i,
      rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
      rscriptType = /^$|\/(?:java|ecma)script/i,
      rscriptTypeMasked = /^true\/(.*)/,
      rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,
      wrapMap = {
        option: [1, "<select multiple='multiple'>", "</select>"],
        thead: [1, "<table>", "</table>"],
        col: [2, "<table><colgroup>", "</colgroup></table>"],
        tr: [2, "<table><tbody>", "</tbody></table>"],
        td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
        _default: [0, "", ""]
      };
  wrapMap.optgroup = wrapMap.option;
  wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
  wrapMap.th = wrapMap.td;
  function manipulationTarget(elem, content) {
    return jQuery.nodeName(elem, "table") && jQuery.nodeName(content.nodeType !== 11 ? content : content.firstChild, "tr") ? elem.getElementsByTagName("tbody")[0] || elem.appendChild(elem.ownerDocument.createElement("tbody")) : elem;
  }
  function disableScript(elem) {
    elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
    return elem;
  }
  function restoreScript(elem) {
    var match = rscriptTypeMasked.exec(elem.type);
    if (match) {
      elem.type = match[1];
    } else {
      elem.removeAttribute("type");
    }
    return elem;
  }
  function setGlobalEval(elems, refElements) {
    var i = 0,
        l = elems.length;
    for (; i < l; i++) {
      data_priv.set(elems[i], "globalEval", !refElements || data_priv.get(refElements[i], "globalEval"));
    }
  }
  function cloneCopyEvent(src, dest) {
    var i,
        l,
        type,
        pdataOld,
        pdataCur,
        udataOld,
        udataCur,
        events;
    if (dest.nodeType !== 1) {
      return;
    }
    if (data_priv.hasData(src)) {
      pdataOld = data_priv.access(src);
      pdataCur = data_priv.set(dest, pdataOld);
      events = pdataOld.events;
      if (events) {
        delete pdataCur.handle;
        pdataCur.events = {};
        for (type in events) {
          for (i = 0, l = events[type].length; i < l; i++) {
            jQuery.event.add(dest, type, events[type][i]);
          }
        }
      }
    }
    if (data_user.hasData(src)) {
      udataOld = data_user.access(src);
      udataCur = jQuery.extend({}, udataOld);
      data_user.set(dest, udataCur);
    }
  }
  function getAll(context, tag) {
    var ret = context.getElementsByTagName ? context.getElementsByTagName(tag || "*") : context.querySelectorAll ? context.querySelectorAll(tag || "*") : [];
    return tag === undefined || tag && jQuery.nodeName(context, tag) ? jQuery.merge([context], ret) : ret;
  }
  function fixInput(src, dest) {
    var nodeName = dest.nodeName.toLowerCase();
    if (nodeName === "input" && rcheckableType.test(src.type)) {
      dest.checked = src.checked;
    } else if (nodeName === "input" || nodeName === "textarea") {
      dest.defaultValue = src.defaultValue;
    }
  }
  jQuery.extend({
    clone: function(elem, dataAndEvents, deepDataAndEvents) {
      var i,
          l,
          srcElements,
          destElements,
          clone = elem.cloneNode(true),
          inPage = jQuery.contains(elem.ownerDocument, elem);
      if (!support.noCloneChecked && (elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem)) {
        destElements = getAll(clone);
        srcElements = getAll(elem);
        for (i = 0, l = srcElements.length; i < l; i++) {
          fixInput(srcElements[i], destElements[i]);
        }
      }
      if (dataAndEvents) {
        if (deepDataAndEvents) {
          srcElements = srcElements || getAll(elem);
          destElements = destElements || getAll(clone);
          for (i = 0, l = srcElements.length; i < l; i++) {
            cloneCopyEvent(srcElements[i], destElements[i]);
          }
        } else {
          cloneCopyEvent(elem, clone);
        }
      }
      destElements = getAll(clone, "script");
      if (destElements.length > 0) {
        setGlobalEval(destElements, !inPage && getAll(elem, "script"));
      }
      return clone;
    },
    buildFragment: function(elems, context, scripts, selection) {
      var elem,
          tmp,
          tag,
          wrap,
          contains,
          j,
          fragment = context.createDocumentFragment(),
          nodes = [],
          i = 0,
          l = elems.length;
      for (; i < l; i++) {
        elem = elems[i];
        if (elem || elem === 0) {
          if (jQuery.type(elem) === "object") {
            jQuery.merge(nodes, elem.nodeType ? [elem] : elem);
          } else if (!rhtml.test(elem)) {
            nodes.push(context.createTextNode(elem));
          } else {
            tmp = tmp || fragment.appendChild(context.createElement("div"));
            tag = (rtagName.exec(elem) || ["", ""])[1].toLowerCase();
            wrap = wrapMap[tag] || wrapMap._default;
            tmp.innerHTML = wrap[1] + elem.replace(rxhtmlTag, "<$1></$2>") + wrap[2];
            j = wrap[0];
            while (j--) {
              tmp = tmp.lastChild;
            }
            jQuery.merge(nodes, tmp.childNodes);
            tmp = fragment.firstChild;
            tmp.textContent = "";
          }
        }
      }
      fragment.textContent = "";
      i = 0;
      while ((elem = nodes[i++])) {
        if (selection && jQuery.inArray(elem, selection) !== -1) {
          continue;
        }
        contains = jQuery.contains(elem.ownerDocument, elem);
        tmp = getAll(fragment.appendChild(elem), "script");
        if (contains) {
          setGlobalEval(tmp);
        }
        if (scripts) {
          j = 0;
          while ((elem = tmp[j++])) {
            if (rscriptType.test(elem.type || "")) {
              scripts.push(elem);
            }
          }
        }
      }
      return fragment;
    },
    cleanData: function(elems) {
      var data,
          elem,
          type,
          key,
          special = jQuery.event.special,
          i = 0;
      for (; (elem = elems[i]) !== undefined; i++) {
        if (jQuery.acceptData(elem)) {
          key = elem[data_priv.expando];
          if (key && (data = data_priv.cache[key])) {
            if (data.events) {
              for (type in data.events) {
                if (special[type]) {
                  jQuery.event.remove(elem, type);
                } else {
                  jQuery.removeEvent(elem, type, data.handle);
                }
              }
            }
            if (data_priv.cache[key]) {
              delete data_priv.cache[key];
            }
          }
        }
        delete data_user.cache[elem[data_user.expando]];
      }
    }
  });
  jQuery.fn.extend({
    text: function(value) {
      return access(this, function(value) {
        return value === undefined ? jQuery.text(this) : this.empty().each(function() {
          if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
            this.textContent = value;
          }
        });
      }, null, value, arguments.length);
    },
    append: function() {
      return this.domManip(arguments, function(elem) {
        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
          var target = manipulationTarget(this, elem);
          target.appendChild(elem);
        }
      });
    },
    prepend: function() {
      return this.domManip(arguments, function(elem) {
        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
          var target = manipulationTarget(this, elem);
          target.insertBefore(elem, target.firstChild);
        }
      });
    },
    before: function() {
      return this.domManip(arguments, function(elem) {
        if (this.parentNode) {
          this.parentNode.insertBefore(elem, this);
        }
      });
    },
    after: function() {
      return this.domManip(arguments, function(elem) {
        if (this.parentNode) {
          this.parentNode.insertBefore(elem, this.nextSibling);
        }
      });
    },
    remove: function(selector, keepData) {
      var elem,
          elems = selector ? jQuery.filter(selector, this) : this,
          i = 0;
      for (; (elem = elems[i]) != null; i++) {
        if (!keepData && elem.nodeType === 1) {
          jQuery.cleanData(getAll(elem));
        }
        if (elem.parentNode) {
          if (keepData && jQuery.contains(elem.ownerDocument, elem)) {
            setGlobalEval(getAll(elem, "script"));
          }
          elem.parentNode.removeChild(elem);
        }
      }
      return this;
    },
    empty: function() {
      var elem,
          i = 0;
      for (; (elem = this[i]) != null; i++) {
        if (elem.nodeType === 1) {
          jQuery.cleanData(getAll(elem, false));
          elem.textContent = "";
        }
      }
      return this;
    },
    clone: function(dataAndEvents, deepDataAndEvents) {
      dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
      deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;
      return this.map(function() {
        return jQuery.clone(this, dataAndEvents, deepDataAndEvents);
      });
    },
    html: function(value) {
      return access(this, function(value) {
        var elem = this[0] || {},
            i = 0,
            l = this.length;
        if (value === undefined && elem.nodeType === 1) {
          return elem.innerHTML;
        }
        if (typeof value === "string" && !rnoInnerhtml.test(value) && !wrapMap[(rtagName.exec(value) || ["", ""])[1].toLowerCase()]) {
          value = value.replace(rxhtmlTag, "<$1></$2>");
          try {
            for (; i < l; i++) {
              elem = this[i] || {};
              if (elem.nodeType === 1) {
                jQuery.cleanData(getAll(elem, false));
                elem.innerHTML = value;
              }
            }
            elem = 0;
          } catch (e) {}
        }
        if (elem) {
          this.empty().append(value);
        }
      }, null, value, arguments.length);
    },
    replaceWith: function() {
      var arg = arguments[0];
      this.domManip(arguments, function(elem) {
        arg = this.parentNode;
        jQuery.cleanData(getAll(this));
        if (arg) {
          arg.replaceChild(elem, this);
        }
      });
      return arg && (arg.length || arg.nodeType) ? this : this.remove();
    },
    detach: function(selector) {
      return this.remove(selector, true);
    },
    domManip: function(args, callback) {
      args = concat.apply([], args);
      var fragment,
          first,
          scripts,
          hasScripts,
          node,
          doc,
          i = 0,
          l = this.length,
          set = this,
          iNoClone = l - 1,
          value = args[0],
          isFunction = jQuery.isFunction(value);
      if (isFunction || (l > 1 && typeof value === "string" && !support.checkClone && rchecked.test(value))) {
        return this.each(function(index) {
          var self = set.eq(index);
          if (isFunction) {
            args[0] = value.call(this, index, self.html());
          }
          self.domManip(args, callback);
        });
      }
      if (l) {
        fragment = jQuery.buildFragment(args, this[0].ownerDocument, false, this);
        first = fragment.firstChild;
        if (fragment.childNodes.length === 1) {
          fragment = first;
        }
        if (first) {
          scripts = jQuery.map(getAll(fragment, "script"), disableScript);
          hasScripts = scripts.length;
          for (; i < l; i++) {
            node = fragment;
            if (i !== iNoClone) {
              node = jQuery.clone(node, true, true);
              if (hasScripts) {
                jQuery.merge(scripts, getAll(node, "script"));
              }
            }
            callback.call(this[i], node, i);
          }
          if (hasScripts) {
            doc = scripts[scripts.length - 1].ownerDocument;
            jQuery.map(scripts, restoreScript);
            for (i = 0; i < hasScripts; i++) {
              node = scripts[i];
              if (rscriptType.test(node.type || "") && !data_priv.access(node, "globalEval") && jQuery.contains(doc, node)) {
                if (node.src) {
                  if (jQuery._evalUrl) {
                    jQuery._evalUrl(node.src);
                  }
                } else {
                  jQuery.globalEval(node.textContent.replace(rcleanScript, ""));
                }
              }
            }
          }
        }
      }
      return this;
    }
  });
  jQuery.each({
    appendTo: "append",
    prependTo: "prepend",
    insertBefore: "before",
    insertAfter: "after",
    replaceAll: "replaceWith"
  }, function(name, original) {
    jQuery.fn[name] = function(selector) {
      var elems,
          ret = [],
          insert = jQuery(selector),
          last = insert.length - 1,
          i = 0;
      for (; i <= last; i++) {
        elems = i === last ? this : this.clone(true);
        jQuery(insert[i])[original](elems);
        push.apply(ret, elems.get());
      }
      return this.pushStack(ret);
    };
  });
  var iframe,
      elemdisplay = {};
  function actualDisplay(name, doc) {
    var style,
        elem = jQuery(doc.createElement(name)).appendTo(doc.body),
        display = window.getDefaultComputedStyle && (style = window.getDefaultComputedStyle(elem[0])) ? style.display : jQuery.css(elem[0], "display");
    elem.detach();
    return display;
  }
  function defaultDisplay(nodeName) {
    var doc = document,
        display = elemdisplay[nodeName];
    if (!display) {
      display = actualDisplay(nodeName, doc);
      if (display === "none" || !display) {
        iframe = (iframe || jQuery("<iframe frameborder='0' width='0' height='0'/>")).appendTo(doc.documentElement);
        doc = iframe[0].contentDocument;
        doc.write();
        doc.close();
        display = actualDisplay(nodeName, doc);
        iframe.detach();
      }
      elemdisplay[nodeName] = display;
    }
    return display;
  }
  var rmargin = (/^margin/);
  var rnumnonpx = new RegExp("^(" + pnum + ")(?!px)[a-z%]+$", "i");
  var getStyles = function(elem) {
    if (elem.ownerDocument.defaultView.opener) {
      return elem.ownerDocument.defaultView.getComputedStyle(elem, null);
    }
    return window.getComputedStyle(elem, null);
  };
  function curCSS(elem, name, computed) {
    var width,
        minWidth,
        maxWidth,
        ret,
        style = elem.style;
    computed = computed || getStyles(elem);
    if (computed) {
      ret = computed.getPropertyValue(name) || computed[name];
    }
    if (computed) {
      if (ret === "" && !jQuery.contains(elem.ownerDocument, elem)) {
        ret = jQuery.style(elem, name);
      }
      if (rnumnonpx.test(ret) && rmargin.test(name)) {
        width = style.width;
        minWidth = style.minWidth;
        maxWidth = style.maxWidth;
        style.minWidth = style.maxWidth = style.width = ret;
        ret = computed.width;
        style.width = width;
        style.minWidth = minWidth;
        style.maxWidth = maxWidth;
      }
    }
    return ret !== undefined ? ret + "" : ret;
  }
  function addGetHookIf(conditionFn, hookFn) {
    return {get: function() {
        if (conditionFn()) {
          delete this.get;
          return;
        }
        return (this.get = hookFn).apply(this, arguments);
      }};
  }
  (function() {
    var pixelPositionVal,
        boxSizingReliableVal,
        docElem = document.documentElement,
        container = document.createElement("div"),
        div = document.createElement("div");
    if (!div.style) {
      return;
    }
    div.style.backgroundClip = "content-box";
    div.cloneNode(true).style.backgroundClip = "";
    support.clearCloneStyle = div.style.backgroundClip === "content-box";
    container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" + "position:absolute";
    container.appendChild(div);
    function computePixelPositionAndBoxSizingReliable() {
      div.style.cssText = "-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" + "box-sizing:border-box;display:block;margin-top:1%;top:1%;" + "border:1px;padding:1px;width:4px;position:absolute";
      div.innerHTML = "";
      docElem.appendChild(container);
      var divStyle = window.getComputedStyle(div, null);
      pixelPositionVal = divStyle.top !== "1%";
      boxSizingReliableVal = divStyle.width === "4px";
      docElem.removeChild(container);
    }
    if (window.getComputedStyle) {
      jQuery.extend(support, {
        pixelPosition: function() {
          computePixelPositionAndBoxSizingReliable();
          return pixelPositionVal;
        },
        boxSizingReliable: function() {
          if (boxSizingReliableVal == null) {
            computePixelPositionAndBoxSizingReliable();
          }
          return boxSizingReliableVal;
        },
        reliableMarginRight: function() {
          var ret,
              marginDiv = div.appendChild(document.createElement("div"));
          marginDiv.style.cssText = div.style.cssText = "-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" + "box-sizing:content-box;display:block;margin:0;border:0;padding:0";
          marginDiv.style.marginRight = marginDiv.style.width = "0";
          div.style.width = "1px";
          docElem.appendChild(container);
          ret = !parseFloat(window.getComputedStyle(marginDiv, null).marginRight);
          docElem.removeChild(container);
          div.removeChild(marginDiv);
          return ret;
        }
      });
    }
  })();
  jQuery.swap = function(elem, options, callback, args) {
    var ret,
        name,
        old = {};
    for (name in options) {
      old[name] = elem.style[name];
      elem.style[name] = options[name];
    }
    ret = callback.apply(elem, args || []);
    for (name in options) {
      elem.style[name] = old[name];
    }
    return ret;
  };
  var rdisplayswap = /^(none|table(?!-c[ea]).+)/,
      rnumsplit = new RegExp("^(" + pnum + ")(.*)$", "i"),
      rrelNum = new RegExp("^([+-])=(" + pnum + ")", "i"),
      cssShow = {
        position: "absolute",
        visibility: "hidden",
        display: "block"
      },
      cssNormalTransform = {
        letterSpacing: "0",
        fontWeight: "400"
      },
      cssPrefixes = ["Webkit", "O", "Moz", "ms"];
  function vendorPropName(style, name) {
    if (name in style) {
      return name;
    }
    var capName = name[0].toUpperCase() + name.slice(1),
        origName = name,
        i = cssPrefixes.length;
    while (i--) {
      name = cssPrefixes[i] + capName;
      if (name in style) {
        return name;
      }
    }
    return origName;
  }
  function setPositiveNumber(elem, value, subtract) {
    var matches = rnumsplit.exec(value);
    return matches ? Math.max(0, matches[1] - (subtract || 0)) + (matches[2] || "px") : value;
  }
  function augmentWidthOrHeight(elem, name, extra, isBorderBox, styles) {
    var i = extra === (isBorderBox ? "border" : "content") ? 4 : name === "width" ? 1 : 0,
        val = 0;
    for (; i < 4; i += 2) {
      if (extra === "margin") {
        val += jQuery.css(elem, extra + cssExpand[i], true, styles);
      }
      if (isBorderBox) {
        if (extra === "content") {
          val -= jQuery.css(elem, "padding" + cssExpand[i], true, styles);
        }
        if (extra !== "margin") {
          val -= jQuery.css(elem, "border" + cssExpand[i] + "Width", true, styles);
        }
      } else {
        val += jQuery.css(elem, "padding" + cssExpand[i], true, styles);
        if (extra !== "padding") {
          val += jQuery.css(elem, "border" + cssExpand[i] + "Width", true, styles);
        }
      }
    }
    return val;
  }
  function getWidthOrHeight(elem, name, extra) {
    var valueIsBorderBox = true,
        val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
        styles = getStyles(elem),
        isBorderBox = jQuery.css(elem, "boxSizing", false, styles) === "border-box";
    if (val <= 0 || val == null) {
      val = curCSS(elem, name, styles);
      if (val < 0 || val == null) {
        val = elem.style[name];
      }
      if (rnumnonpx.test(val)) {
        return val;
      }
      valueIsBorderBox = isBorderBox && (support.boxSizingReliable() || val === elem.style[name]);
      val = parseFloat(val) || 0;
    }
    return (val + augmentWidthOrHeight(elem, name, extra || (isBorderBox ? "border" : "content"), valueIsBorderBox, styles)) + "px";
  }
  function showHide(elements, show) {
    var display,
        elem,
        hidden,
        values = [],
        index = 0,
        length = elements.length;
    for (; index < length; index++) {
      elem = elements[index];
      if (!elem.style) {
        continue;
      }
      values[index] = data_priv.get(elem, "olddisplay");
      display = elem.style.display;
      if (show) {
        if (!values[index] && display === "none") {
          elem.style.display = "";
        }
        if (elem.style.display === "" && isHidden(elem)) {
          values[index] = data_priv.access(elem, "olddisplay", defaultDisplay(elem.nodeName));
        }
      } else {
        hidden = isHidden(elem);
        if (display !== "none" || !hidden) {
          data_priv.set(elem, "olddisplay", hidden ? display : jQuery.css(elem, "display"));
        }
      }
    }
    for (index = 0; index < length; index++) {
      elem = elements[index];
      if (!elem.style) {
        continue;
      }
      if (!show || elem.style.display === "none" || elem.style.display === "") {
        elem.style.display = show ? values[index] || "" : "none";
      }
    }
    return elements;
  }
  jQuery.extend({
    cssHooks: {opacity: {get: function(elem, computed) {
          if (computed) {
            var ret = curCSS(elem, "opacity");
            return ret === "" ? "1" : ret;
          }
        }}},
    cssNumber: {
      "columnCount": true,
      "fillOpacity": true,
      "flexGrow": true,
      "flexShrink": true,
      "fontWeight": true,
      "lineHeight": true,
      "opacity": true,
      "order": true,
      "orphans": true,
      "widows": true,
      "zIndex": true,
      "zoom": true
    },
    cssProps: {"float": "cssFloat"},
    style: function(elem, name, value, extra) {
      if (!elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style) {
        return;
      }
      var ret,
          type,
          hooks,
          origName = jQuery.camelCase(name),
          style = elem.style;
      name = jQuery.cssProps[origName] || (jQuery.cssProps[origName] = vendorPropName(style, origName));
      hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName];
      if (value !== undefined) {
        type = typeof value;
        if (type === "string" && (ret = rrelNum.exec(value))) {
          value = (ret[1] + 1) * ret[2] + parseFloat(jQuery.css(elem, name));
          type = "number";
        }
        if (value == null || value !== value) {
          return;
        }
        if (type === "number" && !jQuery.cssNumber[origName]) {
          value += "px";
        }
        if (!support.clearCloneStyle && value === "" && name.indexOf("background") === 0) {
          style[name] = "inherit";
        }
        if (!hooks || !("set" in hooks) || (value = hooks.set(elem, value, extra)) !== undefined) {
          style[name] = value;
        }
      } else {
        if (hooks && "get" in hooks && (ret = hooks.get(elem, false, extra)) !== undefined) {
          return ret;
        }
        return style[name];
      }
    },
    css: function(elem, name, extra, styles) {
      var val,
          num,
          hooks,
          origName = jQuery.camelCase(name);
      name = jQuery.cssProps[origName] || (jQuery.cssProps[origName] = vendorPropName(elem.style, origName));
      hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName];
      if (hooks && "get" in hooks) {
        val = hooks.get(elem, true, extra);
      }
      if (val === undefined) {
        val = curCSS(elem, name, styles);
      }
      if (val === "normal" && name in cssNormalTransform) {
        val = cssNormalTransform[name];
      }
      if (extra === "" || extra) {
        num = parseFloat(val);
        return extra === true || jQuery.isNumeric(num) ? num || 0 : val;
      }
      return val;
    }
  });
  jQuery.each(["height", "width"], function(i, name) {
    jQuery.cssHooks[name] = {
      get: function(elem, computed, extra) {
        if (computed) {
          return rdisplayswap.test(jQuery.css(elem, "display")) && elem.offsetWidth === 0 ? jQuery.swap(elem, cssShow, function() {
            return getWidthOrHeight(elem, name, extra);
          }) : getWidthOrHeight(elem, name, extra);
        }
      },
      set: function(elem, value, extra) {
        var styles = extra && getStyles(elem);
        return setPositiveNumber(elem, value, extra ? augmentWidthOrHeight(elem, name, extra, jQuery.css(elem, "boxSizing", false, styles) === "border-box", styles) : 0);
      }
    };
  });
  jQuery.cssHooks.marginRight = addGetHookIf(support.reliableMarginRight, function(elem, computed) {
    if (computed) {
      return jQuery.swap(elem, {"display": "inline-block"}, curCSS, [elem, "marginRight"]);
    }
  });
  jQuery.each({
    margin: "",
    padding: "",
    border: "Width"
  }, function(prefix, suffix) {
    jQuery.cssHooks[prefix + suffix] = {expand: function(value) {
        var i = 0,
            expanded = {},
            parts = typeof value === "string" ? value.split(" ") : [value];
        for (; i < 4; i++) {
          expanded[prefix + cssExpand[i] + suffix] = parts[i] || parts[i - 2] || parts[0];
        }
        return expanded;
      }};
    if (!rmargin.test(prefix)) {
      jQuery.cssHooks[prefix + suffix].set = setPositiveNumber;
    }
  });
  jQuery.fn.extend({
    css: function(name, value) {
      return access(this, function(elem, name, value) {
        var styles,
            len,
            map = {},
            i = 0;
        if (jQuery.isArray(name)) {
          styles = getStyles(elem);
          len = name.length;
          for (; i < len; i++) {
            map[name[i]] = jQuery.css(elem, name[i], false, styles);
          }
          return map;
        }
        return value !== undefined ? jQuery.style(elem, name, value) : jQuery.css(elem, name);
      }, name, value, arguments.length > 1);
    },
    show: function() {
      return showHide(this, true);
    },
    hide: function() {
      return showHide(this);
    },
    toggle: function(state) {
      if (typeof state === "boolean") {
        return state ? this.show() : this.hide();
      }
      return this.each(function() {
        if (isHidden(this)) {
          jQuery(this).show();
        } else {
          jQuery(this).hide();
        }
      });
    }
  });
  function Tween(elem, options, prop, end, easing) {
    return new Tween.prototype.init(elem, options, prop, end, easing);
  }
  jQuery.Tween = Tween;
  Tween.prototype = {
    constructor: Tween,
    init: function(elem, options, prop, end, easing, unit) {
      this.elem = elem;
      this.prop = prop;
      this.easing = easing || "swing";
      this.options = options;
      this.start = this.now = this.cur();
      this.end = end;
      this.unit = unit || (jQuery.cssNumber[prop] ? "" : "px");
    },
    cur: function() {
      var hooks = Tween.propHooks[this.prop];
      return hooks && hooks.get ? hooks.get(this) : Tween.propHooks._default.get(this);
    },
    run: function(percent) {
      var eased,
          hooks = Tween.propHooks[this.prop];
      if (this.options.duration) {
        this.pos = eased = jQuery.easing[this.easing](percent, this.options.duration * percent, 0, 1, this.options.duration);
      } else {
        this.pos = eased = percent;
      }
      this.now = (this.end - this.start) * eased + this.start;
      if (this.options.step) {
        this.options.step.call(this.elem, this.now, this);
      }
      if (hooks && hooks.set) {
        hooks.set(this);
      } else {
        Tween.propHooks._default.set(this);
      }
      return this;
    }
  };
  Tween.prototype.init.prototype = Tween.prototype;
  Tween.propHooks = {_default: {
      get: function(tween) {
        var result;
        if (tween.elem[tween.prop] != null && (!tween.elem.style || tween.elem.style[tween.prop] == null)) {
          return tween.elem[tween.prop];
        }
        result = jQuery.css(tween.elem, tween.prop, "");
        return !result || result === "auto" ? 0 : result;
      },
      set: function(tween) {
        if (jQuery.fx.step[tween.prop]) {
          jQuery.fx.step[tween.prop](tween);
        } else if (tween.elem.style && (tween.elem.style[jQuery.cssProps[tween.prop]] != null || jQuery.cssHooks[tween.prop])) {
          jQuery.style(tween.elem, tween.prop, tween.now + tween.unit);
        } else {
          tween.elem[tween.prop] = tween.now;
        }
      }
    }};
  Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {set: function(tween) {
      if (tween.elem.nodeType && tween.elem.parentNode) {
        tween.elem[tween.prop] = tween.now;
      }
    }};
  jQuery.easing = {
    linear: function(p) {
      return p;
    },
    swing: function(p) {
      return 0.5 - Math.cos(p * Math.PI) / 2;
    }
  };
  jQuery.fx = Tween.prototype.init;
  jQuery.fx.step = {};
  var fxNow,
      timerId,
      rfxtypes = /^(?:toggle|show|hide)$/,
      rfxnum = new RegExp("^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i"),
      rrun = /queueHooks$/,
      animationPrefilters = [defaultPrefilter],
      tweeners = {"*": [function(prop, value) {
          var tween = this.createTween(prop, value),
              target = tween.cur(),
              parts = rfxnum.exec(value),
              unit = parts && parts[3] || (jQuery.cssNumber[prop] ? "" : "px"),
              start = (jQuery.cssNumber[prop] || unit !== "px" && +target) && rfxnum.exec(jQuery.css(tween.elem, prop)),
              scale = 1,
              maxIterations = 20;
          if (start && start[3] !== unit) {
            unit = unit || start[3];
            parts = parts || [];
            start = +target || 1;
            do {
              scale = scale || ".5";
              start = start / scale;
              jQuery.style(tween.elem, prop, start + unit);
            } while (scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations);
          }
          if (parts) {
            start = tween.start = +start || +target || 0;
            tween.unit = unit;
            tween.end = parts[1] ? start + (parts[1] + 1) * parts[2] : +parts[2];
          }
          return tween;
        }]};
  function createFxNow() {
    setTimeout(function() {
      fxNow = undefined;
    });
    return (fxNow = jQuery.now());
  }
  function genFx(type, includeWidth) {
    var which,
        i = 0,
        attrs = {height: type};
    includeWidth = includeWidth ? 1 : 0;
    for (; i < 4; i += 2 - includeWidth) {
      which = cssExpand[i];
      attrs["margin" + which] = attrs["padding" + which] = type;
    }
    if (includeWidth) {
      attrs.opacity = attrs.width = type;
    }
    return attrs;
  }
  function createTween(value, prop, animation) {
    var tween,
        collection = (tweeners[prop] || []).concat(tweeners["*"]),
        index = 0,
        length = collection.length;
    for (; index < length; index++) {
      if ((tween = collection[index].call(animation, prop, value))) {
        return tween;
      }
    }
  }
  function defaultPrefilter(elem, props, opts) {
    var prop,
        value,
        toggle,
        tween,
        hooks,
        oldfire,
        display,
        checkDisplay,
        anim = this,
        orig = {},
        style = elem.style,
        hidden = elem.nodeType && isHidden(elem),
        dataShow = data_priv.get(elem, "fxshow");
    if (!opts.queue) {
      hooks = jQuery._queueHooks(elem, "fx");
      if (hooks.unqueued == null) {
        hooks.unqueued = 0;
        oldfire = hooks.empty.fire;
        hooks.empty.fire = function() {
          if (!hooks.unqueued) {
            oldfire();
          }
        };
      }
      hooks.unqueued++;
      anim.always(function() {
        anim.always(function() {
          hooks.unqueued--;
          if (!jQuery.queue(elem, "fx").length) {
            hooks.empty.fire();
          }
        });
      });
    }
    if (elem.nodeType === 1 && ("height" in props || "width" in props)) {
      opts.overflow = [style.overflow, style.overflowX, style.overflowY];
      display = jQuery.css(elem, "display");
      checkDisplay = display === "none" ? data_priv.get(elem, "olddisplay") || defaultDisplay(elem.nodeName) : display;
      if (checkDisplay === "inline" && jQuery.css(elem, "float") === "none") {
        style.display = "inline-block";
      }
    }
    if (opts.overflow) {
      style.overflow = "hidden";
      anim.always(function() {
        style.overflow = opts.overflow[0];
        style.overflowX = opts.overflow[1];
        style.overflowY = opts.overflow[2];
      });
    }
    for (prop in props) {
      value = props[prop];
      if (rfxtypes.exec(value)) {
        delete props[prop];
        toggle = toggle || value === "toggle";
        if (value === (hidden ? "hide" : "show")) {
          if (value === "show" && dataShow && dataShow[prop] !== undefined) {
            hidden = true;
          } else {
            continue;
          }
        }
        orig[prop] = dataShow && dataShow[prop] || jQuery.style(elem, prop);
      } else {
        display = undefined;
      }
    }
    if (!jQuery.isEmptyObject(orig)) {
      if (dataShow) {
        if ("hidden" in dataShow) {
          hidden = dataShow.hidden;
        }
      } else {
        dataShow = data_priv.access(elem, "fxshow", {});
      }
      if (toggle) {
        dataShow.hidden = !hidden;
      }
      if (hidden) {
        jQuery(elem).show();
      } else {
        anim.done(function() {
          jQuery(elem).hide();
        });
      }
      anim.done(function() {
        var prop;
        data_priv.remove(elem, "fxshow");
        for (prop in orig) {
          jQuery.style(elem, prop, orig[prop]);
        }
      });
      for (prop in orig) {
        tween = createTween(hidden ? dataShow[prop] : 0, prop, anim);
        if (!(prop in dataShow)) {
          dataShow[prop] = tween.start;
          if (hidden) {
            tween.end = tween.start;
            tween.start = prop === "width" || prop === "height" ? 1 : 0;
          }
        }
      }
    } else if ((display === "none" ? defaultDisplay(elem.nodeName) : display) === "inline") {
      style.display = display;
    }
  }
  function propFilter(props, specialEasing) {
    var index,
        name,
        easing,
        value,
        hooks;
    for (index in props) {
      name = jQuery.camelCase(index);
      easing = specialEasing[name];
      value = props[index];
      if (jQuery.isArray(value)) {
        easing = value[1];
        value = props[index] = value[0];
      }
      if (index !== name) {
        props[name] = value;
        delete props[index];
      }
      hooks = jQuery.cssHooks[name];
      if (hooks && "expand" in hooks) {
        value = hooks.expand(value);
        delete props[name];
        for (index in value) {
          if (!(index in props)) {
            props[index] = value[index];
            specialEasing[index] = easing;
          }
        }
      } else {
        specialEasing[name] = easing;
      }
    }
  }
  function Animation(elem, properties, options) {
    var result,
        stopped,
        index = 0,
        length = animationPrefilters.length,
        deferred = jQuery.Deferred().always(function() {
          delete tick.elem;
        }),
        tick = function() {
          if (stopped) {
            return false;
          }
          var currentTime = fxNow || createFxNow(),
              remaining = Math.max(0, animation.startTime + animation.duration - currentTime),
              temp = remaining / animation.duration || 0,
              percent = 1 - temp,
              index = 0,
              length = animation.tweens.length;
          for (; index < length; index++) {
            animation.tweens[index].run(percent);
          }
          deferred.notifyWith(elem, [animation, percent, remaining]);
          if (percent < 1 && length) {
            return remaining;
          } else {
            deferred.resolveWith(elem, [animation]);
            return false;
          }
        },
        animation = deferred.promise({
          elem: elem,
          props: jQuery.extend({}, properties),
          opts: jQuery.extend(true, {specialEasing: {}}, options),
          originalProperties: properties,
          originalOptions: options,
          startTime: fxNow || createFxNow(),
          duration: options.duration,
          tweens: [],
          createTween: function(prop, end) {
            var tween = jQuery.Tween(elem, animation.opts, prop, end, animation.opts.specialEasing[prop] || animation.opts.easing);
            animation.tweens.push(tween);
            return tween;
          },
          stop: function(gotoEnd) {
            var index = 0,
                length = gotoEnd ? animation.tweens.length : 0;
            if (stopped) {
              return this;
            }
            stopped = true;
            for (; index < length; index++) {
              animation.tweens[index].run(1);
            }
            if (gotoEnd) {
              deferred.resolveWith(elem, [animation, gotoEnd]);
            } else {
              deferred.rejectWith(elem, [animation, gotoEnd]);
            }
            return this;
          }
        }),
        props = animation.props;
    propFilter(props, animation.opts.specialEasing);
    for (; index < length; index++) {
      result = animationPrefilters[index].call(animation, elem, props, animation.opts);
      if (result) {
        return result;
      }
    }
    jQuery.map(props, createTween, animation);
    if (jQuery.isFunction(animation.opts.start)) {
      animation.opts.start.call(elem, animation);
    }
    jQuery.fx.timer(jQuery.extend(tick, {
      elem: elem,
      anim: animation,
      queue: animation.opts.queue
    }));
    return animation.progress(animation.opts.progress).done(animation.opts.done, animation.opts.complete).fail(animation.opts.fail).always(animation.opts.always);
  }
  jQuery.Animation = jQuery.extend(Animation, {
    tweener: function(props, callback) {
      if (jQuery.isFunction(props)) {
        callback = props;
        props = ["*"];
      } else {
        props = props.split(" ");
      }
      var prop,
          index = 0,
          length = props.length;
      for (; index < length; index++) {
        prop = props[index];
        tweeners[prop] = tweeners[prop] || [];
        tweeners[prop].unshift(callback);
      }
    },
    prefilter: function(callback, prepend) {
      if (prepend) {
        animationPrefilters.unshift(callback);
      } else {
        animationPrefilters.push(callback);
      }
    }
  });
  jQuery.speed = function(speed, easing, fn) {
    var opt = speed && typeof speed === "object" ? jQuery.extend({}, speed) : {
      complete: fn || !fn && easing || jQuery.isFunction(speed) && speed,
      duration: speed,
      easing: fn && easing || easing && !jQuery.isFunction(easing) && easing
    };
    opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration : opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[opt.duration] : jQuery.fx.speeds._default;
    if (opt.queue == null || opt.queue === true) {
      opt.queue = "fx";
    }
    opt.old = opt.complete;
    opt.complete = function() {
      if (jQuery.isFunction(opt.old)) {
        opt.old.call(this);
      }
      if (opt.queue) {
        jQuery.dequeue(this, opt.queue);
      }
    };
    return opt;
  };
  jQuery.fn.extend({
    fadeTo: function(speed, to, easing, callback) {
      return this.filter(isHidden).css("opacity", 0).show().end().animate({opacity: to}, speed, easing, callback);
    },
    animate: function(prop, speed, easing, callback) {
      var empty = jQuery.isEmptyObject(prop),
          optall = jQuery.speed(speed, easing, callback),
          doAnimation = function() {
            var anim = Animation(this, jQuery.extend({}, prop), optall);
            if (empty || data_priv.get(this, "finish")) {
              anim.stop(true);
            }
          };
      doAnimation.finish = doAnimation;
      return empty || optall.queue === false ? this.each(doAnimation) : this.queue(optall.queue, doAnimation);
    },
    stop: function(type, clearQueue, gotoEnd) {
      var stopQueue = function(hooks) {
        var stop = hooks.stop;
        delete hooks.stop;
        stop(gotoEnd);
      };
      if (typeof type !== "string") {
        gotoEnd = clearQueue;
        clearQueue = type;
        type = undefined;
      }
      if (clearQueue && type !== false) {
        this.queue(type || "fx", []);
      }
      return this.each(function() {
        var dequeue = true,
            index = type != null && type + "queueHooks",
            timers = jQuery.timers,
            data = data_priv.get(this);
        if (index) {
          if (data[index] && data[index].stop) {
            stopQueue(data[index]);
          }
        } else {
          for (index in data) {
            if (data[index] && data[index].stop && rrun.test(index)) {
              stopQueue(data[index]);
            }
          }
        }
        for (index = timers.length; index--; ) {
          if (timers[index].elem === this && (type == null || timers[index].queue === type)) {
            timers[index].anim.stop(gotoEnd);
            dequeue = false;
            timers.splice(index, 1);
          }
        }
        if (dequeue || !gotoEnd) {
          jQuery.dequeue(this, type);
        }
      });
    },
    finish: function(type) {
      if (type !== false) {
        type = type || "fx";
      }
      return this.each(function() {
        var index,
            data = data_priv.get(this),
            queue = data[type + "queue"],
            hooks = data[type + "queueHooks"],
            timers = jQuery.timers,
            length = queue ? queue.length : 0;
        data.finish = true;
        jQuery.queue(this, type, []);
        if (hooks && hooks.stop) {
          hooks.stop.call(this, true);
        }
        for (index = timers.length; index--; ) {
          if (timers[index].elem === this && timers[index].queue === type) {
            timers[index].anim.stop(true);
            timers.splice(index, 1);
          }
        }
        for (index = 0; index < length; index++) {
          if (queue[index] && queue[index].finish) {
            queue[index].finish.call(this);
          }
        }
        delete data.finish;
      });
    }
  });
  jQuery.each(["toggle", "show", "hide"], function(i, name) {
    var cssFn = jQuery.fn[name];
    jQuery.fn[name] = function(speed, easing, callback) {
      return speed == null || typeof speed === "boolean" ? cssFn.apply(this, arguments) : this.animate(genFx(name, true), speed, easing, callback);
    };
  });
  jQuery.each({
    slideDown: genFx("show"),
    slideUp: genFx("hide"),
    slideToggle: genFx("toggle"),
    fadeIn: {opacity: "show"},
    fadeOut: {opacity: "hide"},
    fadeToggle: {opacity: "toggle"}
  }, function(name, props) {
    jQuery.fn[name] = function(speed, easing, callback) {
      return this.animate(props, speed, easing, callback);
    };
  });
  jQuery.timers = [];
  jQuery.fx.tick = function() {
    var timer,
        i = 0,
        timers = jQuery.timers;
    fxNow = jQuery.now();
    for (; i < timers.length; i++) {
      timer = timers[i];
      if (!timer() && timers[i] === timer) {
        timers.splice(i--, 1);
      }
    }
    if (!timers.length) {
      jQuery.fx.stop();
    }
    fxNow = undefined;
  };
  jQuery.fx.timer = function(timer) {
    jQuery.timers.push(timer);
    if (timer()) {
      jQuery.fx.start();
    } else {
      jQuery.timers.pop();
    }
  };
  jQuery.fx.interval = 13;
  jQuery.fx.start = function() {
    if (!timerId) {
      timerId = setInterval(jQuery.fx.tick, jQuery.fx.interval);
    }
  };
  jQuery.fx.stop = function() {
    clearInterval(timerId);
    timerId = null;
  };
  jQuery.fx.speeds = {
    slow: 600,
    fast: 200,
    _default: 400
  };
  jQuery.fn.delay = function(time, type) {
    time = jQuery.fx ? jQuery.fx.speeds[time] || time : time;
    type = type || "fx";
    return this.queue(type, function(next, hooks) {
      var timeout = setTimeout(next, time);
      hooks.stop = function() {
        clearTimeout(timeout);
      };
    });
  };
  (function() {
    var input = document.createElement("input"),
        select = document.createElement("select"),
        opt = select.appendChild(document.createElement("option"));
    input.type = "checkbox";
    support.checkOn = input.value !== "";
    support.optSelected = opt.selected;
    select.disabled = true;
    support.optDisabled = !opt.disabled;
    input = document.createElement("input");
    input.value = "t";
    input.type = "radio";
    support.radioValue = input.value === "t";
  })();
  var nodeHook,
      boolHook,
      attrHandle = jQuery.expr.attrHandle;
  jQuery.fn.extend({
    attr: function(name, value) {
      return access(this, jQuery.attr, name, value, arguments.length > 1);
    },
    removeAttr: function(name) {
      return this.each(function() {
        jQuery.removeAttr(this, name);
      });
    }
  });
  jQuery.extend({
    attr: function(elem, name, value) {
      var hooks,
          ret,
          nType = elem.nodeType;
      if (!elem || nType === 3 || nType === 8 || nType === 2) {
        return;
      }
      if (typeof elem.getAttribute === strundefined) {
        return jQuery.prop(elem, name, value);
      }
      if (nType !== 1 || !jQuery.isXMLDoc(elem)) {
        name = name.toLowerCase();
        hooks = jQuery.attrHooks[name] || (jQuery.expr.match.bool.test(name) ? boolHook : nodeHook);
      }
      if (value !== undefined) {
        if (value === null) {
          jQuery.removeAttr(elem, name);
        } else if (hooks && "set" in hooks && (ret = hooks.set(elem, value, name)) !== undefined) {
          return ret;
        } else {
          elem.setAttribute(name, value + "");
          return value;
        }
      } else if (hooks && "get" in hooks && (ret = hooks.get(elem, name)) !== null) {
        return ret;
      } else {
        ret = jQuery.find.attr(elem, name);
        return ret == null ? undefined : ret;
      }
    },
    removeAttr: function(elem, value) {
      var name,
          propName,
          i = 0,
          attrNames = value && value.match(rnotwhite);
      if (attrNames && elem.nodeType === 1) {
        while ((name = attrNames[i++])) {
          propName = jQuery.propFix[name] || name;
          if (jQuery.expr.match.bool.test(name)) {
            elem[propName] = false;
          }
          elem.removeAttribute(name);
        }
      }
    },
    attrHooks: {type: {set: function(elem, value) {
          if (!support.radioValue && value === "radio" && jQuery.nodeName(elem, "input")) {
            var val = elem.value;
            elem.setAttribute("type", value);
            if (val) {
              elem.value = val;
            }
            return value;
          }
        }}}
  });
  boolHook = {set: function(elem, value, name) {
      if (value === false) {
        jQuery.removeAttr(elem, name);
      } else {
        elem.setAttribute(name, name);
      }
      return name;
    }};
  jQuery.each(jQuery.expr.match.bool.source.match(/\w+/g), function(i, name) {
    var getter = attrHandle[name] || jQuery.find.attr;
    attrHandle[name] = function(elem, name, isXML) {
      var ret,
          handle;
      if (!isXML) {
        handle = attrHandle[name];
        attrHandle[name] = ret;
        ret = getter(elem, name, isXML) != null ? name.toLowerCase() : null;
        attrHandle[name] = handle;
      }
      return ret;
    };
  });
  var rfocusable = /^(?:input|select|textarea|button)$/i;
  jQuery.fn.extend({
    prop: function(name, value) {
      return access(this, jQuery.prop, name, value, arguments.length > 1);
    },
    removeProp: function(name) {
      return this.each(function() {
        delete this[jQuery.propFix[name] || name];
      });
    }
  });
  jQuery.extend({
    propFix: {
      "for": "htmlFor",
      "class": "className"
    },
    prop: function(elem, name, value) {
      var ret,
          hooks,
          notxml,
          nType = elem.nodeType;
      if (!elem || nType === 3 || nType === 8 || nType === 2) {
        return;
      }
      notxml = nType !== 1 || !jQuery.isXMLDoc(elem);
      if (notxml) {
        name = jQuery.propFix[name] || name;
        hooks = jQuery.propHooks[name];
      }
      if (value !== undefined) {
        return hooks && "set" in hooks && (ret = hooks.set(elem, value, name)) !== undefined ? ret : (elem[name] = value);
      } else {
        return hooks && "get" in hooks && (ret = hooks.get(elem, name)) !== null ? ret : elem[name];
      }
    },
    propHooks: {tabIndex: {get: function(elem) {
          return elem.hasAttribute("tabindex") || rfocusable.test(elem.nodeName) || elem.href ? elem.tabIndex : -1;
        }}}
  });
  if (!support.optSelected) {
    jQuery.propHooks.selected = {get: function(elem) {
        var parent = elem.parentNode;
        if (parent && parent.parentNode) {
          parent.parentNode.selectedIndex;
        }
        return null;
      }};
  }
  jQuery.each(["tabIndex", "readOnly", "maxLength", "cellSpacing", "cellPadding", "rowSpan", "colSpan", "useMap", "frameBorder", "contentEditable"], function() {
    jQuery.propFix[this.toLowerCase()] = this;
  });
  var rclass = /[\t\r\n\f]/g;
  jQuery.fn.extend({
    addClass: function(value) {
      var classes,
          elem,
          cur,
          clazz,
          j,
          finalValue,
          proceed = typeof value === "string" && value,
          i = 0,
          len = this.length;
      if (jQuery.isFunction(value)) {
        return this.each(function(j) {
          jQuery(this).addClass(value.call(this, j, this.className));
        });
      }
      if (proceed) {
        classes = (value || "").match(rnotwhite) || [];
        for (; i < len; i++) {
          elem = this[i];
          cur = elem.nodeType === 1 && (elem.className ? (" " + elem.className + " ").replace(rclass, " ") : " ");
          if (cur) {
            j = 0;
            while ((clazz = classes[j++])) {
              if (cur.indexOf(" " + clazz + " ") < 0) {
                cur += clazz + " ";
              }
            }
            finalValue = jQuery.trim(cur);
            if (elem.className !== finalValue) {
              elem.className = finalValue;
            }
          }
        }
      }
      return this;
    },
    removeClass: function(value) {
      var classes,
          elem,
          cur,
          clazz,
          j,
          finalValue,
          proceed = arguments.length === 0 || typeof value === "string" && value,
          i = 0,
          len = this.length;
      if (jQuery.isFunction(value)) {
        return this.each(function(j) {
          jQuery(this).removeClass(value.call(this, j, this.className));
        });
      }
      if (proceed) {
        classes = (value || "").match(rnotwhite) || [];
        for (; i < len; i++) {
          elem = this[i];
          cur = elem.nodeType === 1 && (elem.className ? (" " + elem.className + " ").replace(rclass, " ") : "");
          if (cur) {
            j = 0;
            while ((clazz = classes[j++])) {
              while (cur.indexOf(" " + clazz + " ") >= 0) {
                cur = cur.replace(" " + clazz + " ", " ");
              }
            }
            finalValue = value ? jQuery.trim(cur) : "";
            if (elem.className !== finalValue) {
              elem.className = finalValue;
            }
          }
        }
      }
      return this;
    },
    toggleClass: function(value, stateVal) {
      var type = typeof value;
      if (typeof stateVal === "boolean" && type === "string") {
        return stateVal ? this.addClass(value) : this.removeClass(value);
      }
      if (jQuery.isFunction(value)) {
        return this.each(function(i) {
          jQuery(this).toggleClass(value.call(this, i, this.className, stateVal), stateVal);
        });
      }
      return this.each(function() {
        if (type === "string") {
          var className,
              i = 0,
              self = jQuery(this),
              classNames = value.match(rnotwhite) || [];
          while ((className = classNames[i++])) {
            if (self.hasClass(className)) {
              self.removeClass(className);
            } else {
              self.addClass(className);
            }
          }
        } else if (type === strundefined || type === "boolean") {
          if (this.className) {
            data_priv.set(this, "__className__", this.className);
          }
          this.className = this.className || value === false ? "" : data_priv.get(this, "__className__") || "";
        }
      });
    },
    hasClass: function(selector) {
      var className = " " + selector + " ",
          i = 0,
          l = this.length;
      for (; i < l; i++) {
        if (this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf(className) >= 0) {
          return true;
        }
      }
      return false;
    }
  });
  var rreturn = /\r/g;
  jQuery.fn.extend({val: function(value) {
      var hooks,
          ret,
          isFunction,
          elem = this[0];
      if (!arguments.length) {
        if (elem) {
          hooks = jQuery.valHooks[elem.type] || jQuery.valHooks[elem.nodeName.toLowerCase()];
          if (hooks && "get" in hooks && (ret = hooks.get(elem, "value")) !== undefined) {
            return ret;
          }
          ret = elem.value;
          return typeof ret === "string" ? ret.replace(rreturn, "") : ret == null ? "" : ret;
        }
        return;
      }
      isFunction = jQuery.isFunction(value);
      return this.each(function(i) {
        var val;
        if (this.nodeType !== 1) {
          return;
        }
        if (isFunction) {
          val = value.call(this, i, jQuery(this).val());
        } else {
          val = value;
        }
        if (val == null) {
          val = "";
        } else if (typeof val === "number") {
          val += "";
        } else if (jQuery.isArray(val)) {
          val = jQuery.map(val, function(value) {
            return value == null ? "" : value + "";
          });
        }
        hooks = jQuery.valHooks[this.type] || jQuery.valHooks[this.nodeName.toLowerCase()];
        if (!hooks || !("set" in hooks) || hooks.set(this, val, "value") === undefined) {
          this.value = val;
        }
      });
    }});
  jQuery.extend({valHooks: {
      option: {get: function(elem) {
          var val = jQuery.find.attr(elem, "value");
          return val != null ? val : jQuery.trim(jQuery.text(elem));
        }},
      select: {
        get: function(elem) {
          var value,
              option,
              options = elem.options,
              index = elem.selectedIndex,
              one = elem.type === "select-one" || index < 0,
              values = one ? null : [],
              max = one ? index + 1 : options.length,
              i = index < 0 ? max : one ? index : 0;
          for (; i < max; i++) {
            option = options[i];
            if ((option.selected || i === index) && (support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null) && (!option.parentNode.disabled || !jQuery.nodeName(option.parentNode, "optgroup"))) {
              value = jQuery(option).val();
              if (one) {
                return value;
              }
              values.push(value);
            }
          }
          return values;
        },
        set: function(elem, value) {
          var optionSet,
              option,
              options = elem.options,
              values = jQuery.makeArray(value),
              i = options.length;
          while (i--) {
            option = options[i];
            if ((option.selected = jQuery.inArray(option.value, values) >= 0)) {
              optionSet = true;
            }
          }
          if (!optionSet) {
            elem.selectedIndex = -1;
          }
          return values;
        }
      }
    }});
  jQuery.each(["radio", "checkbox"], function() {
    jQuery.valHooks[this] = {set: function(elem, value) {
        if (jQuery.isArray(value)) {
          return (elem.checked = jQuery.inArray(jQuery(elem).val(), value) >= 0);
        }
      }};
    if (!support.checkOn) {
      jQuery.valHooks[this].get = function(elem) {
        return elem.getAttribute("value") === null ? "on" : elem.value;
      };
    }
  });
  jQuery.each(("blur focus focusin focusout load resize scroll unload click dblclick " + "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " + "change select submit keydown keypress keyup error contextmenu").split(" "), function(i, name) {
    jQuery.fn[name] = function(data, fn) {
      return arguments.length > 0 ? this.on(name, null, data, fn) : this.trigger(name);
    };
  });
  jQuery.fn.extend({
    hover: function(fnOver, fnOut) {
      return this.mouseenter(fnOver).mouseleave(fnOut || fnOver);
    },
    bind: function(types, data, fn) {
      return this.on(types, null, data, fn);
    },
    unbind: function(types, fn) {
      return this.off(types, null, fn);
    },
    delegate: function(selector, types, data, fn) {
      return this.on(types, selector, data, fn);
    },
    undelegate: function(selector, types, fn) {
      return arguments.length === 1 ? this.off(selector, "**") : this.off(types, selector || "**", fn);
    }
  });
  var nonce = jQuery.now();
  var rquery = (/\?/);
  jQuery.parseJSON = function(data) {
    return JSON.parse(data + "");
  };
  jQuery.parseXML = function(data) {
    var xml,
        tmp;
    if (!data || typeof data !== "string") {
      return null;
    }
    try {
      tmp = new DOMParser();
      xml = tmp.parseFromString(data, "text/xml");
    } catch (e) {
      xml = undefined;
    }
    if (!xml || xml.getElementsByTagName("parsererror").length) {
      jQuery.error("Invalid XML: " + data);
    }
    return xml;
  };
  var rhash = /#.*$/,
      rts = /([?&])_=[^&]*/,
      rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
      rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
      rnoContent = /^(?:GET|HEAD)$/,
      rprotocol = /^\/\//,
      rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,
      prefilters = {},
      transports = {},
      allTypes = "*/".concat("*"),
      ajaxLocation = window.location.href,
      ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || [];
  function addToPrefiltersOrTransports(structure) {
    return function(dataTypeExpression, func) {
      if (typeof dataTypeExpression !== "string") {
        func = dataTypeExpression;
        dataTypeExpression = "*";
      }
      var dataType,
          i = 0,
          dataTypes = dataTypeExpression.toLowerCase().match(rnotwhite) || [];
      if (jQuery.isFunction(func)) {
        while ((dataType = dataTypes[i++])) {
          if (dataType[0] === "+") {
            dataType = dataType.slice(1) || "*";
            (structure[dataType] = structure[dataType] || []).unshift(func);
          } else {
            (structure[dataType] = structure[dataType] || []).push(func);
          }
        }
      }
    };
  }
  function inspectPrefiltersOrTransports(structure, options, originalOptions, jqXHR) {
    var inspected = {},
        seekingTransport = (structure === transports);
    function inspect(dataType) {
      var selected;
      inspected[dataType] = true;
      jQuery.each(structure[dataType] || [], function(_, prefilterOrFactory) {
        var dataTypeOrTransport = prefilterOrFactory(options, originalOptions, jqXHR);
        if (typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[dataTypeOrTransport]) {
          options.dataTypes.unshift(dataTypeOrTransport);
          inspect(dataTypeOrTransport);
          return false;
        } else if (seekingTransport) {
          return !(selected = dataTypeOrTransport);
        }
      });
      return selected;
    }
    return inspect(options.dataTypes[0]) || !inspected["*"] && inspect("*");
  }
  function ajaxExtend(target, src) {
    var key,
        deep,
        flatOptions = jQuery.ajaxSettings.flatOptions || {};
    for (key in src) {
      if (src[key] !== undefined) {
        (flatOptions[key] ? target : (deep || (deep = {})))[key] = src[key];
      }
    }
    if (deep) {
      jQuery.extend(true, target, deep);
    }
    return target;
  }
  function ajaxHandleResponses(s, jqXHR, responses) {
    var ct,
        type,
        finalDataType,
        firstDataType,
        contents = s.contents,
        dataTypes = s.dataTypes;
    while (dataTypes[0] === "*") {
      dataTypes.shift();
      if (ct === undefined) {
        ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
      }
    }
    if (ct) {
      for (type in contents) {
        if (contents[type] && contents[type].test(ct)) {
          dataTypes.unshift(type);
          break;
        }
      }
    }
    if (dataTypes[0] in responses) {
      finalDataType = dataTypes[0];
    } else {
      for (type in responses) {
        if (!dataTypes[0] || s.converters[type + " " + dataTypes[0]]) {
          finalDataType = type;
          break;
        }
        if (!firstDataType) {
          firstDataType = type;
        }
      }
      finalDataType = finalDataType || firstDataType;
    }
    if (finalDataType) {
      if (finalDataType !== dataTypes[0]) {
        dataTypes.unshift(finalDataType);
      }
      return responses[finalDataType];
    }
  }
  function ajaxConvert(s, response, jqXHR, isSuccess) {
    var conv2,
        current,
        conv,
        tmp,
        prev,
        converters = {},
        dataTypes = s.dataTypes.slice();
    if (dataTypes[1]) {
      for (conv in s.converters) {
        converters[conv.toLowerCase()] = s.converters[conv];
      }
    }
    current = dataTypes.shift();
    while (current) {
      if (s.responseFields[current]) {
        jqXHR[s.responseFields[current]] = response;
      }
      if (!prev && isSuccess && s.dataFilter) {
        response = s.dataFilter(response, s.dataType);
      }
      prev = current;
      current = dataTypes.shift();
      if (current) {
        if (current === "*") {
          current = prev;
        } else if (prev !== "*" && prev !== current) {
          conv = converters[prev + " " + current] || converters["* " + current];
          if (!conv) {
            for (conv2 in converters) {
              tmp = conv2.split(" ");
              if (tmp[1] === current) {
                conv = converters[prev + " " + tmp[0]] || converters["* " + tmp[0]];
                if (conv) {
                  if (conv === true) {
                    conv = converters[conv2];
                  } else if (converters[conv2] !== true) {
                    current = tmp[0];
                    dataTypes.unshift(tmp[1]);
                  }
                  break;
                }
              }
            }
          }
          if (conv !== true) {
            if (conv && s["throws"]) {
              response = conv(response);
            } else {
              try {
                response = conv(response);
              } catch (e) {
                return {
                  state: "parsererror",
                  error: conv ? e : "No conversion from " + prev + " to " + current
                };
              }
            }
          }
        }
      }
    }
    return {
      state: "success",
      data: response
    };
  }
  jQuery.extend({
    active: 0,
    lastModified: {},
    etag: {},
    ajaxSettings: {
      url: ajaxLocation,
      type: "GET",
      isLocal: rlocalProtocol.test(ajaxLocParts[1]),
      global: true,
      processData: true,
      async: true,
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      accepts: {
        "*": allTypes,
        text: "text/plain",
        html: "text/html",
        xml: "application/xml, text/xml",
        json: "application/json, text/javascript"
      },
      contents: {
        xml: /xml/,
        html: /html/,
        json: /json/
      },
      responseFields: {
        xml: "responseXML",
        text: "responseText",
        json: "responseJSON"
      },
      converters: {
        "* text": String,
        "text html": true,
        "text json": jQuery.parseJSON,
        "text xml": jQuery.parseXML
      },
      flatOptions: {
        url: true,
        context: true
      }
    },
    ajaxSetup: function(target, settings) {
      return settings ? ajaxExtend(ajaxExtend(target, jQuery.ajaxSettings), settings) : ajaxExtend(jQuery.ajaxSettings, target);
    },
    ajaxPrefilter: addToPrefiltersOrTransports(prefilters),
    ajaxTransport: addToPrefiltersOrTransports(transports),
    ajax: function(url, options) {
      if (typeof url === "object") {
        options = url;
        url = undefined;
      }
      options = options || {};
      var transport,
          cacheURL,
          responseHeadersString,
          responseHeaders,
          timeoutTimer,
          parts,
          fireGlobals,
          i,
          s = jQuery.ajaxSetup({}, options),
          callbackContext = s.context || s,
          globalEventContext = s.context && (callbackContext.nodeType || callbackContext.jquery) ? jQuery(callbackContext) : jQuery.event,
          deferred = jQuery.Deferred(),
          completeDeferred = jQuery.Callbacks("once memory"),
          statusCode = s.statusCode || {},
          requestHeaders = {},
          requestHeadersNames = {},
          state = 0,
          strAbort = "canceled",
          jqXHR = {
            readyState: 0,
            getResponseHeader: function(key) {
              var match;
              if (state === 2) {
                if (!responseHeaders) {
                  responseHeaders = {};
                  while ((match = rheaders.exec(responseHeadersString))) {
                    responseHeaders[match[1].toLowerCase()] = match[2];
                  }
                }
                match = responseHeaders[key.toLowerCase()];
              }
              return match == null ? null : match;
            },
            getAllResponseHeaders: function() {
              return state === 2 ? responseHeadersString : null;
            },
            setRequestHeader: function(name, value) {
              var lname = name.toLowerCase();
              if (!state) {
                name = requestHeadersNames[lname] = requestHeadersNames[lname] || name;
                requestHeaders[name] = value;
              }
              return this;
            },
            overrideMimeType: function(type) {
              if (!state) {
                s.mimeType = type;
              }
              return this;
            },
            statusCode: function(map) {
              var code;
              if (map) {
                if (state < 2) {
                  for (code in map) {
                    statusCode[code] = [statusCode[code], map[code]];
                  }
                } else {
                  jqXHR.always(map[jqXHR.status]);
                }
              }
              return this;
            },
            abort: function(statusText) {
              var finalText = statusText || strAbort;
              if (transport) {
                transport.abort(finalText);
              }
              done(0, finalText);
              return this;
            }
          };
      deferred.promise(jqXHR).complete = completeDeferred.add;
      jqXHR.success = jqXHR.done;
      jqXHR.error = jqXHR.fail;
      s.url = ((url || s.url || ajaxLocation) + "").replace(rhash, "").replace(rprotocol, ajaxLocParts[1] + "//");
      s.type = options.method || options.type || s.method || s.type;
      s.dataTypes = jQuery.trim(s.dataType || "*").toLowerCase().match(rnotwhite) || [""];
      if (s.crossDomain == null) {
        parts = rurl.exec(s.url.toLowerCase());
        s.crossDomain = !!(parts && (parts[1] !== ajaxLocParts[1] || parts[2] !== ajaxLocParts[2] || (parts[3] || (parts[1] === "http:" ? "80" : "443")) !== (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? "80" : "443"))));
      }
      if (s.data && s.processData && typeof s.data !== "string") {
        s.data = jQuery.param(s.data, s.traditional);
      }
      inspectPrefiltersOrTransports(prefilters, s, options, jqXHR);
      if (state === 2) {
        return jqXHR;
      }
      fireGlobals = jQuery.event && s.global;
      if (fireGlobals && jQuery.active++ === 0) {
        jQuery.event.trigger("ajaxStart");
      }
      s.type = s.type.toUpperCase();
      s.hasContent = !rnoContent.test(s.type);
      cacheURL = s.url;
      if (!s.hasContent) {
        if (s.data) {
          cacheURL = (s.url += (rquery.test(cacheURL) ? "&" : "?") + s.data);
          delete s.data;
        }
        if (s.cache === false) {
          s.url = rts.test(cacheURL) ? cacheURL.replace(rts, "$1_=" + nonce++) : cacheURL + (rquery.test(cacheURL) ? "&" : "?") + "_=" + nonce++;
        }
      }
      if (s.ifModified) {
        if (jQuery.lastModified[cacheURL]) {
          jqXHR.setRequestHeader("If-Modified-Since", jQuery.lastModified[cacheURL]);
        }
        if (jQuery.etag[cacheURL]) {
          jqXHR.setRequestHeader("If-None-Match", jQuery.etag[cacheURL]);
        }
      }
      if (s.data && s.hasContent && s.contentType !== false || options.contentType) {
        jqXHR.setRequestHeader("Content-Type", s.contentType);
      }
      jqXHR.setRequestHeader("Accept", s.dataTypes[0] && s.accepts[s.dataTypes[0]] ? s.accepts[s.dataTypes[0]] + (s.dataTypes[0] !== "*" ? ", " + allTypes + "; q=0.01" : "") : s.accepts["*"]);
      for (i in s.headers) {
        jqXHR.setRequestHeader(i, s.headers[i]);
      }
      if (s.beforeSend && (s.beforeSend.call(callbackContext, jqXHR, s) === false || state === 2)) {
        return jqXHR.abort();
      }
      strAbort = "abort";
      for (i in {
        success: 1,
        error: 1,
        complete: 1
      }) {
        jqXHR[i](s[i]);
      }
      transport = inspectPrefiltersOrTransports(transports, s, options, jqXHR);
      if (!transport) {
        done(-1, "No Transport");
      } else {
        jqXHR.readyState = 1;
        if (fireGlobals) {
          globalEventContext.trigger("ajaxSend", [jqXHR, s]);
        }
        if (s.async && s.timeout > 0) {
          timeoutTimer = setTimeout(function() {
            jqXHR.abort("timeout");
          }, s.timeout);
        }
        try {
          state = 1;
          transport.send(requestHeaders, done);
        } catch (e) {
          if (state < 2) {
            done(-1, e);
          } else {
            throw e;
          }
        }
      }
      function done(status, nativeStatusText, responses, headers) {
        var isSuccess,
            success,
            error,
            response,
            modified,
            statusText = nativeStatusText;
        if (state === 2) {
          return;
        }
        state = 2;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        transport = undefined;
        responseHeadersString = headers || "";
        jqXHR.readyState = status > 0 ? 4 : 0;
        isSuccess = status >= 200 && status < 300 || status === 304;
        if (responses) {
          response = ajaxHandleResponses(s, jqXHR, responses);
        }
        response = ajaxConvert(s, response, jqXHR, isSuccess);
        if (isSuccess) {
          if (s.ifModified) {
            modified = jqXHR.getResponseHeader("Last-Modified");
            if (modified) {
              jQuery.lastModified[cacheURL] = modified;
            }
            modified = jqXHR.getResponseHeader("etag");
            if (modified) {
              jQuery.etag[cacheURL] = modified;
            }
          }
          if (status === 204 || s.type === "HEAD") {
            statusText = "nocontent";
          } else if (status === 304) {
            statusText = "notmodified";
          } else {
            statusText = response.state;
            success = response.data;
            error = response.error;
            isSuccess = !error;
          }
        } else {
          error = statusText;
          if (status || !statusText) {
            statusText = "error";
            if (status < 0) {
              status = 0;
            }
          }
        }
        jqXHR.status = status;
        jqXHR.statusText = (nativeStatusText || statusText) + "";
        if (isSuccess) {
          deferred.resolveWith(callbackContext, [success, statusText, jqXHR]);
        } else {
          deferred.rejectWith(callbackContext, [jqXHR, statusText, error]);
        }
        jqXHR.statusCode(statusCode);
        statusCode = undefined;
        if (fireGlobals) {
          globalEventContext.trigger(isSuccess ? "ajaxSuccess" : "ajaxError", [jqXHR, s, isSuccess ? success : error]);
        }
        completeDeferred.fireWith(callbackContext, [jqXHR, statusText]);
        if (fireGlobals) {
          globalEventContext.trigger("ajaxComplete", [jqXHR, s]);
          if (!(--jQuery.active)) {
            jQuery.event.trigger("ajaxStop");
          }
        }
      }
      return jqXHR;
    },
    getJSON: function(url, data, callback) {
      return jQuery.get(url, data, callback, "json");
    },
    getScript: function(url, callback) {
      return jQuery.get(url, undefined, callback, "script");
    }
  });
  jQuery.each(["get", "post"], function(i, method) {
    jQuery[method] = function(url, data, callback, type) {
      if (jQuery.isFunction(data)) {
        type = type || callback;
        callback = data;
        data = undefined;
      }
      return jQuery.ajax({
        url: url,
        type: method,
        dataType: type,
        data: data,
        success: callback
      });
    };
  });
  jQuery._evalUrl = function(url) {
    return jQuery.ajax({
      url: url,
      type: "GET",
      dataType: "script",
      async: false,
      global: false,
      "throws": true
    });
  };
  jQuery.fn.extend({
    wrapAll: function(html) {
      var wrap;
      if (jQuery.isFunction(html)) {
        return this.each(function(i) {
          jQuery(this).wrapAll(html.call(this, i));
        });
      }
      if (this[0]) {
        wrap = jQuery(html, this[0].ownerDocument).eq(0).clone(true);
        if (this[0].parentNode) {
          wrap.insertBefore(this[0]);
        }
        wrap.map(function() {
          var elem = this;
          while (elem.firstElementChild) {
            elem = elem.firstElementChild;
          }
          return elem;
        }).append(this);
      }
      return this;
    },
    wrapInner: function(html) {
      if (jQuery.isFunction(html)) {
        return this.each(function(i) {
          jQuery(this).wrapInner(html.call(this, i));
        });
      }
      return this.each(function() {
        var self = jQuery(this),
            contents = self.contents();
        if (contents.length) {
          contents.wrapAll(html);
        } else {
          self.append(html);
        }
      });
    },
    wrap: function(html) {
      var isFunction = jQuery.isFunction(html);
      return this.each(function(i) {
        jQuery(this).wrapAll(isFunction ? html.call(this, i) : html);
      });
    },
    unwrap: function() {
      return this.parent().each(function() {
        if (!jQuery.nodeName(this, "body")) {
          jQuery(this).replaceWith(this.childNodes);
        }
      }).end();
    }
  });
  jQuery.expr.filters.hidden = function(elem) {
    return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
  };
  jQuery.expr.filters.visible = function(elem) {
    return !jQuery.expr.filters.hidden(elem);
  };
  var r20 = /%20/g,
      rbracket = /\[\]$/,
      rCRLF = /\r?\n/g,
      rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
      rsubmittable = /^(?:input|select|textarea|keygen)/i;
  function buildParams(prefix, obj, traditional, add) {
    var name;
    if (jQuery.isArray(obj)) {
      jQuery.each(obj, function(i, v) {
        if (traditional || rbracket.test(prefix)) {
          add(prefix, v);
        } else {
          buildParams(prefix + "[" + (typeof v === "object" ? i : "") + "]", v, traditional, add);
        }
      });
    } else if (!traditional && jQuery.type(obj) === "object") {
      for (name in obj) {
        buildParams(prefix + "[" + name + "]", obj[name], traditional, add);
      }
    } else {
      add(prefix, obj);
    }
  }
  jQuery.param = function(a, traditional) {
    var prefix,
        s = [],
        add = function(key, value) {
          value = jQuery.isFunction(value) ? value() : (value == null ? "" : value);
          s[s.length] = encodeURIComponent(key) + "=" + encodeURIComponent(value);
        };
    if (traditional === undefined) {
      traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
    }
    if (jQuery.isArray(a) || (a.jquery && !jQuery.isPlainObject(a))) {
      jQuery.each(a, function() {
        add(this.name, this.value);
      });
    } else {
      for (prefix in a) {
        buildParams(prefix, a[prefix], traditional, add);
      }
    }
    return s.join("&").replace(r20, "+");
  };
  jQuery.fn.extend({
    serialize: function() {
      return jQuery.param(this.serializeArray());
    },
    serializeArray: function() {
      return this.map(function() {
        var elements = jQuery.prop(this, "elements");
        return elements ? jQuery.makeArray(elements) : this;
      }).filter(function() {
        var type = this.type;
        return this.name && !jQuery(this).is(":disabled") && rsubmittable.test(this.nodeName) && !rsubmitterTypes.test(type) && (this.checked || !rcheckableType.test(type));
      }).map(function(i, elem) {
        var val = jQuery(this).val();
        return val == null ? null : jQuery.isArray(val) ? jQuery.map(val, function(val) {
          return {
            name: elem.name,
            value: val.replace(rCRLF, "\r\n")
          };
        }) : {
          name: elem.name,
          value: val.replace(rCRLF, "\r\n")
        };
      }).get();
    }
  });
  jQuery.ajaxSettings.xhr = function() {
    try {
      return new XMLHttpRequest();
    } catch (e) {}
  };
  var xhrId = 0,
      xhrCallbacks = {},
      xhrSuccessStatus = {
        0: 200,
        1223: 204
      },
      xhrSupported = jQuery.ajaxSettings.xhr();
  if (window.attachEvent) {
    window.attachEvent("onunload", function() {
      for (var key in xhrCallbacks) {
        xhrCallbacks[key]();
      }
    });
  }
  support.cors = !!xhrSupported && ("withCredentials" in xhrSupported);
  support.ajax = xhrSupported = !!xhrSupported;
  jQuery.ajaxTransport(function(options) {
    var callback;
    if (support.cors || xhrSupported && !options.crossDomain) {
      return {
        send: function(headers, complete) {
          var i,
              xhr = options.xhr(),
              id = ++xhrId;
          xhr.open(options.type, options.url, options.async, options.username, options.password);
          if (options.xhrFields) {
            for (i in options.xhrFields) {
              xhr[i] = options.xhrFields[i];
            }
          }
          if (options.mimeType && xhr.overrideMimeType) {
            xhr.overrideMimeType(options.mimeType);
          }
          if (!options.crossDomain && !headers["X-Requested-With"]) {
            headers["X-Requested-With"] = "XMLHttpRequest";
          }
          for (i in headers) {
            xhr.setRequestHeader(i, headers[i]);
          }
          callback = function(type) {
            return function() {
              if (callback) {
                delete xhrCallbacks[id];
                callback = xhr.onload = xhr.onerror = null;
                if (type === "abort") {
                  xhr.abort();
                } else if (type === "error") {
                  complete(xhr.status, xhr.statusText);
                } else {
                  complete(xhrSuccessStatus[xhr.status] || xhr.status, xhr.statusText, typeof xhr.responseText === "string" ? {text: xhr.responseText} : undefined, xhr.getAllResponseHeaders());
                }
              }
            };
          };
          xhr.onload = callback();
          xhr.onerror = callback("error");
          callback = xhrCallbacks[id] = callback("abort");
          try {
            xhr.send(options.hasContent && options.data || null);
          } catch (e) {
            if (callback) {
              throw e;
            }
          }
        },
        abort: function() {
          if (callback) {
            callback();
          }
        }
      };
    }
  });
  jQuery.ajaxSetup({
    accepts: {script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},
    contents: {script: /(?:java|ecma)script/},
    converters: {"text script": function(text) {
        jQuery.globalEval(text);
        return text;
      }}
  });
  jQuery.ajaxPrefilter("script", function(s) {
    if (s.cache === undefined) {
      s.cache = false;
    }
    if (s.crossDomain) {
      s.type = "GET";
    }
  });
  jQuery.ajaxTransport("script", function(s) {
    if (s.crossDomain) {
      var script,
          callback;
      return {
        send: function(_, complete) {
          script = jQuery("<script>").prop({
            async: true,
            charset: s.scriptCharset,
            src: s.url
          }).on("load error", callback = function(evt) {
            script.remove();
            callback = null;
            if (evt) {
              complete(evt.type === "error" ? 404 : 200, evt.type);
            }
          });
          document.head.appendChild(script[0]);
        },
        abort: function() {
          if (callback) {
            callback();
          }
        }
      };
    }
  });
  var oldCallbacks = [],
      rjsonp = /(=)\?(?=&|$)|\?\?/;
  jQuery.ajaxSetup({
    jsonp: "callback",
    jsonpCallback: function() {
      var callback = oldCallbacks.pop() || (jQuery.expando + "_" + (nonce++));
      this[callback] = true;
      return callback;
    }
  });
  jQuery.ajaxPrefilter("json jsonp", function(s, originalSettings, jqXHR) {
    var callbackName,
        overwritten,
        responseContainer,
        jsonProp = s.jsonp !== false && (rjsonp.test(s.url) ? "url" : typeof s.data === "string" && !(s.contentType || "").indexOf("application/x-www-form-urlencoded") && rjsonp.test(s.data) && "data");
    if (jsonProp || s.dataTypes[0] === "jsonp") {
      callbackName = s.jsonpCallback = jQuery.isFunction(s.jsonpCallback) ? s.jsonpCallback() : s.jsonpCallback;
      if (jsonProp) {
        s[jsonProp] = s[jsonProp].replace(rjsonp, "$1" + callbackName);
      } else if (s.jsonp !== false) {
        s.url += (rquery.test(s.url) ? "&" : "?") + s.jsonp + "=" + callbackName;
      }
      s.converters["script json"] = function() {
        if (!responseContainer) {
          jQuery.error(callbackName + " was not called");
        }
        return responseContainer[0];
      };
      s.dataTypes[0] = "json";
      overwritten = window[callbackName];
      window[callbackName] = function() {
        responseContainer = arguments;
      };
      jqXHR.always(function() {
        window[callbackName] = overwritten;
        if (s[callbackName]) {
          s.jsonpCallback = originalSettings.jsonpCallback;
          oldCallbacks.push(callbackName);
        }
        if (responseContainer && jQuery.isFunction(overwritten)) {
          overwritten(responseContainer[0]);
        }
        responseContainer = overwritten = undefined;
      });
      return "script";
    }
  });
  jQuery.parseHTML = function(data, context, keepScripts) {
    if (!data || typeof data !== "string") {
      return null;
    }
    if (typeof context === "boolean") {
      keepScripts = context;
      context = false;
    }
    context = context || document;
    var parsed = rsingleTag.exec(data),
        scripts = !keepScripts && [];
    if (parsed) {
      return [context.createElement(parsed[1])];
    }
    parsed = jQuery.buildFragment([data], context, scripts);
    if (scripts && scripts.length) {
      jQuery(scripts).remove();
    }
    return jQuery.merge([], parsed.childNodes);
  };
  var _load = jQuery.fn.load;
  jQuery.fn.load = function(url, params, callback) {
    if (typeof url !== "string" && _load) {
      return _load.apply(this, arguments);
    }
    var selector,
        type,
        response,
        self = this,
        off = url.indexOf(" ");
    if (off >= 0) {
      selector = jQuery.trim(url.slice(off));
      url = url.slice(0, off);
    }
    if (jQuery.isFunction(params)) {
      callback = params;
      params = undefined;
    } else if (params && typeof params === "object") {
      type = "POST";
    }
    if (self.length > 0) {
      jQuery.ajax({
        url: url,
        type: type,
        dataType: "html",
        data: params
      }).done(function(responseText) {
        response = arguments;
        self.html(selector ? jQuery("<div>").append(jQuery.parseHTML(responseText)).find(selector) : responseText);
      }).complete(callback && function(jqXHR, status) {
        self.each(callback, response || [jqXHR.responseText, status, jqXHR]);
      });
    }
    return this;
  };
  jQuery.each(["ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend"], function(i, type) {
    jQuery.fn[type] = function(fn) {
      return this.on(type, fn);
    };
  });
  jQuery.expr.filters.animated = function(elem) {
    return jQuery.grep(jQuery.timers, function(fn) {
      return elem === fn.elem;
    }).length;
  };
  var docElem = window.document.documentElement;
  function getWindow(elem) {
    return jQuery.isWindow(elem) ? elem : elem.nodeType === 9 && elem.defaultView;
  }
  jQuery.offset = {setOffset: function(elem, options, i) {
      var curPosition,
          curLeft,
          curCSSTop,
          curTop,
          curOffset,
          curCSSLeft,
          calculatePosition,
          position = jQuery.css(elem, "position"),
          curElem = jQuery(elem),
          props = {};
      if (position === "static") {
        elem.style.position = "relative";
      }
      curOffset = curElem.offset();
      curCSSTop = jQuery.css(elem, "top");
      curCSSLeft = jQuery.css(elem, "left");
      calculatePosition = (position === "absolute" || position === "fixed") && (curCSSTop + curCSSLeft).indexOf("auto") > -1;
      if (calculatePosition) {
        curPosition = curElem.position();
        curTop = curPosition.top;
        curLeft = curPosition.left;
      } else {
        curTop = parseFloat(curCSSTop) || 0;
        curLeft = parseFloat(curCSSLeft) || 0;
      }
      if (jQuery.isFunction(options)) {
        options = options.call(elem, i, curOffset);
      }
      if (options.top != null) {
        props.top = (options.top - curOffset.top) + curTop;
      }
      if (options.left != null) {
        props.left = (options.left - curOffset.left) + curLeft;
      }
      if ("using" in options) {
        options.using.call(elem, props);
      } else {
        curElem.css(props);
      }
    }};
  jQuery.fn.extend({
    offset: function(options) {
      if (arguments.length) {
        return options === undefined ? this : this.each(function(i) {
          jQuery.offset.setOffset(this, options, i);
        });
      }
      var docElem,
          win,
          elem = this[0],
          box = {
            top: 0,
            left: 0
          },
          doc = elem && elem.ownerDocument;
      if (!doc) {
        return;
      }
      docElem = doc.documentElement;
      if (!jQuery.contains(docElem, elem)) {
        return box;
      }
      if (typeof elem.getBoundingClientRect !== strundefined) {
        box = elem.getBoundingClientRect();
      }
      win = getWindow(doc);
      return {
        top: box.top + win.pageYOffset - docElem.clientTop,
        left: box.left + win.pageXOffset - docElem.clientLeft
      };
    },
    position: function() {
      if (!this[0]) {
        return;
      }
      var offsetParent,
          offset,
          elem = this[0],
          parentOffset = {
            top: 0,
            left: 0
          };
      if (jQuery.css(elem, "position") === "fixed") {
        offset = elem.getBoundingClientRect();
      } else {
        offsetParent = this.offsetParent();
        offset = this.offset();
        if (!jQuery.nodeName(offsetParent[0], "html")) {
          parentOffset = offsetParent.offset();
        }
        parentOffset.top += jQuery.css(offsetParent[0], "borderTopWidth", true);
        parentOffset.left += jQuery.css(offsetParent[0], "borderLeftWidth", true);
      }
      return {
        top: offset.top - parentOffset.top - jQuery.css(elem, "marginTop", true),
        left: offset.left - parentOffset.left - jQuery.css(elem, "marginLeft", true)
      };
    },
    offsetParent: function() {
      return this.map(function() {
        var offsetParent = this.offsetParent || docElem;
        while (offsetParent && (!jQuery.nodeName(offsetParent, "html") && jQuery.css(offsetParent, "position") === "static")) {
          offsetParent = offsetParent.offsetParent;
        }
        return offsetParent || docElem;
      });
    }
  });
  jQuery.each({
    scrollLeft: "pageXOffset",
    scrollTop: "pageYOffset"
  }, function(method, prop) {
    var top = "pageYOffset" === prop;
    jQuery.fn[method] = function(val) {
      return access(this, function(elem, method, val) {
        var win = getWindow(elem);
        if (val === undefined) {
          return win ? win[prop] : elem[method];
        }
        if (win) {
          win.scrollTo(!top ? val : window.pageXOffset, top ? val : window.pageYOffset);
        } else {
          elem[method] = val;
        }
      }, method, val, arguments.length, null);
    };
  });
  jQuery.each(["top", "left"], function(i, prop) {
    jQuery.cssHooks[prop] = addGetHookIf(support.pixelPosition, function(elem, computed) {
      if (computed) {
        computed = curCSS(elem, prop);
        return rnumnonpx.test(computed) ? jQuery(elem).position()[prop] + "px" : computed;
      }
    });
  });
  jQuery.each({
    Height: "height",
    Width: "width"
  }, function(name, type) {
    jQuery.each({
      padding: "inner" + name,
      content: type,
      "": "outer" + name
    }, function(defaultExtra, funcName) {
      jQuery.fn[funcName] = function(margin, value) {
        var chainable = arguments.length && (defaultExtra || typeof margin !== "boolean"),
            extra = defaultExtra || (margin === true || value === true ? "margin" : "border");
        return access(this, function(elem, type, value) {
          var doc;
          if (jQuery.isWindow(elem)) {
            return elem.document.documentElement["client" + name];
          }
          if (elem.nodeType === 9) {
            doc = elem.documentElement;
            return Math.max(elem.body["scroll" + name], doc["scroll" + name], elem.body["offset" + name], doc["offset" + name], doc["client" + name]);
          }
          return value === undefined ? jQuery.css(elem, type, extra) : jQuery.style(elem, type, value, extra);
        }, type, chainable ? margin : undefined, chainable, null);
      };
    });
  });
  jQuery.fn.size = function() {
    return this.length;
  };
  jQuery.fn.andSelf = jQuery.fn.addBack;
  if (typeof define === "function" && define.amd) {
    System.register("github:components/jquery@2.1.3/jquery", [], false, function(__require, __exports, __module) {
      return (function() {
        return jQuery;
      }).call(this);
    });
  }
  var _jQuery = window.jQuery,
      _$ = window.$;
  jQuery.noConflict = function(deep) {
    if (window.$ === jQuery) {
      window.$ = _$;
    }
    if (deep && window.jQuery === jQuery) {
      window.jQuery = _jQuery;
    }
    return jQuery;
  };
  if (typeof noGlobal === strundefined) {
    window.jQuery = window.$ = jQuery;
  }
  return jQuery;
}));


})();
System.register("npm:process@0.10.0/browser", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  function drainQueue() {
    if (draining) {
      return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      var i = -1;
      while (++i < len) {
        currentQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  process.nextTick = function(fun) {
    queue.push(fun);
    if (!draining) {
      setTimeout(drainQueue, 0);
    }
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});



System.register("lib/constants", [], function($__export) {
  "use strict";
  var __moduleName = "lib/constants";
  var BING_URL,
      FORECAST_URL,
      FLICKR_URL,
      FLICKR_PHOTO_URL,
      SAVED_ADDRESS_KEY,
      SAVED_FORECAST_KEY,
      SAVED_PHOTOS_KEY,
      FORECAST_KEY,
      BING_KEY,
      FLICKR_KEY,
      FLICKR_WEATHER_GROUP_ID,
      LOCAL_STORAGE_EXPIRATION;
  return {
    setters: [],
    execute: function() {
      BING_URL = $__export("BING_URL", 'http://dev.virtualearth.net/REST/v1/Locations/%f,%f?includeEntityTypes=Address&output=json&callback=jsonp&key=%s');
      FORECAST_URL = $__export("FORECAST_URL", 'https://api.forecast.io/forecast/%s/%f,%f');
      FLICKR_URL = $__export("FLICKR_URL", 'https://api.flickr.com/services/rest/?method=flickr.photos.search&api_key=%s&safe_search=1&lat=%f&lon=%f&group_id=%s&format=json&nojsoncallback=1');
      FLICKR_PHOTO_URL = $__export("FLICKR_PHOTO_URL", 'https://farm%s.staticflickr.com/%s/%s_%s_b.jpg');
      SAVED_ADDRESS_KEY = $__export("SAVED_ADDRESS_KEY", 'SAVED_ADDRESS');
      SAVED_FORECAST_KEY = $__export("SAVED_FORECAST_KEY", 'SAVED_FORECAST_KEY');
      SAVED_PHOTOS_KEY = $__export("SAVED_PHOTOS_KEY", 'SAVED_PHOTOS_KEY');
      FORECAST_KEY = $__export("FORECAST_KEY", '0f9abf3de31cd1840ae2678512ec1b07');
      BING_KEY = $__export("BING_KEY", 'Ap_46PGiEwOhWsR44SoFoYUO9_XaMRgXf7TdLHcU_6hWa3Br6hiV3fESATe9GtAh');
      FLICKR_KEY = $__export("FLICKR_KEY", '66e352ae5a742ff9e843f3d256c0150d');
      FLICKR_WEATHER_GROUP_ID = $__export("FLICKR_WEATHER_GROUP_ID", '1463451@N25');
      LOCAL_STORAGE_EXPIRATION = $__export("LOCAL_STORAGE_EXPIRATION", 3);
    }
  };
});



System.register("npm:ms@0.6.2/index", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var s = 1000;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var y = d * 365.25;
  module.exports = function(val, options) {
    options = options || {};
    if ('string' == typeof val)
      return parse(val);
    return options.long ? long(val) : short(val);
  };
  function parse(str) {
    var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
    if (!match)
      return;
    var n = parseFloat(match[1]);
    var type = (match[2] || 'ms').toLowerCase();
    switch (type) {
      case 'years':
      case 'year':
      case 'y':
        return n * y;
      case 'days':
      case 'day':
      case 'd':
        return n * d;
      case 'hours':
      case 'hour':
      case 'h':
        return n * h;
      case 'minutes':
      case 'minute':
      case 'm':
        return n * m;
      case 'seconds':
      case 'second':
      case 's':
        return n * s;
      case 'ms':
        return n;
    }
  }
  function short(ms) {
    if (ms >= d)
      return Math.round(ms / d) + 'd';
    if (ms >= h)
      return Math.round(ms / h) + 'h';
    if (ms >= m)
      return Math.round(ms / m) + 'm';
    if (ms >= s)
      return Math.round(ms / s) + 's';
    return ms + 'ms';
  }
  function long(ms) {
    return plural(ms, d, 'day') || plural(ms, h, 'hour') || plural(ms, m, 'minute') || plural(ms, s, 'second') || ms + ' ms';
  }
  function plural(ms, n, name) {
    if (ms < n)
      return;
    if (ms < n * 1.5)
      return Math.floor(ms / n) + ' ' + name;
    return Math.ceil(ms / n) + ' ' + name + 's';
  }
  global.define = __define;
  return module.exports;
});



System.register("npm:format@0.2.1/format", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  ;
  (function() {
    var namespace;
    if (typeof module !== 'undefined') {
      namespace = module.exports = format;
    } else {
      namespace = (function() {
        return this || (1, eval)('this');
      }());
    }
    namespace.format = format;
    namespace.vsprintf = vsprintf;
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      namespace.printf = printf;
    }
    function printf() {
      console.log(format.apply(null, arguments));
    }
    function vsprintf(fmt, replacements) {
      return format.apply(null, [fmt].concat(replacements));
    }
    function format(fmt) {
      var argIndex = 1,
          args = [].slice.call(arguments),
          i = 0,
          n = fmt.length,
          result = '',
          c,
          escaped = false,
          arg,
          precision,
          nextArg = function() {
            return args[argIndex++];
          },
          slurpNumber = function() {
            var digits = '';
            while (fmt[i].match(/\d/))
              digits += fmt[i++];
            return digits.length > 0 ? parseInt(digits) : null;
          };
      ;
      for (; i < n; ++i) {
        c = fmt[i];
        if (escaped) {
          escaped = false;
          precision = slurpNumber();
          switch (c) {
            case 'b':
              result += parseInt(nextArg(), 10).toString(2);
              break;
            case 'c':
              arg = nextArg();
              if (typeof arg === 'string' || arg instanceof String)
                result += arg;
              else
                result += String.fromCharCode(parseInt(arg, 10));
              break;
            case 'd':
              result += parseInt(nextArg(), 10);
              break;
            case 'f':
              result += parseFloat(nextArg()).toFixed(precision || 6);
              break;
            case 'o':
              result += '0' + parseInt(nextArg(), 10).toString(8);
              break;
            case 's':
              result += nextArg();
              break;
            case 'x':
              result += '0x' + parseInt(nextArg(), 10).toString(16);
              break;
            case 'X':
              result += '0x' + parseInt(nextArg(), 10).toString(16).toUpperCase();
              break;
            default:
              result += c;
              break;
          }
        } else if (c === '%') {
          escaped = true;
        } else {
          result += c;
        }
      }
      return result;
    }
  }());
  global.define = __define;
  return module.exports;
});



System.register("lib/forecastService", ["npm:jsonp@0.1.0", "npm:format@0.2.1", "lib/constants"], function($__export) {
  "use strict";
  var __moduleName = "lib/forecastService";
  var jsonp,
      format,
      Constants,
      ForecastService;
  return {
    setters: [function(m) {
      jsonp = m.default;
    }, function(m) {
      format = m.default;
    }, function(m) {
      Constants = m;
    }],
    execute: function() {
      ForecastService = (function() {
        var ForecastService = function ForecastService(forecastKey) {
          this.forecastKey = forecastKey;
        };
        return ($traceurRuntime.createClass)(ForecastService, {getForecast: function(location) {
            var $__0 = this;
            return new Promise((function(resolve, reject) {
              var url = format(Constants.FORECAST_URL, $__0.forecastKey, location.lat, location.log);
              jsonp(url, null, (function(err, data) {
                err ? reject(err) : resolve(data);
              }));
            }));
          }}, {});
      }());
      $__export('default', ForecastService);
    }
  };
});



System.register("npm:moment@2.9.0/moment", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function(undefined) {
    var moment,
        VERSION = '2.9.0',
        globalScope = (typeof global !== 'undefined' && (typeof window === 'undefined' || window === global.window)) ? global : this,
        oldGlobalMoment,
        round = Math.round,
        hasOwnProperty = Object.prototype.hasOwnProperty,
        i,
        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,
        locales = {},
        momentProperties = [],
        hasModule = (typeof module !== 'undefined' && module && module.exports),
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|x|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g,
        parseTokenOneOrTwoDigits = /\d\d?/,
        parseTokenOneToThreeDigits = /\d{1,3}/,
        parseTokenOneToFourDigits = /\d{1,4}/,
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/,
        parseTokenDigits = /\d+/,
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i,
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi,
        parseTokenT = /T/i,
        parseTokenOffsetMs = /[\+\-]?\d+/,
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/,
        parseTokenOneDigit = /\d/,
        parseTokenTwoDigits = /\d\d/,
        parseTokenThreeDigits = /\d{3}/,
        parseTokenFourDigits = /\d{4}/,
        parseTokenSixDigits = /[+-]?\d{6}/,
        parseTokenSignedNumber = /[+-]?\d+/,
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,
        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',
        isoDates = [['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/], ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/], ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/], ['GGGG-[W]WW', /\d{4}-W\d{2}/], ['YYYY-DDD', /\d{4}-\d{3}/]],
        isoTimes = [['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/], ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/], ['HH:mm', /(T| )\d\d:\d\d/], ['HH', /(T| )\d\d/]],
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
          'Milliseconds': 1,
          'Seconds': 1e3,
          'Minutes': 6e4,
          'Hours': 36e5,
          'Days': 864e5,
          'Months': 2592e6,
          'Years': 31536e6
        },
        unitAliases = {
          ms: 'millisecond',
          s: 'second',
          m: 'minute',
          h: 'hour',
          d: 'day',
          D: 'date',
          w: 'week',
          W: 'isoWeek',
          M: 'month',
          Q: 'quarter',
          y: 'year',
          DDD: 'dayOfYear',
          e: 'weekday',
          E: 'isoWeekday',
          gg: 'weekYear',
          GG: 'isoWeekYear'
        },
        camelFunctions = {
          dayofyear: 'dayOfYear',
          isoweekday: 'isoWeekday',
          isoweek: 'isoWeek',
          weekyear: 'weekYear',
          isoweekyear: 'isoWeekYear'
        },
        formatFunctions = {},
        relativeTimeThresholds = {
          s: 45,
          m: 45,
          h: 22,
          d: 26,
          M: 11
        },
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),
        formatTokenFunctions = {
          M: function() {
            return this.month() + 1;
          },
          MMM: function(format) {
            return this.localeData().monthsShort(this, format);
          },
          MMMM: function(format) {
            return this.localeData().months(this, format);
          },
          D: function() {
            return this.date();
          },
          DDD: function() {
            return this.dayOfYear();
          },
          d: function() {
            return this.day();
          },
          dd: function(format) {
            return this.localeData().weekdaysMin(this, format);
          },
          ddd: function(format) {
            return this.localeData().weekdaysShort(this, format);
          },
          dddd: function(format) {
            return this.localeData().weekdays(this, format);
          },
          w: function() {
            return this.week();
          },
          W: function() {
            return this.isoWeek();
          },
          YY: function() {
            return leftZeroFill(this.year() % 100, 2);
          },
          YYYY: function() {
            return leftZeroFill(this.year(), 4);
          },
          YYYYY: function() {
            return leftZeroFill(this.year(), 5);
          },
          YYYYYY: function() {
            var y = this.year(),
                sign = y >= 0 ? '+' : '-';
            return sign + leftZeroFill(Math.abs(y), 6);
          },
          gg: function() {
            return leftZeroFill(this.weekYear() % 100, 2);
          },
          gggg: function() {
            return leftZeroFill(this.weekYear(), 4);
          },
          ggggg: function() {
            return leftZeroFill(this.weekYear(), 5);
          },
          GG: function() {
            return leftZeroFill(this.isoWeekYear() % 100, 2);
          },
          GGGG: function() {
            return leftZeroFill(this.isoWeekYear(), 4);
          },
          GGGGG: function() {
            return leftZeroFill(this.isoWeekYear(), 5);
          },
          e: function() {
            return this.weekday();
          },
          E: function() {
            return this.isoWeekday();
          },
          a: function() {
            return this.localeData().meridiem(this.hours(), this.minutes(), true);
          },
          A: function() {
            return this.localeData().meridiem(this.hours(), this.minutes(), false);
          },
          H: function() {
            return this.hours();
          },
          h: function() {
            return this.hours() % 12 || 12;
          },
          m: function() {
            return this.minutes();
          },
          s: function() {
            return this.seconds();
          },
          S: function() {
            return toInt(this.milliseconds() / 100);
          },
          SS: function() {
            return leftZeroFill(toInt(this.milliseconds() / 10), 2);
          },
          SSS: function() {
            return leftZeroFill(this.milliseconds(), 3);
          },
          SSSS: function() {
            return leftZeroFill(this.milliseconds(), 3);
          },
          Z: function() {
            var a = this.utcOffset(),
                b = '+';
            if (a < 0) {
              a = -a;
              b = '-';
            }
            return b + leftZeroFill(toInt(a / 60), 2) + ':' + leftZeroFill(toInt(a) % 60, 2);
          },
          ZZ: function() {
            var a = this.utcOffset(),
                b = '+';
            if (a < 0) {
              a = -a;
              b = '-';
            }
            return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
          },
          z: function() {
            return this.zoneAbbr();
          },
          zz: function() {
            return this.zoneName();
          },
          x: function() {
            return this.valueOf();
          },
          X: function() {
            return this.unix();
          },
          Q: function() {
            return this.quarter();
          }
        },
        deprecations = {},
        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'],
        updateInProgress = false;
    function dfl(a, b, c) {
      switch (arguments.length) {
        case 2:
          return a != null ? a : b;
        case 3:
          return a != null ? a : b != null ? b : c;
        default:
          throw new Error('Implement me');
      }
    }
    function hasOwnProp(a, b) {
      return hasOwnProperty.call(a, b);
    }
    function defaultParsingFlags() {
      return {
        empty: false,
        unusedTokens: [],
        unusedInput: [],
        overflow: -2,
        charsLeftOver: 0,
        nullInput: false,
        invalidMonth: null,
        invalidFormat: false,
        userInvalidated: false,
        iso: false
      };
    }
    function printMsg(msg) {
      if (moment.suppressDeprecationWarnings === false && typeof console !== 'undefined' && console.warn) {
        console.warn('Deprecation warning: ' + msg);
      }
    }
    function deprecate(msg, fn) {
      var firstTime = true;
      return extend(function() {
        if (firstTime) {
          printMsg(msg);
          firstTime = false;
        }
        return fn.apply(this, arguments);
      }, fn);
    }
    function deprecateSimple(name, msg) {
      if (!deprecations[name]) {
        printMsg(msg);
        deprecations[name] = true;
      }
    }
    function padToken(func, count) {
      return function(a) {
        return leftZeroFill(func.call(this, a), count);
      };
    }
    function ordinalizeToken(func, period) {
      return function(a) {
        return this.localeData().ordinal(func.call(this, a), period);
      };
    }
    function monthDiff(a, b) {
      var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
          anchor = a.clone().add(wholeMonthDiff, 'months'),
          anchor2,
          adjust;
      if (b - anchor < 0) {
        anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
        adjust = (b - anchor) / (anchor - anchor2);
      } else {
        anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
        adjust = (b - anchor) / (anchor2 - anchor);
      }
      return -(wholeMonthDiff + adjust);
    }
    while (ordinalizeTokens.length) {
      i = ordinalizeTokens.pop();
      formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
      i = paddedTokens.pop();
      formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);
    function meridiemFixWrap(locale, hour, meridiem) {
      var isPm;
      if (meridiem == null) {
        return hour;
      }
      if (locale.meridiemHour != null) {
        return locale.meridiemHour(hour, meridiem);
      } else if (locale.isPM != null) {
        isPm = locale.isPM(meridiem);
        if (isPm && hour < 12) {
          hour += 12;
        }
        if (!isPm && hour === 12) {
          hour = 0;
        }
        return hour;
      } else {
        return hour;
      }
    }
    function Locale() {}
    function Moment(config, skipOverflow) {
      if (skipOverflow !== false) {
        checkOverflow(config);
      }
      copyConfig(this, config);
      this._d = new Date(+config._d);
      if (updateInProgress === false) {
        updateInProgress = true;
        moment.updateOffset(this);
        updateInProgress = false;
      }
    }
    function Duration(duration) {
      var normalizedInput = normalizeObjectUnits(duration),
          years = normalizedInput.year || 0,
          quarters = normalizedInput.quarter || 0,
          months = normalizedInput.month || 0,
          weeks = normalizedInput.week || 0,
          days = normalizedInput.day || 0,
          hours = normalizedInput.hour || 0,
          minutes = normalizedInput.minute || 0,
          seconds = normalizedInput.second || 0,
          milliseconds = normalizedInput.millisecond || 0;
      this._milliseconds = +milliseconds + seconds * 1e3 + minutes * 6e4 + hours * 36e5;
      this._days = +days + weeks * 7;
      this._months = +months + quarters * 3 + years * 12;
      this._data = {};
      this._locale = moment.localeData();
      this._bubble();
    }
    function extend(a, b) {
      for (var i in b) {
        if (hasOwnProp(b, i)) {
          a[i] = b[i];
        }
      }
      if (hasOwnProp(b, 'toString')) {
        a.toString = b.toString;
      }
      if (hasOwnProp(b, 'valueOf')) {
        a.valueOf = b.valueOf;
      }
      return a;
    }
    function copyConfig(to, from) {
      var i,
          prop,
          val;
      if (typeof from._isAMomentObject !== 'undefined') {
        to._isAMomentObject = from._isAMomentObject;
      }
      if (typeof from._i !== 'undefined') {
        to._i = from._i;
      }
      if (typeof from._f !== 'undefined') {
        to._f = from._f;
      }
      if (typeof from._l !== 'undefined') {
        to._l = from._l;
      }
      if (typeof from._strict !== 'undefined') {
        to._strict = from._strict;
      }
      if (typeof from._tzm !== 'undefined') {
        to._tzm = from._tzm;
      }
      if (typeof from._isUTC !== 'undefined') {
        to._isUTC = from._isUTC;
      }
      if (typeof from._offset !== 'undefined') {
        to._offset = from._offset;
      }
      if (typeof from._pf !== 'undefined') {
        to._pf = from._pf;
      }
      if (typeof from._locale !== 'undefined') {
        to._locale = from._locale;
      }
      if (momentProperties.length > 0) {
        for (i in momentProperties) {
          prop = momentProperties[i];
          val = from[prop];
          if (typeof val !== 'undefined') {
            to[prop] = val;
          }
        }
      }
      return to;
    }
    function absRound(number) {
      if (number < 0) {
        return Math.ceil(number);
      } else {
        return Math.floor(number);
      }
    }
    function leftZeroFill(number, targetLength, forceSign) {
      var output = '' + Math.abs(number),
          sign = number >= 0;
      while (output.length < targetLength) {
        output = '0' + output;
      }
      return (sign ? (forceSign ? '+' : '') : '-') + output;
    }
    function positiveMomentsDifference(base, other) {
      var res = {
        milliseconds: 0,
        months: 0
      };
      res.months = other.month() - base.month() + (other.year() - base.year()) * 12;
      if (base.clone().add(res.months, 'M').isAfter(other)) {
        --res.months;
      }
      res.milliseconds = +other - +(base.clone().add(res.months, 'M'));
      return res;
    }
    function momentsDifference(base, other) {
      var res;
      other = makeAs(other, base);
      if (base.isBefore(other)) {
        res = positiveMomentsDifference(base, other);
      } else {
        res = positiveMomentsDifference(other, base);
        res.milliseconds = -res.milliseconds;
        res.months = -res.months;
      }
      return res;
    }
    function createAdder(direction, name) {
      return function(val, period) {
        var dur,
            tmp;
        if (period !== null && !isNaN(+period)) {
          deprecateSimple(name, 'moment().' + name + '(period, number) is deprecated. Please use moment().' + name + '(number, period).');
          tmp = val;
          val = period;
          period = tmp;
        }
        val = typeof val === 'string' ? +val : val;
        dur = moment.duration(val, period);
        addOrSubtractDurationFromMoment(this, dur, direction);
        return this;
      };
    }
    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
      var milliseconds = duration._milliseconds,
          days = duration._days,
          months = duration._months;
      updateOffset = updateOffset == null ? true : updateOffset;
      if (milliseconds) {
        mom._d.setTime(+mom._d + milliseconds * isAdding);
      }
      if (days) {
        rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
      }
      if (months) {
        rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
      }
      if (updateOffset) {
        moment.updateOffset(mom, days || months);
      }
    }
    function isArray(input) {
      return Object.prototype.toString.call(input) === '[object Array]';
    }
    function isDate(input) {
      return Object.prototype.toString.call(input) === '[object Date]' || input instanceof Date;
    }
    function compareArrays(array1, array2, dontConvert) {
      var len = Math.min(array1.length, array2.length),
          lengthDiff = Math.abs(array1.length - array2.length),
          diffs = 0,
          i;
      for (i = 0; i < len; i++) {
        if ((dontConvert && array1[i] !== array2[i]) || (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
          diffs++;
        }
      }
      return diffs + lengthDiff;
    }
    function normalizeUnits(units) {
      if (units) {
        var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
        units = unitAliases[units] || camelFunctions[lowered] || lowered;
      }
      return units;
    }
    function normalizeObjectUnits(inputObject) {
      var normalizedInput = {},
          normalizedProp,
          prop;
      for (prop in inputObject) {
        if (hasOwnProp(inputObject, prop)) {
          normalizedProp = normalizeUnits(prop);
          if (normalizedProp) {
            normalizedInput[normalizedProp] = inputObject[prop];
          }
        }
      }
      return normalizedInput;
    }
    function makeList(field) {
      var count,
          setter;
      if (field.indexOf('week') === 0) {
        count = 7;
        setter = 'day';
      } else if (field.indexOf('month') === 0) {
        count = 12;
        setter = 'month';
      } else {
        return;
      }
      moment[field] = function(format, index) {
        var i,
            getter,
            method = moment._locale[field],
            results = [];
        if (typeof format === 'number') {
          index = format;
          format = undefined;
        }
        getter = function(i) {
          var m = moment().utc().set(setter, i);
          return method.call(moment._locale, m, format || '');
        };
        if (index != null) {
          return getter(index);
        } else {
          for (i = 0; i < count; i++) {
            results.push(getter(i));
          }
          return results;
        }
      };
    }
    function toInt(argumentForCoercion) {
      var coercedNumber = +argumentForCoercion,
          value = 0;
      if (coercedNumber !== 0 && isFinite(coercedNumber)) {
        if (coercedNumber >= 0) {
          value = Math.floor(coercedNumber);
        } else {
          value = Math.ceil(coercedNumber);
        }
      }
      return value;
    }
    function daysInMonth(year, month) {
      return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }
    function weeksInYear(year, dow, doy) {
      return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }
    function daysInYear(year) {
      return isLeapYear(year) ? 366 : 365;
    }
    function isLeapYear(year) {
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }
    function checkOverflow(m) {
      var overflow;
      if (m._a && m._pf.overflow === -2) {
        overflow = m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH : m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE : m._a[HOUR] < 0 || m._a[HOUR] > 24 || (m._a[HOUR] === 24 && (m._a[MINUTE] !== 0 || m._a[SECOND] !== 0 || m._a[MILLISECOND] !== 0)) ? HOUR : m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE : m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND : m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND : -1;
        if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
          overflow = DATE;
        }
        m._pf.overflow = overflow;
      }
    }
    function isValid(m) {
      if (m._isValid == null) {
        m._isValid = !isNaN(m._d.getTime()) && m._pf.overflow < 0 && !m._pf.empty && !m._pf.invalidMonth && !m._pf.nullInput && !m._pf.invalidFormat && !m._pf.userInvalidated;
        if (m._strict) {
          m._isValid = m._isValid && m._pf.charsLeftOver === 0 && m._pf.unusedTokens.length === 0 && m._pf.bigHour === undefined;
        }
      }
      return m._isValid;
    }
    function normalizeLocale(key) {
      return key ? key.toLowerCase().replace('_', '-') : key;
    }
    function chooseLocale(names) {
      var i = 0,
          j,
          next,
          locale,
          split;
      while (i < names.length) {
        split = normalizeLocale(names[i]).split('-');
        j = split.length;
        next = normalizeLocale(names[i + 1]);
        next = next ? next.split('-') : null;
        while (j > 0) {
          locale = loadLocale(split.slice(0, j).join('-'));
          if (locale) {
            return locale;
          }
          if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
            break;
          }
          j--;
        }
        i++;
      }
      return null;
    }
    function loadLocale(name) {
      var oldLocale = null;
      if (!locales[name] && hasModule) {
        try {
          oldLocale = moment.locale();
          require('./locale/' + name);
          moment.locale(oldLocale);
        } catch (e) {}
      }
      return locales[name];
    }
    function makeAs(input, model) {
      var res,
          diff;
      if (model._isUTC) {
        res = model.clone();
        diff = (moment.isMoment(input) || isDate(input) ? +input : +moment(input)) - (+res);
        res._d.setTime(+res._d + diff);
        moment.updateOffset(res, false);
        return res;
      } else {
        return moment(input).local();
      }
    }
    extend(Locale.prototype, {
      set: function(config) {
        var prop,
            i;
        for (i in config) {
          prop = config[i];
          if (typeof prop === 'function') {
            this[i] = prop;
          } else {
            this['_' + i] = prop;
          }
        }
        this._ordinalParseLenient = new RegExp(this._ordinalParse.source + '|' + /\d{1,2}/.source);
      },
      _months: 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_'),
      months: function(m) {
        return this._months[m.month()];
      },
      _monthsShort: 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
      monthsShort: function(m) {
        return this._monthsShort[m.month()];
      },
      monthsParse: function(monthName, format, strict) {
        var i,
            mom,
            regex;
        if (!this._monthsParse) {
          this._monthsParse = [];
          this._longMonthsParse = [];
          this._shortMonthsParse = [];
        }
        for (i = 0; i < 12; i++) {
          mom = moment.utc([2000, i]);
          if (strict && !this._longMonthsParse[i]) {
            this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
            this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
          }
          if (!strict && !this._monthsParse[i]) {
            regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
            this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
          }
          if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
            return i;
          } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
            return i;
          } else if (!strict && this._monthsParse[i].test(monthName)) {
            return i;
          }
        }
      },
      _weekdays: 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
      weekdays: function(m) {
        return this._weekdays[m.day()];
      },
      _weekdaysShort: 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
      weekdaysShort: function(m) {
        return this._weekdaysShort[m.day()];
      },
      _weekdaysMin: 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
      weekdaysMin: function(m) {
        return this._weekdaysMin[m.day()];
      },
      weekdaysParse: function(weekdayName) {
        var i,
            mom,
            regex;
        if (!this._weekdaysParse) {
          this._weekdaysParse = [];
        }
        for (i = 0; i < 7; i++) {
          if (!this._weekdaysParse[i]) {
            mom = moment([2000, 1]).day(i);
            regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
            this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
          }
          if (this._weekdaysParse[i].test(weekdayName)) {
            return i;
          }
        }
      },
      _longDateFormat: {
        LTS: 'h:mm:ss A',
        LT: 'h:mm A',
        L: 'MM/DD/YYYY',
        LL: 'MMMM D, YYYY',
        LLL: 'MMMM D, YYYY LT',
        LLLL: 'dddd, MMMM D, YYYY LT'
      },
      longDateFormat: function(key) {
        var output = this._longDateFormat[key];
        if (!output && this._longDateFormat[key.toUpperCase()]) {
          output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function(val) {
            return val.slice(1);
          });
          this._longDateFormat[key] = output;
        }
        return output;
      },
      isPM: function(input) {
        return ((input + '').toLowerCase().charAt(0) === 'p');
      },
      _meridiemParse: /[ap]\.?m?\.?/i,
      meridiem: function(hours, minutes, isLower) {
        if (hours > 11) {
          return isLower ? 'pm' : 'PM';
        } else {
          return isLower ? 'am' : 'AM';
        }
      },
      _calendar: {
        sameDay: '[Today at] LT',
        nextDay: '[Tomorrow at] LT',
        nextWeek: 'dddd [at] LT',
        lastDay: '[Yesterday at] LT',
        lastWeek: '[Last] dddd [at] LT',
        sameElse: 'L'
      },
      calendar: function(key, mom, now) {
        var output = this._calendar[key];
        return typeof output === 'function' ? output.apply(mom, [now]) : output;
      },
      _relativeTime: {
        future: 'in %s',
        past: '%s ago',
        s: 'a few seconds',
        m: 'a minute',
        mm: '%d minutes',
        h: 'an hour',
        hh: '%d hours',
        d: 'a day',
        dd: '%d days',
        M: 'a month',
        MM: '%d months',
        y: 'a year',
        yy: '%d years'
      },
      relativeTime: function(number, withoutSuffix, string, isFuture) {
        var output = this._relativeTime[string];
        return (typeof output === 'function') ? output(number, withoutSuffix, string, isFuture) : output.replace(/%d/i, number);
      },
      pastFuture: function(diff, output) {
        var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
        return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
      },
      ordinal: function(number) {
        return this._ordinal.replace('%d', number);
      },
      _ordinal: '%d',
      _ordinalParse: /\d{1,2}/,
      preparse: function(string) {
        return string;
      },
      postformat: function(string) {
        return string;
      },
      week: function(mom) {
        return weekOfYear(mom, this._week.dow, this._week.doy).week;
      },
      _week: {
        dow: 0,
        doy: 6
      },
      firstDayOfWeek: function() {
        return this._week.dow;
      },
      firstDayOfYear: function() {
        return this._week.doy;
      },
      _invalidDate: 'Invalid date',
      invalidDate: function() {
        return this._invalidDate;
      }
    });
    function removeFormattingTokens(input) {
      if (input.match(/\[[\s\S]/)) {
        return input.replace(/^\[|\]$/g, '');
      }
      return input.replace(/\\/g, '');
    }
    function makeFormatFunction(format) {
      var array = format.match(formattingTokens),
          i,
          length;
      for (i = 0, length = array.length; i < length; i++) {
        if (formatTokenFunctions[array[i]]) {
          array[i] = formatTokenFunctions[array[i]];
        } else {
          array[i] = removeFormattingTokens(array[i]);
        }
      }
      return function(mom) {
        var output = '';
        for (i = 0; i < length; i++) {
          output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
        }
        return output;
      };
    }
    function formatMoment(m, format) {
      if (!m.isValid()) {
        return m.localeData().invalidDate();
      }
      format = expandFormat(format, m.localeData());
      if (!formatFunctions[format]) {
        formatFunctions[format] = makeFormatFunction(format);
      }
      return formatFunctions[format](m);
    }
    function expandFormat(format, locale) {
      var i = 5;
      function replaceLongDateFormatTokens(input) {
        return locale.longDateFormat(input) || input;
      }
      localFormattingTokens.lastIndex = 0;
      while (i >= 0 && localFormattingTokens.test(format)) {
        format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        localFormattingTokens.lastIndex = 0;
        i -= 1;
      }
      return format;
    }
    function getParseRegexForToken(token, config) {
      var a,
          strict = config._strict;
      switch (token) {
        case 'Q':
          return parseTokenOneDigit;
        case 'DDDD':
          return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
          return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
          return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
          return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
          if (strict) {
            return parseTokenOneDigit;
          }
        case 'SS':
          if (strict) {
            return parseTokenTwoDigits;
          }
        case 'SSS':
          if (strict) {
            return parseTokenThreeDigits;
          }
        case 'DDD':
          return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
          return parseTokenWord;
        case 'a':
        case 'A':
          return config._locale._meridiemParse;
        case 'x':
          return parseTokenOffsetMs;
        case 'X':
          return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
          return parseTokenTimezone;
        case 'T':
          return parseTokenT;
        case 'SSSS':
          return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
          return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
          return parseTokenOneOrTwoDigits;
        case 'Do':
          return strict ? config._locale._ordinalParse : config._locale._ordinalParseLenient;
        default:
          a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), 'i'));
          return a;
      }
    }
    function utcOffsetFromString(string) {
      string = string || '';
      var possibleTzMatches = (string.match(parseTokenTimezone) || []),
          tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
          parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
          minutes = +(parts[1] * 60) + toInt(parts[2]);
      return parts[0] === '+' ? minutes : -minutes;
    }
    function addTimeToArrayFromToken(token, input, config) {
      var a,
          datePartArray = config._a;
      switch (token) {
        case 'Q':
          if (input != null) {
            datePartArray[MONTH] = (toInt(input) - 1) * 3;
          }
          break;
        case 'M':
        case 'MM':
          if (input != null) {
            datePartArray[MONTH] = toInt(input) - 1;
          }
          break;
        case 'MMM':
        case 'MMMM':
          a = config._locale.monthsParse(input, token, config._strict);
          if (a != null) {
            datePartArray[MONTH] = a;
          } else {
            config._pf.invalidMonth = input;
          }
          break;
        case 'D':
        case 'DD':
          if (input != null) {
            datePartArray[DATE] = toInt(input);
          }
          break;
        case 'Do':
          if (input != null) {
            datePartArray[DATE] = toInt(parseInt(input.match(/\d{1,2}/)[0], 10));
          }
          break;
        case 'DDD':
        case 'DDDD':
          if (input != null) {
            config._dayOfYear = toInt(input);
          }
          break;
        case 'YY':
          datePartArray[YEAR] = moment.parseTwoDigitYear(input);
          break;
        case 'YYYY':
        case 'YYYYY':
        case 'YYYYYY':
          datePartArray[YEAR] = toInt(input);
          break;
        case 'a':
        case 'A':
          config._meridiem = input;
          break;
        case 'h':
        case 'hh':
          config._pf.bigHour = true;
        case 'H':
        case 'HH':
          datePartArray[HOUR] = toInt(input);
          break;
        case 'm':
        case 'mm':
          datePartArray[MINUTE] = toInt(input);
          break;
        case 's':
        case 'ss':
          datePartArray[SECOND] = toInt(input);
          break;
        case 'S':
        case 'SS':
        case 'SSS':
        case 'SSSS':
          datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
          break;
        case 'x':
          config._d = new Date(toInt(input));
          break;
        case 'X':
          config._d = new Date(parseFloat(input) * 1000);
          break;
        case 'Z':
        case 'ZZ':
          config._useUTC = true;
          config._tzm = utcOffsetFromString(input);
          break;
        case 'dd':
        case 'ddd':
        case 'dddd':
          a = config._locale.weekdaysParse(input);
          if (a != null) {
            config._w = config._w || {};
            config._w['d'] = a;
          } else {
            config._pf.invalidWeekday = input;
          }
          break;
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'e':
        case 'E':
          token = token.substr(0, 1);
        case 'gggg':
        case 'GGGG':
        case 'GGGGG':
          token = token.substr(0, 2);
          if (input) {
            config._w = config._w || {};
            config._w[token] = toInt(input);
          }
          break;
        case 'gg':
        case 'GG':
          config._w = config._w || {};
          config._w[token] = moment.parseTwoDigitYear(input);
      }
    }
    function dayOfYearFromWeekInfo(config) {
      var w,
          weekYear,
          week,
          weekday,
          dow,
          doy,
          temp;
      w = config._w;
      if (w.GG != null || w.W != null || w.E != null) {
        dow = 1;
        doy = 4;
        weekYear = dfl(w.GG, config._a[YEAR], weekOfYear(moment(), 1, 4).year);
        week = dfl(w.W, 1);
        weekday = dfl(w.E, 1);
      } else {
        dow = config._locale._week.dow;
        doy = config._locale._week.doy;
        weekYear = dfl(w.gg, config._a[YEAR], weekOfYear(moment(), dow, doy).year);
        week = dfl(w.w, 1);
        if (w.d != null) {
          weekday = w.d;
          if (weekday < dow) {
            ++week;
          }
        } else if (w.e != null) {
          weekday = w.e + dow;
        } else {
          weekday = dow;
        }
      }
      temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);
      config._a[YEAR] = temp.year;
      config._dayOfYear = temp.dayOfYear;
    }
    function dateFromConfig(config) {
      var i,
          date,
          input = [],
          currentDate,
          yearToUse;
      if (config._d) {
        return;
      }
      currentDate = currentDateArray(config);
      if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
        dayOfYearFromWeekInfo(config);
      }
      if (config._dayOfYear) {
        yearToUse = dfl(config._a[YEAR], currentDate[YEAR]);
        if (config._dayOfYear > daysInYear(yearToUse)) {
          config._pf._overflowDayOfYear = true;
        }
        date = makeUTCDate(yearToUse, 0, config._dayOfYear);
        config._a[MONTH] = date.getUTCMonth();
        config._a[DATE] = date.getUTCDate();
      }
      for (i = 0; i < 3 && config._a[i] == null; ++i) {
        config._a[i] = input[i] = currentDate[i];
      }
      for (; i < 7; i++) {
        config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
      }
      if (config._a[HOUR] === 24 && config._a[MINUTE] === 0 && config._a[SECOND] === 0 && config._a[MILLISECOND] === 0) {
        config._nextDay = true;
        config._a[HOUR] = 0;
      }
      config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
      if (config._tzm != null) {
        config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
      }
      if (config._nextDay) {
        config._a[HOUR] = 24;
      }
    }
    function dateFromObject(config) {
      var normalizedInput;
      if (config._d) {
        return;
      }
      normalizedInput = normalizeObjectUnits(config._i);
      config._a = [normalizedInput.year, normalizedInput.month, normalizedInput.day || normalizedInput.date, normalizedInput.hour, normalizedInput.minute, normalizedInput.second, normalizedInput.millisecond];
      dateFromConfig(config);
    }
    function currentDateArray(config) {
      var now = new Date();
      if (config._useUTC) {
        return [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()];
      } else {
        return [now.getFullYear(), now.getMonth(), now.getDate()];
      }
    }
    function makeDateFromStringAndFormat(config) {
      if (config._f === moment.ISO_8601) {
        parseISO(config);
        return;
      }
      config._a = [];
      config._pf.empty = true;
      var string = '' + config._i,
          i,
          parsedInput,
          tokens,
          token,
          skipped,
          stringLength = string.length,
          totalParsedInputLength = 0;
      tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];
      for (i = 0; i < tokens.length; i++) {
        token = tokens[i];
        parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
        if (parsedInput) {
          skipped = string.substr(0, string.indexOf(parsedInput));
          if (skipped.length > 0) {
            config._pf.unusedInput.push(skipped);
          }
          string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
          totalParsedInputLength += parsedInput.length;
        }
        if (formatTokenFunctions[token]) {
          if (parsedInput) {
            config._pf.empty = false;
          } else {
            config._pf.unusedTokens.push(token);
          }
          addTimeToArrayFromToken(token, parsedInput, config);
        } else if (config._strict && !parsedInput) {
          config._pf.unusedTokens.push(token);
        }
      }
      config._pf.charsLeftOver = stringLength - totalParsedInputLength;
      if (string.length > 0) {
        config._pf.unusedInput.push(string);
      }
      if (config._pf.bigHour === true && config._a[HOUR] <= 12) {
        config._pf.bigHour = undefined;
      }
      config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);
      dateFromConfig(config);
      checkOverflow(config);
    }
    function unescapeFormat(s) {
      return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function(matched, p1, p2, p3, p4) {
        return p1 || p2 || p3 || p4;
      });
    }
    function regexpEscape(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    function makeDateFromStringAndArray(config) {
      var tempConfig,
          bestMoment,
          scoreToBeat,
          i,
          currentScore;
      if (config._f.length === 0) {
        config._pf.invalidFormat = true;
        config._d = new Date(NaN);
        return;
      }
      for (i = 0; i < config._f.length; i++) {
        currentScore = 0;
        tempConfig = copyConfig({}, config);
        if (config._useUTC != null) {
          tempConfig._useUTC = config._useUTC;
        }
        tempConfig._pf = defaultParsingFlags();
        tempConfig._f = config._f[i];
        makeDateFromStringAndFormat(tempConfig);
        if (!isValid(tempConfig)) {
          continue;
        }
        currentScore += tempConfig._pf.charsLeftOver;
        currentScore += tempConfig._pf.unusedTokens.length * 10;
        tempConfig._pf.score = currentScore;
        if (scoreToBeat == null || currentScore < scoreToBeat) {
          scoreToBeat = currentScore;
          bestMoment = tempConfig;
        }
      }
      extend(config, bestMoment || tempConfig);
    }
    function parseISO(config) {
      var i,
          l,
          string = config._i,
          match = isoRegex.exec(string);
      if (match) {
        config._pf.iso = true;
        for (i = 0, l = isoDates.length; i < l; i++) {
          if (isoDates[i][1].exec(string)) {
            config._f = isoDates[i][0] + (match[6] || ' ');
            break;
          }
        }
        for (i = 0, l = isoTimes.length; i < l; i++) {
          if (isoTimes[i][1].exec(string)) {
            config._f += isoTimes[i][0];
            break;
          }
        }
        if (string.match(parseTokenTimezone)) {
          config._f += 'Z';
        }
        makeDateFromStringAndFormat(config);
      } else {
        config._isValid = false;
      }
    }
    function makeDateFromString(config) {
      parseISO(config);
      if (config._isValid === false) {
        delete config._isValid;
        moment.createFromInputFallback(config);
      }
    }
    function map(arr, fn) {
      var res = [],
          i;
      for (i = 0; i < arr.length; ++i) {
        res.push(fn(arr[i], i));
      }
      return res;
    }
    function makeDateFromInput(config) {
      var input = config._i,
          matched;
      if (input === undefined) {
        config._d = new Date();
      } else if (isDate(input)) {
        config._d = new Date(+input);
      } else if ((matched = aspNetJsonRegex.exec(input)) !== null) {
        config._d = new Date(+matched[1]);
      } else if (typeof input === 'string') {
        makeDateFromString(config);
      } else if (isArray(input)) {
        config._a = map(input.slice(0), function(obj) {
          return parseInt(obj, 10);
        });
        dateFromConfig(config);
      } else if (typeof(input) === 'object') {
        dateFromObject(config);
      } else if (typeof(input) === 'number') {
        config._d = new Date(input);
      } else {
        moment.createFromInputFallback(config);
      }
    }
    function makeDate(y, m, d, h, M, s, ms) {
      var date = new Date(y, m, d, h, M, s, ms);
      if (y < 1970) {
        date.setFullYear(y);
      }
      return date;
    }
    function makeUTCDate(y) {
      var date = new Date(Date.UTC.apply(null, arguments));
      if (y < 1970) {
        date.setUTCFullYear(y);
      }
      return date;
    }
    function parseWeekday(input, locale) {
      if (typeof input === 'string') {
        if (!isNaN(input)) {
          input = parseInt(input, 10);
        } else {
          input = locale.weekdaysParse(input);
          if (typeof input !== 'number') {
            return null;
          }
        }
      }
      return input;
    }
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
      return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }
    function relativeTime(posNegDuration, withoutSuffix, locale) {
      var duration = moment.duration(posNegDuration).abs(),
          seconds = round(duration.as('s')),
          minutes = round(duration.as('m')),
          hours = round(duration.as('h')),
          days = round(duration.as('d')),
          months = round(duration.as('M')),
          years = round(duration.as('y')),
          args = seconds < relativeTimeThresholds.s && ['s', seconds] || minutes === 1 && ['m'] || minutes < relativeTimeThresholds.m && ['mm', minutes] || hours === 1 && ['h'] || hours < relativeTimeThresholds.h && ['hh', hours] || days === 1 && ['d'] || days < relativeTimeThresholds.d && ['dd', days] || months === 1 && ['M'] || months < relativeTimeThresholds.M && ['MM', months] || years === 1 && ['y'] || ['yy', years];
      args[2] = withoutSuffix;
      args[3] = +posNegDuration > 0;
      args[4] = locale;
      return substituteTimeAgo.apply({}, args);
    }
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
      var end = firstDayOfWeekOfYear - firstDayOfWeek,
          daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
          adjustedMoment;
      if (daysToDayOfWeek > end) {
        daysToDayOfWeek -= 7;
      }
      if (daysToDayOfWeek < end - 7) {
        daysToDayOfWeek += 7;
      }
      adjustedMoment = moment(mom).add(daysToDayOfWeek, 'd');
      return {
        week: Math.ceil(adjustedMoment.dayOfYear() / 7),
        year: adjustedMoment.year()
      };
    }
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
      var d = makeUTCDate(year, 0, 1).getUTCDay(),
          daysToAdd,
          dayOfYear;
      d = d === 0 ? 7 : d;
      weekday = weekday != null ? weekday : firstDayOfWeek;
      daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
      dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;
      return {
        year: dayOfYear > 0 ? year : year - 1,
        dayOfYear: dayOfYear > 0 ? dayOfYear : daysInYear(year - 1) + dayOfYear
      };
    }
    function makeMoment(config) {
      var input = config._i,
          format = config._f,
          res;
      config._locale = config._locale || moment.localeData(config._l);
      if (input === null || (format === undefined && input === '')) {
        return moment.invalid({nullInput: true});
      }
      if (typeof input === 'string') {
        config._i = input = config._locale.preparse(input);
      }
      if (moment.isMoment(input)) {
        return new Moment(input, true);
      } else if (format) {
        if (isArray(format)) {
          makeDateFromStringAndArray(config);
        } else {
          makeDateFromStringAndFormat(config);
        }
      } else {
        makeDateFromInput(config);
      }
      res = new Moment(config);
      if (res._nextDay) {
        res.add(1, 'd');
        res._nextDay = undefined;
      }
      return res;
    }
    moment = function(input, format, locale, strict) {
      var c;
      if (typeof(locale) === 'boolean') {
        strict = locale;
        locale = undefined;
      }
      c = {};
      c._isAMomentObject = true;
      c._i = input;
      c._f = format;
      c._l = locale;
      c._strict = strict;
      c._isUTC = false;
      c._pf = defaultParsingFlags();
      return makeMoment(c);
    };
    moment.suppressDeprecationWarnings = false;
    moment.createFromInputFallback = deprecate('moment construction falls back to js Date. This is ' + 'discouraged and will be removed in upcoming major ' + 'release. Please refer to ' + 'https://github.com/moment/moment/issues/1407 for more info.', function(config) {
      config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
    });
    function pickBy(fn, moments) {
      var res,
          i;
      if (moments.length === 1 && isArray(moments[0])) {
        moments = moments[0];
      }
      if (!moments.length) {
        return moment();
      }
      res = moments[0];
      for (i = 1; i < moments.length; ++i) {
        if (moments[i][fn](res)) {
          res = moments[i];
        }
      }
      return res;
    }
    moment.min = function() {
      var args = [].slice.call(arguments, 0);
      return pickBy('isBefore', args);
    };
    moment.max = function() {
      var args = [].slice.call(arguments, 0);
      return pickBy('isAfter', args);
    };
    moment.utc = function(input, format, locale, strict) {
      var c;
      if (typeof(locale) === 'boolean') {
        strict = locale;
        locale = undefined;
      }
      c = {};
      c._isAMomentObject = true;
      c._useUTC = true;
      c._isUTC = true;
      c._l = locale;
      c._i = input;
      c._f = format;
      c._strict = strict;
      c._pf = defaultParsingFlags();
      return makeMoment(c).utc();
    };
    moment.unix = function(input) {
      return moment(input * 1000);
    };
    moment.duration = function(input, key) {
      var duration = input,
          match = null,
          sign,
          ret,
          parseIso,
          diffRes;
      if (moment.isDuration(input)) {
        duration = {
          ms: input._milliseconds,
          d: input._days,
          M: input._months
        };
      } else if (typeof input === 'number') {
        duration = {};
        if (key) {
          duration[key] = input;
        } else {
          duration.milliseconds = input;
        }
      } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : 1;
        duration = {
          y: 0,
          d: toInt(match[DATE]) * sign,
          h: toInt(match[HOUR]) * sign,
          m: toInt(match[MINUTE]) * sign,
          s: toInt(match[SECOND]) * sign,
          ms: toInt(match[MILLISECOND]) * sign
        };
      } else if (!!(match = isoDurationRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : 1;
        parseIso = function(inp) {
          var res = inp && parseFloat(inp.replace(',', '.'));
          return (isNaN(res) ? 0 : res) * sign;
        };
        duration = {
          y: parseIso(match[2]),
          M: parseIso(match[3]),
          d: parseIso(match[4]),
          h: parseIso(match[5]),
          m: parseIso(match[6]),
          s: parseIso(match[7]),
          w: parseIso(match[8])
        };
      } else if (duration == null) {
        duration = {};
      } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
        diffRes = momentsDifference(moment(duration.from), moment(duration.to));
        duration = {};
        duration.ms = diffRes.milliseconds;
        duration.M = diffRes.months;
      }
      ret = new Duration(duration);
      if (moment.isDuration(input) && hasOwnProp(input, '_locale')) {
        ret._locale = input._locale;
      }
      return ret;
    };
    moment.version = VERSION;
    moment.defaultFormat = isoFormat;
    moment.ISO_8601 = function() {};
    moment.momentProperties = momentProperties;
    moment.updateOffset = function() {};
    moment.relativeTimeThreshold = function(threshold, limit) {
      if (relativeTimeThresholds[threshold] === undefined) {
        return false;
      }
      if (limit === undefined) {
        return relativeTimeThresholds[threshold];
      }
      relativeTimeThresholds[threshold] = limit;
      return true;
    };
    moment.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', function(key, value) {
      return moment.locale(key, value);
    });
    moment.locale = function(key, values) {
      var data;
      if (key) {
        if (typeof(values) !== 'undefined') {
          data = moment.defineLocale(key, values);
        } else {
          data = moment.localeData(key);
        }
        if (data) {
          moment.duration._locale = moment._locale = data;
        }
      }
      return moment._locale._abbr;
    };
    moment.defineLocale = function(name, values) {
      if (values !== null) {
        values.abbr = name;
        if (!locales[name]) {
          locales[name] = new Locale();
        }
        locales[name].set(values);
        moment.locale(name);
        return locales[name];
      } else {
        delete locales[name];
        return null;
      }
    };
    moment.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', function(key) {
      return moment.localeData(key);
    });
    moment.localeData = function(key) {
      var locale;
      if (key && key._locale && key._locale._abbr) {
        key = key._locale._abbr;
      }
      if (!key) {
        return moment._locale;
      }
      if (!isArray(key)) {
        locale = loadLocale(key);
        if (locale) {
          return locale;
        }
        key = [key];
      }
      return chooseLocale(key);
    };
    moment.isMoment = function(obj) {
      return obj instanceof Moment || (obj != null && hasOwnProp(obj, '_isAMomentObject'));
    };
    moment.isDuration = function(obj) {
      return obj instanceof Duration;
    };
    for (i = lists.length - 1; i >= 0; --i) {
      makeList(lists[i]);
    }
    moment.normalizeUnits = function(units) {
      return normalizeUnits(units);
    };
    moment.invalid = function(flags) {
      var m = moment.utc(NaN);
      if (flags != null) {
        extend(m._pf, flags);
      } else {
        m._pf.userInvalidated = true;
      }
      return m;
    };
    moment.parseZone = function() {
      return moment.apply(null, arguments).parseZone();
    };
    moment.parseTwoDigitYear = function(input) {
      return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };
    moment.isDate = isDate;
    extend(moment.fn = Moment.prototype, {
      clone: function() {
        return moment(this);
      },
      valueOf: function() {
        return +this._d - ((this._offset || 0) * 60000);
      },
      unix: function() {
        return Math.floor(+this / 1000);
      },
      toString: function() {
        return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
      },
      toDate: function() {
        return this._offset ? new Date(+this) : this._d;
      },
      toISOString: function() {
        var m = moment(this).utc();
        if (0 < m.year() && m.year() <= 9999) {
          if ('function' === typeof Date.prototype.toISOString) {
            return this.toDate().toISOString();
          } else {
            return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
          }
        } else {
          return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        }
      },
      toArray: function() {
        var m = this;
        return [m.year(), m.month(), m.date(), m.hours(), m.minutes(), m.seconds(), m.milliseconds()];
      },
      isValid: function() {
        return isValid(this);
      },
      isDSTShifted: function() {
        if (this._a) {
          return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
        }
        return false;
      },
      parsingFlags: function() {
        return extend({}, this._pf);
      },
      invalidAt: function() {
        return this._pf.overflow;
      },
      utc: function(keepLocalTime) {
        return this.utcOffset(0, keepLocalTime);
      },
      local: function(keepLocalTime) {
        if (this._isUTC) {
          this.utcOffset(0, keepLocalTime);
          this._isUTC = false;
          if (keepLocalTime) {
            this.subtract(this._dateUtcOffset(), 'm');
          }
        }
        return this;
      },
      format: function(inputString) {
        var output = formatMoment(this, inputString || moment.defaultFormat);
        return this.localeData().postformat(output);
      },
      add: createAdder(1, 'add'),
      subtract: createAdder(-1, 'subtract'),
      diff: function(input, units, asFloat) {
        var that = makeAs(input, this),
            zoneDiff = (that.utcOffset() - this.utcOffset()) * 6e4,
            anchor,
            diff,
            output,
            daysAdjust;
        units = normalizeUnits(units);
        if (units === 'year' || units === 'month' || units === 'quarter') {
          output = monthDiff(this, that);
          if (units === 'quarter') {
            output = output / 3;
          } else if (units === 'year') {
            output = output / 12;
          }
        } else {
          diff = this - that;
          output = units === 'second' ? diff / 1e3 : units === 'minute' ? diff / 6e4 : units === 'hour' ? diff / 36e5 : units === 'day' ? (diff - zoneDiff) / 864e5 : units === 'week' ? (diff - zoneDiff) / 6048e5 : diff;
        }
        return asFloat ? output : absRound(output);
      },
      from: function(time, withoutSuffix) {
        return moment.duration({
          to: this,
          from: time
        }).locale(this.locale()).humanize(!withoutSuffix);
      },
      fromNow: function(withoutSuffix) {
        return this.from(moment(), withoutSuffix);
      },
      calendar: function(time) {
        var now = time || moment(),
            sod = makeAs(now, this).startOf('day'),
            diff = this.diff(sod, 'days', true),
            format = diff < -6 ? 'sameElse' : diff < -1 ? 'lastWeek' : diff < 0 ? 'lastDay' : diff < 1 ? 'sameDay' : diff < 2 ? 'nextDay' : diff < 7 ? 'nextWeek' : 'sameElse';
        return this.format(this.localeData().calendar(format, this, moment(now)));
      },
      isLeapYear: function() {
        return isLeapYear(this.year());
      },
      isDST: function() {
        return (this.utcOffset() > this.clone().month(0).utcOffset() || this.utcOffset() > this.clone().month(5).utcOffset());
      },
      day: function(input) {
        var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
        if (input != null) {
          input = parseWeekday(input, this.localeData());
          return this.add(input - day, 'd');
        } else {
          return day;
        }
      },
      month: makeAccessor('Month', true),
      startOf: function(units) {
        units = normalizeUnits(units);
        switch (units) {
          case 'year':
            this.month(0);
          case 'quarter':
          case 'month':
            this.date(1);
          case 'week':
          case 'isoWeek':
          case 'day':
            this.hours(0);
          case 'hour':
            this.minutes(0);
          case 'minute':
            this.seconds(0);
          case 'second':
            this.milliseconds(0);
        }
        if (units === 'week') {
          this.weekday(0);
        } else if (units === 'isoWeek') {
          this.isoWeekday(1);
        }
        if (units === 'quarter') {
          this.month(Math.floor(this.month() / 3) * 3);
        }
        return this;
      },
      endOf: function(units) {
        units = normalizeUnits(units);
        if (units === undefined || units === 'millisecond') {
          return this;
        }
        return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
      },
      isAfter: function(input, units) {
        var inputMs;
        units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
        if (units === 'millisecond') {
          input = moment.isMoment(input) ? input : moment(input);
          return +this > +input;
        } else {
          inputMs = moment.isMoment(input) ? +input : +moment(input);
          return inputMs < +this.clone().startOf(units);
        }
      },
      isBefore: function(input, units) {
        var inputMs;
        units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
        if (units === 'millisecond') {
          input = moment.isMoment(input) ? input : moment(input);
          return +this < +input;
        } else {
          inputMs = moment.isMoment(input) ? +input : +moment(input);
          return +this.clone().endOf(units) < inputMs;
        }
      },
      isBetween: function(from, to, units) {
        return this.isAfter(from, units) && this.isBefore(to, units);
      },
      isSame: function(input, units) {
        var inputMs;
        units = normalizeUnits(units || 'millisecond');
        if (units === 'millisecond') {
          input = moment.isMoment(input) ? input : moment(input);
          return +this === +input;
        } else {
          inputMs = +moment(input);
          return +(this.clone().startOf(units)) <= inputMs && inputMs <= +(this.clone().endOf(units));
        }
      },
      min: deprecate('moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548', function(other) {
        other = moment.apply(null, arguments);
        return other < this ? this : other;
      }),
      max: deprecate('moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548', function(other) {
        other = moment.apply(null, arguments);
        return other > this ? this : other;
      }),
      zone: deprecate('moment().zone is deprecated, use moment().utcOffset instead. ' + 'https://github.com/moment/moment/issues/1779', function(input, keepLocalTime) {
        if (input != null) {
          if (typeof input !== 'string') {
            input = -input;
          }
          this.utcOffset(input, keepLocalTime);
          return this;
        } else {
          return -this.utcOffset();
        }
      }),
      utcOffset: function(input, keepLocalTime) {
        var offset = this._offset || 0,
            localAdjust;
        if (input != null) {
          if (typeof input === 'string') {
            input = utcOffsetFromString(input);
          }
          if (Math.abs(input) < 16) {
            input = input * 60;
          }
          if (!this._isUTC && keepLocalTime) {
            localAdjust = this._dateUtcOffset();
          }
          this._offset = input;
          this._isUTC = true;
          if (localAdjust != null) {
            this.add(localAdjust, 'm');
          }
          if (offset !== input) {
            if (!keepLocalTime || this._changeInProgress) {
              addOrSubtractDurationFromMoment(this, moment.duration(input - offset, 'm'), 1, false);
            } else if (!this._changeInProgress) {
              this._changeInProgress = true;
              moment.updateOffset(this, true);
              this._changeInProgress = null;
            }
          }
          return this;
        } else {
          return this._isUTC ? offset : this._dateUtcOffset();
        }
      },
      isLocal: function() {
        return !this._isUTC;
      },
      isUtcOffset: function() {
        return this._isUTC;
      },
      isUtc: function() {
        return this._isUTC && this._offset === 0;
      },
      zoneAbbr: function() {
        return this._isUTC ? 'UTC' : '';
      },
      zoneName: function() {
        return this._isUTC ? 'Coordinated Universal Time' : '';
      },
      parseZone: function() {
        if (this._tzm) {
          this.utcOffset(this._tzm);
        } else if (typeof this._i === 'string') {
          this.utcOffset(utcOffsetFromString(this._i));
        }
        return this;
      },
      hasAlignedHourOffset: function(input) {
        if (!input) {
          input = 0;
        } else {
          input = moment(input).utcOffset();
        }
        return (this.utcOffset() - input) % 60 === 0;
      },
      daysInMonth: function() {
        return daysInMonth(this.year(), this.month());
      },
      dayOfYear: function(input) {
        var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
        return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
      },
      quarter: function(input) {
        return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
      },
      weekYear: function(input) {
        var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
        return input == null ? year : this.add((input - year), 'y');
      },
      isoWeekYear: function(input) {
        var year = weekOfYear(this, 1, 4).year;
        return input == null ? year : this.add((input - year), 'y');
      },
      week: function(input) {
        var week = this.localeData().week(this);
        return input == null ? week : this.add((input - week) * 7, 'd');
      },
      isoWeek: function(input) {
        var week = weekOfYear(this, 1, 4).week;
        return input == null ? week : this.add((input - week) * 7, 'd');
      },
      weekday: function(input) {
        var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
        return input == null ? weekday : this.add(input - weekday, 'd');
      },
      isoWeekday: function(input) {
        return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
      },
      isoWeeksInYear: function() {
        return weeksInYear(this.year(), 1, 4);
      },
      weeksInYear: function() {
        var weekInfo = this.localeData()._week;
        return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
      },
      get: function(units) {
        units = normalizeUnits(units);
        return this[units]();
      },
      set: function(units, value) {
        var unit;
        if (typeof units === 'object') {
          for (unit in units) {
            this.set(unit, units[unit]);
          }
        } else {
          units = normalizeUnits(units);
          if (typeof this[units] === 'function') {
            this[units](value);
          }
        }
        return this;
      },
      locale: function(key) {
        var newLocaleData;
        if (key === undefined) {
          return this._locale._abbr;
        } else {
          newLocaleData = moment.localeData(key);
          if (newLocaleData != null) {
            this._locale = newLocaleData;
          }
          return this;
        }
      },
      lang: deprecate('moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.', function(key) {
        if (key === undefined) {
          return this.localeData();
        } else {
          return this.locale(key);
        }
      }),
      localeData: function() {
        return this._locale;
      },
      _dateUtcOffset: function() {
        return -Math.round(this._d.getTimezoneOffset() / 15) * 15;
      }
    });
    function rawMonthSetter(mom, value) {
      var dayOfMonth;
      if (typeof value === 'string') {
        value = mom.localeData().monthsParse(value);
        if (typeof value !== 'number') {
          return mom;
        }
      }
      dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
      mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
      return mom;
    }
    function rawGetter(mom, unit) {
      return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }
    function rawSetter(mom, unit, value) {
      if (unit === 'Month') {
        return rawMonthSetter(mom, value);
      } else {
        return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
      }
    }
    function makeAccessor(unit, keepTime) {
      return function(value) {
        if (value != null) {
          rawSetter(this, unit, value);
          moment.updateOffset(this, keepTime);
          return this;
        } else {
          return rawGetter(this, unit);
        }
      };
    }
    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate('dates accessor is deprecated. Use date instead.', makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate('years accessor is deprecated. Use year instead.', makeAccessor('FullYear', true));
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;
    moment.fn.toJSON = moment.fn.toISOString;
    moment.fn.isUTC = moment.fn.isUtc;
    function daysToYears(days) {
      return days * 400 / 146097;
    }
    function yearsToDays(years) {
      return years * 146097 / 400;
    }
    extend(moment.duration.fn = Duration.prototype, {
      _bubble: function() {
        var milliseconds = this._milliseconds,
            days = this._days,
            months = this._months,
            data = this._data,
            seconds,
            minutes,
            hours,
            years = 0;
        data.milliseconds = milliseconds % 1000;
        seconds = absRound(milliseconds / 1000);
        data.seconds = seconds % 60;
        minutes = absRound(seconds / 60);
        data.minutes = minutes % 60;
        hours = absRound(minutes / 60);
        data.hours = hours % 24;
        days += absRound(hours / 24);
        years = absRound(daysToYears(days));
        days -= absRound(yearsToDays(years));
        months += absRound(days / 30);
        days %= 30;
        years += absRound(months / 12);
        months %= 12;
        data.days = days;
        data.months = months;
        data.years = years;
      },
      abs: function() {
        this._milliseconds = Math.abs(this._milliseconds);
        this._days = Math.abs(this._days);
        this._months = Math.abs(this._months);
        this._data.milliseconds = Math.abs(this._data.milliseconds);
        this._data.seconds = Math.abs(this._data.seconds);
        this._data.minutes = Math.abs(this._data.minutes);
        this._data.hours = Math.abs(this._data.hours);
        this._data.months = Math.abs(this._data.months);
        this._data.years = Math.abs(this._data.years);
        return this;
      },
      weeks: function() {
        return absRound(this.days() / 7);
      },
      valueOf: function() {
        return this._milliseconds + this._days * 864e5 + (this._months % 12) * 2592e6 + toInt(this._months / 12) * 31536e6;
      },
      humanize: function(withSuffix) {
        var output = relativeTime(this, !withSuffix, this.localeData());
        if (withSuffix) {
          output = this.localeData().pastFuture(+this, output);
        }
        return this.localeData().postformat(output);
      },
      add: function(input, val) {
        var dur = moment.duration(input, val);
        this._milliseconds += dur._milliseconds;
        this._days += dur._days;
        this._months += dur._months;
        this._bubble();
        return this;
      },
      subtract: function(input, val) {
        var dur = moment.duration(input, val);
        this._milliseconds -= dur._milliseconds;
        this._days -= dur._days;
        this._months -= dur._months;
        this._bubble();
        return this;
      },
      get: function(units) {
        units = normalizeUnits(units);
        return this[units.toLowerCase() + 's']();
      },
      as: function(units) {
        var days,
            months;
        units = normalizeUnits(units);
        if (units === 'month' || units === 'year') {
          days = this._days + this._milliseconds / 864e5;
          months = this._months + daysToYears(days) * 12;
          return units === 'month' ? months : months / 12;
        } else {
          days = this._days + Math.round(yearsToDays(this._months / 12));
          switch (units) {
            case 'week':
              return days / 7 + this._milliseconds / 6048e5;
            case 'day':
              return days + this._milliseconds / 864e5;
            case 'hour':
              return days * 24 + this._milliseconds / 36e5;
            case 'minute':
              return days * 24 * 60 + this._milliseconds / 6e4;
            case 'second':
              return days * 24 * 60 * 60 + this._milliseconds / 1000;
            case 'millisecond':
              return Math.floor(days * 24 * 60 * 60 * 1000) + this._milliseconds;
            default:
              throw new Error('Unknown unit ' + units);
          }
        }
      },
      lang: moment.fn.lang,
      locale: moment.fn.locale,
      toIsoString: deprecate('toIsoString() is deprecated. Please use toISOString() instead ' + '(notice the capitals)', function() {
        return this.toISOString();
      }),
      toISOString: function() {
        var years = Math.abs(this.years()),
            months = Math.abs(this.months()),
            days = Math.abs(this.days()),
            hours = Math.abs(this.hours()),
            minutes = Math.abs(this.minutes()),
            seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);
        if (!this.asSeconds()) {
          return 'P0D';
        }
        return (this.asSeconds() < 0 ? '-' : '') + 'P' + (years ? years + 'Y' : '') + (months ? months + 'M' : '') + (days ? days + 'D' : '') + ((hours || minutes || seconds) ? 'T' : '') + (hours ? hours + 'H' : '') + (minutes ? minutes + 'M' : '') + (seconds ? seconds + 'S' : '');
      },
      localeData: function() {
        return this._locale;
      },
      toJSON: function() {
        return this.toISOString();
      }
    });
    moment.duration.fn.toString = moment.duration.fn.toISOString;
    function makeDurationGetter(name) {
      moment.duration.fn[name] = function() {
        return this._data[name];
      };
    }
    for (i in unitMillisecondFactors) {
      if (hasOwnProp(unitMillisecondFactors, i)) {
        makeDurationGetter(i.toLowerCase());
      }
    }
    moment.duration.fn.asMilliseconds = function() {
      return this.as('ms');
    };
    moment.duration.fn.asSeconds = function() {
      return this.as('s');
    };
    moment.duration.fn.asMinutes = function() {
      return this.as('m');
    };
    moment.duration.fn.asHours = function() {
      return this.as('h');
    };
    moment.duration.fn.asDays = function() {
      return this.as('d');
    };
    moment.duration.fn.asWeeks = function() {
      return this.as('weeks');
    };
    moment.duration.fn.asMonths = function() {
      return this.as('M');
    };
    moment.duration.fn.asYears = function() {
      return this.as('y');
    };
    moment.locale('en', {
      ordinalParse: /\d{1,2}(th|st|nd|rd)/,
      ordinal: function(number) {
        var b = number % 10,
            output = (toInt(number % 100 / 10) === 1) ? 'th' : (b === 1) ? 'st' : (b === 2) ? 'nd' : (b === 3) ? 'rd' : 'th';
        return number + output;
      }
    });
    function makeGlobal(shouldDeprecate) {
      if (typeof ender !== 'undefined') {
        return;
      }
      oldGlobalMoment = globalScope.moment;
      if (shouldDeprecate) {
        globalScope.moment = deprecate('Accessing Moment through the global scope is ' + 'deprecated, and will be removed in an upcoming ' + 'release.', moment);
      } else {
        globalScope.moment = moment;
      }
    }
    if (hasModule) {
      module.exports = moment;
    } else if (typeof define === 'function' && define.amd) {
      define(function(require, exports, module) {
        if (module.config && module.config() && module.config().noGlobal === true) {
          globalScope.moment = oldGlobalMoment;
        }
        return moment;
      });
      makeGlobal(true);
    } else {
      makeGlobal();
    }
  }).call(this);
  global.define = __define;
  return module.exports;
});



System.register("lib/photoService", ["github:components/jquery@2.1.3", "npm:format@0.2.1", "lib/constants"], function($__export) {
  "use strict";
  var __moduleName = "lib/photoService";
  var $,
      format,
      Constants,
      PhotoService;
  return {
    setters: [function(m) {
      $ = m.default;
    }, function(m) {
      format = m.default;
    }, function(m) {
      Constants = m;
    }],
    execute: function() {
      PhotoService = (function() {
        var PhotoService = function PhotoService(flickrKey) {
          this.flickrKey = flickrKey;
        };
        return ($traceurRuntime.createClass)(PhotoService, {
          getPhotos: function(location) {
            var $__0 = this;
            return new Promise((function(resolve, reject) {
              var url = format(Constants.FLICKR_URL, $__0.flickrKey, location.lat, location.log, Constants.FLICKR_WEATHER_GROUP_ID);
              $.get(url, null, (function(data, status) {
                if (!data)
                  reject(null);
                var result = data.photos;
                if (!result)
                  resolve(null);
                var photos = result.photo;
                if (!photos || photos.length < 1)
                  resolve(null);
                resolve(photos);
              }));
            }));
          },
          getPhotoUrl: function(photo) {
            var url = format(Constants.FLICKR_PHOTO_URL, photo.farm, photo.server, photo.id, photo.secret);
            return url;
          }
        }, {});
      }());
      $__export('default', PhotoService);
    }
  };
});



(function() {
function define(){};  define.amd = {};
System.register("github:components/jquery@2.1.3", ["github:components/jquery@2.1.3/jquery"], false, function(__require, __exports, __module) {
  return (function(main) {
    return main;
  }).call(this, __require('github:components/jquery@2.1.3/jquery'));
});


})();
System.register("npm:process@0.10.0", ["npm:process@0.10.0/browser"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:process@0.10.0/browser");
  global.define = __define;
  return module.exports;
});



System.register("npm:ms@0.6.2", ["npm:ms@0.6.2/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:ms@0.6.2/index");
  global.define = __define;
  return module.exports;
});



System.register("npm:format@0.2.1", ["npm:format@0.2.1/format"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:format@0.2.1/format");
  global.define = __define;
  return module.exports;
});



System.register("npm:moment@2.9.0", ["npm:moment@2.9.0/moment"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:moment@2.9.0/moment");
  global.define = __define;
  return module.exports;
});



System.register("github:jspm/nodelibs-process@0.1.0/index", ["npm:process@0.10.0", "npm:process@0.10.0"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    module.exports = System._nodeRequire ? process : require("npm:process@0.10.0");
  })(require("npm:process@0.10.0"));
  global.define = __define;
  return module.exports;
});



System.register("npm:debug@2.1.1/debug", ["npm:ms@0.6.2"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  exports = module.exports = debug;
  exports.coerce = coerce;
  exports.disable = disable;
  exports.enable = enable;
  exports.enabled = enabled;
  exports.humanize = require("npm:ms@0.6.2");
  exports.names = [];
  exports.skips = [];
  exports.formatters = {};
  var prevColor = 0;
  var prevTime;
  function selectColor() {
    return exports.colors[prevColor++ % exports.colors.length];
  }
  function debug(namespace) {
    function disabled() {}
    disabled.enabled = false;
    function enabled() {
      var self = enabled;
      var curr = +new Date();
      var ms = curr - (prevTime || curr);
      self.diff = ms;
      self.prev = prevTime;
      self.curr = curr;
      prevTime = curr;
      if (null == self.useColors)
        self.useColors = exports.useColors();
      if (null == self.color && self.useColors)
        self.color = selectColor();
      var args = Array.prototype.slice.call(arguments);
      args[0] = exports.coerce(args[0]);
      if ('string' !== typeof args[0]) {
        args = ['%o'].concat(args);
      }
      var index = 0;
      args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
        if (match === '%%')
          return match;
        index++;
        var formatter = exports.formatters[format];
        if ('function' === typeof formatter) {
          var val = args[index];
          match = formatter.call(self, val);
          args.splice(index, 1);
          index--;
        }
        return match;
      });
      if ('function' === typeof exports.formatArgs) {
        args = exports.formatArgs.apply(self, args);
      }
      var logFn = enabled.log || exports.log || console.log.bind(console);
      logFn.apply(self, args);
    }
    enabled.enabled = true;
    var fn = exports.enabled(namespace) ? enabled : disabled;
    fn.namespace = namespace;
    return fn;
  }
  function enable(namespaces) {
    exports.save(namespaces);
    var split = (namespaces || '').split(/[\s,]+/);
    var len = split.length;
    for (var i = 0; i < len; i++) {
      if (!split[i])
        continue;
      namespaces = split[i].replace(/\*/g, '.*?');
      if (namespaces[0] === '-') {
        exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
      } else {
        exports.names.push(new RegExp('^' + namespaces + '$'));
      }
    }
  }
  function disable() {
    exports.enable('');
  }
  function enabled(name) {
    var i,
        len;
    for (i = 0, len = exports.skips.length; i < len; i++) {
      if (exports.skips[i].test(name)) {
        return false;
      }
    }
    for (i = 0, len = exports.names.length; i < len; i++) {
      if (exports.names[i].test(name)) {
        return true;
      }
    }
    return false;
  }
  function coerce(val) {
    if (val instanceof Error)
      return val.stack || val.message;
    return val;
  }
  global.define = __define;
  return module.exports;
});



System.register("lib/storageService", ["npm:moment@2.9.0"], function($__export) {
  "use strict";
  var __moduleName = "lib/storageService";
  var moment,
      StorageService;
  return {
    setters: [function(m) {
      moment = m.default;
    }],
    execute: function() {
      StorageService = (function() {
        var StorageService = function StorageService(expirationInHours) {
          this.expirationInHours = expirationInHours;
        };
        return ($traceurRuntime.createClass)(StorageService, {
          get: function(key) {
            if (!key)
              return null;
            var savedString = localStorage.getItem(key);
            if (!savedString)
              return null;
            var savedObj = JSON.parse(savedString);
            var expiredDate = moment().subtract(this.expirationInHours, 'hours');
            var storageDate = moment(savedObj.asOf);
            if (storageDate.isBefore(expiredDate))
              return null;
            return savedObj.data;
          },
          set: function(key, obj) {
            if (!key)
              return;
            var data = {
              asOf: moment(),
              data: obj
            };
            localStorage.setItem(key, JSON.stringify(data));
          },
          remove: function(key) {
            if (!key)
              return;
            localStorage.removeItem(key);
          }
        }, {});
      }());
      $__export('default', StorageService);
    }
  };
});



System.register("github:jspm/nodelibs-process@0.1.0", ["github:jspm/nodelibs-process@0.1.0/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:jspm/nodelibs-process@0.1.0/index");
  global.define = __define;
  return module.exports;
});



System.register("npm:debug@2.1.1/browser", ["npm:debug@2.1.1/debug"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  exports = module.exports = require("npm:debug@2.1.1/debug");
  exports.log = log;
  exports.formatArgs = formatArgs;
  exports.save = save;
  exports.load = load;
  exports.useColors = useColors;
  var storage;
  if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
    storage = chrome.storage.local;
  else
    storage = window.localStorage;
  exports.colors = ['lightseagreen', 'forestgreen', 'goldenrod', 'dodgerblue', 'darkorchid', 'crimson'];
  function useColors() {
    return ('WebkitAppearance' in document.documentElement.style) || (window.console && (console.firebug || (console.exception && console.table))) || (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
  }
  exports.formatters.j = function(v) {
    return JSON.stringify(v);
  };
  function formatArgs() {
    var args = arguments;
    var useColors = this.useColors;
    args[0] = (useColors ? '%c' : '') + this.namespace + (useColors ? ' %c' : ' ') + args[0] + (useColors ? '%c ' : ' ') + '+' + exports.humanize(this.diff);
    if (!useColors)
      return args;
    var c = 'color: ' + this.color;
    args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));
    var index = 0;
    var lastC = 0;
    args[0].replace(/%[a-z%]/g, function(match) {
      if ('%%' === match)
        return;
      index++;
      if ('%c' === match) {
        lastC = index;
      }
    });
    args.splice(lastC, 0, c);
    return args;
  }
  function log() {
    return 'object' === typeof console && console.log && Function.prototype.apply.call(console.log, console, arguments);
  }
  function save(namespaces) {
    try {
      if (null == namespaces) {
        storage.removeItem('debug');
      } else {
        storage.debug = namespaces;
      }
    } catch (e) {}
  }
  function load() {
    var r;
    try {
      r = storage.debug;
    } catch (e) {}
    return r;
  }
  exports.enable(load());
  global.define = __define;
  return module.exports;
});



System.register("npm:knockout@3.2.0/build/output/knockout-latest.debug", ["github:jspm/nodelibs-process@0.1.0"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function(process) {
    (function() {
      var DEBUG = true;
      (function(undefined) {
        var window = this || (0, eval)('this'),
            document = window['document'],
            navigator = window['navigator'],
            jQueryInstance = window["jQuery"],
            JSON = window["JSON"];
        (function(factory) {
          if (typeof require === 'function' && typeof exports === 'object' && typeof module === 'object') {
            var target = module['exports'] || exports;
            factory(target, require);
          } else if (typeof define === 'function' && define['amd']) {
            define(["exports", "require"], factory);
          } else {
            factory(window['ko'] = {});
          }
        }(function(koExports, require) {
          var ko = typeof koExports !== 'undefined' ? koExports : {};
          ko.exportSymbol = function(koPath, object) {
            var tokens = koPath.split(".");
            var target = ko;
            for (var i = 0; i < tokens.length - 1; i++)
              target = target[tokens[i]];
            target[tokens[tokens.length - 1]] = object;
          };
          ko.exportProperty = function(owner, publicName, object) {
            owner[publicName] = object;
          };
          ko.version = "3.2.0";
          ko.exportSymbol('version', ko.version);
          ko.utils = (function() {
            function objectForEach(obj, action) {
              for (var prop in obj) {
                if (obj.hasOwnProperty(prop)) {
                  action(prop, obj[prop]);
                }
              }
            }
            function extend(target, source) {
              if (source) {
                for (var prop in source) {
                  if (source.hasOwnProperty(prop)) {
                    target[prop] = source[prop];
                  }
                }
              }
              return target;
            }
            function setPrototypeOf(obj, proto) {
              obj.__proto__ = proto;
              return obj;
            }
            var canSetPrototype = ({__proto__: []} instanceof Array);
            var knownEvents = {},
                knownEventTypesByEventName = {};
            var keyEventTypeName = (navigator && /Firefox\/2/i.test(navigator.userAgent)) ? 'KeyboardEvent' : 'UIEvents';
            knownEvents[keyEventTypeName] = ['keyup', 'keydown', 'keypress'];
            knownEvents['MouseEvents'] = ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
            objectForEach(knownEvents, function(eventType, knownEventsForType) {
              if (knownEventsForType.length) {
                for (var i = 0,
                    j = knownEventsForType.length; i < j; i++)
                  knownEventTypesByEventName[knownEventsForType[i]] = eventType;
              }
            });
            var eventsThatMustBeRegisteredUsingAttachEvent = {'propertychange': true};
            var ieVersion = document && (function() {
              var version = 3,
                  div = document.createElement('div'),
                  iElems = div.getElementsByTagName('i');
              while (div.innerHTML = '<!--[if gt IE ' + (++version) + ']><i></i><![endif]-->', iElems[0]) {}
              return version > 4 ? version : undefined;
            }());
            var isIe6 = ieVersion === 6,
                isIe7 = ieVersion === 7;
            function isClickOnCheckableElement(element, eventType) {
              if ((ko.utils.tagNameLower(element) !== "input") || !element.type)
                return false;
              if (eventType.toLowerCase() != "click")
                return false;
              var inputType = element.type;
              return (inputType == "checkbox") || (inputType == "radio");
            }
            return {
              fieldsIncludedWithJsonPost: ['authenticity_token', /^__RequestVerificationToken(_.*)?$/],
              arrayForEach: function(array, action) {
                for (var i = 0,
                    j = array.length; i < j; i++)
                  action(array[i], i);
              },
              arrayIndexOf: function(array, item) {
                if (typeof Array.prototype.indexOf == "function")
                  return Array.prototype.indexOf.call(array, item);
                for (var i = 0,
                    j = array.length; i < j; i++)
                  if (array[i] === item)
                    return i;
                return -1;
              },
              arrayFirst: function(array, predicate, predicateOwner) {
                for (var i = 0,
                    j = array.length; i < j; i++)
                  if (predicate.call(predicateOwner, array[i], i))
                    return array[i];
                return null;
              },
              arrayRemoveItem: function(array, itemToRemove) {
                var index = ko.utils.arrayIndexOf(array, itemToRemove);
                if (index > 0) {
                  array.splice(index, 1);
                } else if (index === 0) {
                  array.shift();
                }
              },
              arrayGetDistinctValues: function(array) {
                array = array || [];
                var result = [];
                for (var i = 0,
                    j = array.length; i < j; i++) {
                  if (ko.utils.arrayIndexOf(result, array[i]) < 0)
                    result.push(array[i]);
                }
                return result;
              },
              arrayMap: function(array, mapping) {
                array = array || [];
                var result = [];
                for (var i = 0,
                    j = array.length; i < j; i++)
                  result.push(mapping(array[i], i));
                return result;
              },
              arrayFilter: function(array, predicate) {
                array = array || [];
                var result = [];
                for (var i = 0,
                    j = array.length; i < j; i++)
                  if (predicate(array[i], i))
                    result.push(array[i]);
                return result;
              },
              arrayPushAll: function(array, valuesToPush) {
                if (valuesToPush instanceof Array)
                  array.push.apply(array, valuesToPush);
                else
                  for (var i = 0,
                      j = valuesToPush.length; i < j; i++)
                    array.push(valuesToPush[i]);
                return array;
              },
              addOrRemoveItem: function(array, value, included) {
                var existingEntryIndex = ko.utils.arrayIndexOf(ko.utils.peekObservable(array), value);
                if (existingEntryIndex < 0) {
                  if (included)
                    array.push(value);
                } else {
                  if (!included)
                    array.splice(existingEntryIndex, 1);
                }
              },
              canSetPrototype: canSetPrototype,
              extend: extend,
              setPrototypeOf: setPrototypeOf,
              setPrototypeOfOrExtend: canSetPrototype ? setPrototypeOf : extend,
              objectForEach: objectForEach,
              objectMap: function(source, mapping) {
                if (!source)
                  return source;
                var target = {};
                for (var prop in source) {
                  if (source.hasOwnProperty(prop)) {
                    target[prop] = mapping(source[prop], prop, source);
                  }
                }
                return target;
              },
              emptyDomNode: function(domNode) {
                while (domNode.firstChild) {
                  ko.removeNode(domNode.firstChild);
                }
              },
              moveCleanedNodesToContainerElement: function(nodes) {
                var nodesArray = ko.utils.makeArray(nodes);
                var container = document.createElement('div');
                for (var i = 0,
                    j = nodesArray.length; i < j; i++) {
                  container.appendChild(ko.cleanNode(nodesArray[i]));
                }
                return container;
              },
              cloneNodes: function(nodesArray, shouldCleanNodes) {
                for (var i = 0,
                    j = nodesArray.length,
                    newNodesArray = []; i < j; i++) {
                  var clonedNode = nodesArray[i].cloneNode(true);
                  newNodesArray.push(shouldCleanNodes ? ko.cleanNode(clonedNode) : clonedNode);
                }
                return newNodesArray;
              },
              setDomNodeChildren: function(domNode, childNodes) {
                ko.utils.emptyDomNode(domNode);
                if (childNodes) {
                  for (var i = 0,
                      j = childNodes.length; i < j; i++)
                    domNode.appendChild(childNodes[i]);
                }
              },
              replaceDomNodes: function(nodeToReplaceOrNodeArray, newNodesArray) {
                var nodesToReplaceArray = nodeToReplaceOrNodeArray.nodeType ? [nodeToReplaceOrNodeArray] : nodeToReplaceOrNodeArray;
                if (nodesToReplaceArray.length > 0) {
                  var insertionPoint = nodesToReplaceArray[0];
                  var parent = insertionPoint.parentNode;
                  for (var i = 0,
                      j = newNodesArray.length; i < j; i++)
                    parent.insertBefore(newNodesArray[i], insertionPoint);
                  for (var i = 0,
                      j = nodesToReplaceArray.length; i < j; i++) {
                    ko.removeNode(nodesToReplaceArray[i]);
                  }
                }
              },
              fixUpContinuousNodeArray: function(continuousNodeArray, parentNode) {
                if (continuousNodeArray.length) {
                  parentNode = (parentNode.nodeType === 8 && parentNode.parentNode) || parentNode;
                  while (continuousNodeArray.length && continuousNodeArray[0].parentNode !== parentNode)
                    continuousNodeArray.shift();
                  if (continuousNodeArray.length > 1) {
                    var current = continuousNodeArray[0],
                        last = continuousNodeArray[continuousNodeArray.length - 1];
                    continuousNodeArray.length = 0;
                    while (current !== last) {
                      continuousNodeArray.push(current);
                      current = current.nextSibling;
                      if (!current)
                        return;
                    }
                    continuousNodeArray.push(last);
                  }
                }
                return continuousNodeArray;
              },
              setOptionNodeSelectionState: function(optionNode, isSelected) {
                if (ieVersion < 7)
                  optionNode.setAttribute("selected", isSelected);
                else
                  optionNode.selected = isSelected;
              },
              stringTrim: function(string) {
                return string === null || string === undefined ? '' : string.trim ? string.trim() : string.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
              },
              stringStartsWith: function(string, startsWith) {
                string = string || "";
                if (startsWith.length > string.length)
                  return false;
                return string.substring(0, startsWith.length) === startsWith;
              },
              domNodeIsContainedBy: function(node, containedByNode) {
                if (node === containedByNode)
                  return true;
                if (node.nodeType === 11)
                  return false;
                if (containedByNode.contains)
                  return containedByNode.contains(node.nodeType === 3 ? node.parentNode : node);
                if (containedByNode.compareDocumentPosition)
                  return (containedByNode.compareDocumentPosition(node) & 16) == 16;
                while (node && node != containedByNode) {
                  node = node.parentNode;
                }
                return !!node;
              },
              domNodeIsAttachedToDocument: function(node) {
                return ko.utils.domNodeIsContainedBy(node, node.ownerDocument.documentElement);
              },
              anyDomNodeIsAttachedToDocument: function(nodes) {
                return !!ko.utils.arrayFirst(nodes, ko.utils.domNodeIsAttachedToDocument);
              },
              tagNameLower: function(element) {
                return element && element.tagName && element.tagName.toLowerCase();
              },
              registerEventHandler: function(element, eventType, handler) {
                var mustUseAttachEvent = ieVersion && eventsThatMustBeRegisteredUsingAttachEvent[eventType];
                if (!mustUseAttachEvent && jQueryInstance) {
                  jQueryInstance(element)['bind'](eventType, handler);
                } else if (!mustUseAttachEvent && typeof element.addEventListener == "function")
                  element.addEventListener(eventType, handler, false);
                else if (typeof element.attachEvent != "undefined") {
                  var attachEventHandler = function(event) {
                    handler.call(element, event);
                  },
                      attachEventName = "on" + eventType;
                  element.attachEvent(attachEventName, attachEventHandler);
                  ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
                    element.detachEvent(attachEventName, attachEventHandler);
                  });
                } else
                  throw new Error("Browser doesn't support addEventListener or attachEvent");
              },
              triggerEvent: function(element, eventType) {
                if (!(element && element.nodeType))
                  throw new Error("element must be a DOM node when calling triggerEvent");
                var useClickWorkaround = isClickOnCheckableElement(element, eventType);
                if (jQueryInstance && !useClickWorkaround) {
                  jQueryInstance(element)['trigger'](eventType);
                } else if (typeof document.createEvent == "function") {
                  if (typeof element.dispatchEvent == "function") {
                    var eventCategory = knownEventTypesByEventName[eventType] || "HTMLEvents";
                    var event = document.createEvent(eventCategory);
                    event.initEvent(eventType, true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, element);
                    element.dispatchEvent(event);
                  } else
                    throw new Error("The supplied element doesn't support dispatchEvent");
                } else if (useClickWorkaround && element.click) {
                  element.click();
                } else if (typeof element.fireEvent != "undefined") {
                  element.fireEvent("on" + eventType);
                } else {
                  throw new Error("Browser doesn't support triggering events");
                }
              },
              unwrapObservable: function(value) {
                return ko.isObservable(value) ? value() : value;
              },
              peekObservable: function(value) {
                return ko.isObservable(value) ? value.peek() : value;
              },
              toggleDomNodeCssClass: function(node, classNames, shouldHaveClass) {
                if (classNames) {
                  var cssClassNameRegex = /\S+/g,
                      currentClassNames = node.className.match(cssClassNameRegex) || [];
                  ko.utils.arrayForEach(classNames.match(cssClassNameRegex), function(className) {
                    ko.utils.addOrRemoveItem(currentClassNames, className, shouldHaveClass);
                  });
                  node.className = currentClassNames.join(" ");
                }
              },
              setTextContent: function(element, textContent) {
                var value = ko.utils.unwrapObservable(textContent);
                if ((value === null) || (value === undefined))
                  value = "";
                var innerTextNode = ko.virtualElements.firstChild(element);
                if (!innerTextNode || innerTextNode.nodeType != 3 || ko.virtualElements.nextSibling(innerTextNode)) {
                  ko.virtualElements.setDomNodeChildren(element, [element.ownerDocument.createTextNode(value)]);
                } else {
                  innerTextNode.data = value;
                }
                ko.utils.forceRefresh(element);
              },
              setElementName: function(element, name) {
                element.name = name;
                if (ieVersion <= 7) {
                  try {
                    element.mergeAttributes(document.createElement("<input name='" + element.name + "'/>"), false);
                  } catch (e) {}
                }
              },
              forceRefresh: function(node) {
                if (ieVersion >= 9) {
                  var elem = node.nodeType == 1 ? node : node.parentNode;
                  if (elem.style)
                    elem.style.zoom = elem.style.zoom;
                }
              },
              ensureSelectElementIsRenderedCorrectly: function(selectElement) {
                if (ieVersion) {
                  var originalWidth = selectElement.style.width;
                  selectElement.style.width = 0;
                  selectElement.style.width = originalWidth;
                }
              },
              range: function(min, max) {
                min = ko.utils.unwrapObservable(min);
                max = ko.utils.unwrapObservable(max);
                var result = [];
                for (var i = min; i <= max; i++)
                  result.push(i);
                return result;
              },
              makeArray: function(arrayLikeObject) {
                var result = [];
                for (var i = 0,
                    j = arrayLikeObject.length; i < j; i++) {
                  result.push(arrayLikeObject[i]);
                }
                ;
                return result;
              },
              isIe6: isIe6,
              isIe7: isIe7,
              ieVersion: ieVersion,
              getFormFields: function(form, fieldName) {
                var fields = ko.utils.makeArray(form.getElementsByTagName("input")).concat(ko.utils.makeArray(form.getElementsByTagName("textarea")));
                var isMatchingField = (typeof fieldName == 'string') ? function(field) {
                  return field.name === fieldName;
                } : function(field) {
                  return fieldName.test(field.name);
                };
                var matches = [];
                for (var i = fields.length - 1; i >= 0; i--) {
                  if (isMatchingField(fields[i]))
                    matches.push(fields[i]);
                }
                ;
                return matches;
              },
              parseJson: function(jsonString) {
                if (typeof jsonString == "string") {
                  jsonString = ko.utils.stringTrim(jsonString);
                  if (jsonString) {
                    if (JSON && JSON.parse)
                      return JSON.parse(jsonString);
                    return (new Function("return " + jsonString))();
                  }
                }
                return null;
              },
              stringifyJson: function(data, replacer, space) {
                if (!JSON || !JSON.stringify)
                  throw new Error("Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don't support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js");
                return JSON.stringify(ko.utils.unwrapObservable(data), replacer, space);
              },
              postJson: function(urlOrForm, data, options) {
                options = options || {};
                var params = options['params'] || {};
                var includeFields = options['includeFields'] || this.fieldsIncludedWithJsonPost;
                var url = urlOrForm;
                if ((typeof urlOrForm == 'object') && (ko.utils.tagNameLower(urlOrForm) === "form")) {
                  var originalForm = urlOrForm;
                  url = originalForm.action;
                  for (var i = includeFields.length - 1; i >= 0; i--) {
                    var fields = ko.utils.getFormFields(originalForm, includeFields[i]);
                    for (var j = fields.length - 1; j >= 0; j--)
                      params[fields[j].name] = fields[j].value;
                  }
                }
                data = ko.utils.unwrapObservable(data);
                var form = document.createElement("form");
                form.style.display = "none";
                form.action = url;
                form.method = "post";
                for (var key in data) {
                  var input = document.createElement("input");
                  input.type = "hidden";
                  input.name = key;
                  input.value = ko.utils.stringifyJson(ko.utils.unwrapObservable(data[key]));
                  form.appendChild(input);
                }
                objectForEach(params, function(key, value) {
                  var input = document.createElement("input");
                  input.type = "hidden";
                  input.name = key;
                  input.value = value;
                  form.appendChild(input);
                });
                document.body.appendChild(form);
                options['submitter'] ? options['submitter'](form) : form.submit();
                setTimeout(function() {
                  form.parentNode.removeChild(form);
                }, 0);
              }
            };
          }());
          ko.exportSymbol('utils', ko.utils);
          ko.exportSymbol('utils.arrayForEach', ko.utils.arrayForEach);
          ko.exportSymbol('utils.arrayFirst', ko.utils.arrayFirst);
          ko.exportSymbol('utils.arrayFilter', ko.utils.arrayFilter);
          ko.exportSymbol('utils.arrayGetDistinctValues', ko.utils.arrayGetDistinctValues);
          ko.exportSymbol('utils.arrayIndexOf', ko.utils.arrayIndexOf);
          ko.exportSymbol('utils.arrayMap', ko.utils.arrayMap);
          ko.exportSymbol('utils.arrayPushAll', ko.utils.arrayPushAll);
          ko.exportSymbol('utils.arrayRemoveItem', ko.utils.arrayRemoveItem);
          ko.exportSymbol('utils.extend', ko.utils.extend);
          ko.exportSymbol('utils.fieldsIncludedWithJsonPost', ko.utils.fieldsIncludedWithJsonPost);
          ko.exportSymbol('utils.getFormFields', ko.utils.getFormFields);
          ko.exportSymbol('utils.peekObservable', ko.utils.peekObservable);
          ko.exportSymbol('utils.postJson', ko.utils.postJson);
          ko.exportSymbol('utils.parseJson', ko.utils.parseJson);
          ko.exportSymbol('utils.registerEventHandler', ko.utils.registerEventHandler);
          ko.exportSymbol('utils.stringifyJson', ko.utils.stringifyJson);
          ko.exportSymbol('utils.range', ko.utils.range);
          ko.exportSymbol('utils.toggleDomNodeCssClass', ko.utils.toggleDomNodeCssClass);
          ko.exportSymbol('utils.triggerEvent', ko.utils.triggerEvent);
          ko.exportSymbol('utils.unwrapObservable', ko.utils.unwrapObservable);
          ko.exportSymbol('utils.objectForEach', ko.utils.objectForEach);
          ko.exportSymbol('utils.addOrRemoveItem', ko.utils.addOrRemoveItem);
          ko.exportSymbol('unwrap', ko.utils.unwrapObservable);
          if (!Function.prototype['bind']) {
            Function.prototype['bind'] = function(object) {
              var originalFunction = this,
                  args = Array.prototype.slice.call(arguments),
                  object = args.shift();
              return function() {
                return originalFunction.apply(object, args.concat(Array.prototype.slice.call(arguments)));
              };
            };
          }
          ko.utils.domData = new (function() {
            var uniqueId = 0;
            var dataStoreKeyExpandoPropertyName = "__ko__" + (new Date).getTime();
            var dataStore = {};
            function getAll(node, createIfNotFound) {
              var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
              var hasExistingDataStore = dataStoreKey && (dataStoreKey !== "null") && dataStore[dataStoreKey];
              if (!hasExistingDataStore) {
                if (!createIfNotFound)
                  return undefined;
                dataStoreKey = node[dataStoreKeyExpandoPropertyName] = "ko" + uniqueId++;
                dataStore[dataStoreKey] = {};
              }
              return dataStore[dataStoreKey];
            }
            return {
              get: function(node, key) {
                var allDataForNode = getAll(node, false);
                return allDataForNode === undefined ? undefined : allDataForNode[key];
              },
              set: function(node, key, value) {
                if (value === undefined) {
                  if (getAll(node, false) === undefined)
                    return;
                }
                var allDataForNode = getAll(node, true);
                allDataForNode[key] = value;
              },
              clear: function(node) {
                var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
                if (dataStoreKey) {
                  delete dataStore[dataStoreKey];
                  node[dataStoreKeyExpandoPropertyName] = null;
                  return true;
                }
                return false;
              },
              nextKey: function() {
                return (uniqueId++) + dataStoreKeyExpandoPropertyName;
              }
            };
          })();
          ko.exportSymbol('utils.domData', ko.utils.domData);
          ko.exportSymbol('utils.domData.clear', ko.utils.domData.clear);
          ko.utils.domNodeDisposal = new (function() {
            var domDataKey = ko.utils.domData.nextKey();
            var cleanableNodeTypes = {
              1: true,
              8: true,
              9: true
            };
            var cleanableNodeTypesWithDescendants = {
              1: true,
              9: true
            };
            function getDisposeCallbacksCollection(node, createIfNotFound) {
              var allDisposeCallbacks = ko.utils.domData.get(node, domDataKey);
              if ((allDisposeCallbacks === undefined) && createIfNotFound) {
                allDisposeCallbacks = [];
                ko.utils.domData.set(node, domDataKey, allDisposeCallbacks);
              }
              return allDisposeCallbacks;
            }
            function destroyCallbacksCollection(node) {
              ko.utils.domData.set(node, domDataKey, undefined);
            }
            function cleanSingleNode(node) {
              var callbacks = getDisposeCallbacksCollection(node, false);
              if (callbacks) {
                callbacks = callbacks.slice(0);
                for (var i = 0; i < callbacks.length; i++)
                  callbacks[i](node);
              }
              ko.utils.domData.clear(node);
              ko.utils.domNodeDisposal["cleanExternalData"](node);
              if (cleanableNodeTypesWithDescendants[node.nodeType])
                cleanImmediateCommentTypeChildren(node);
            }
            function cleanImmediateCommentTypeChildren(nodeWithChildren) {
              var child,
                  nextChild = nodeWithChildren.firstChild;
              while (child = nextChild) {
                nextChild = child.nextSibling;
                if (child.nodeType === 8)
                  cleanSingleNode(child);
              }
            }
            return {
              addDisposeCallback: function(node, callback) {
                if (typeof callback != "function")
                  throw new Error("Callback must be a function");
                getDisposeCallbacksCollection(node, true).push(callback);
              },
              removeDisposeCallback: function(node, callback) {
                var callbacksCollection = getDisposeCallbacksCollection(node, false);
                if (callbacksCollection) {
                  ko.utils.arrayRemoveItem(callbacksCollection, callback);
                  if (callbacksCollection.length == 0)
                    destroyCallbacksCollection(node);
                }
              },
              cleanNode: function(node) {
                if (cleanableNodeTypes[node.nodeType]) {
                  cleanSingleNode(node);
                  if (cleanableNodeTypesWithDescendants[node.nodeType]) {
                    var descendants = [];
                    ko.utils.arrayPushAll(descendants, node.getElementsByTagName("*"));
                    for (var i = 0,
                        j = descendants.length; i < j; i++)
                      cleanSingleNode(descendants[i]);
                  }
                }
                return node;
              },
              removeNode: function(node) {
                ko.cleanNode(node);
                if (node.parentNode)
                  node.parentNode.removeChild(node);
              },
              "cleanExternalData": function(node) {
                if (jQueryInstance && (typeof jQueryInstance['cleanData'] == "function"))
                  jQueryInstance['cleanData']([node]);
              }
            };
          })();
          ko.cleanNode = ko.utils.domNodeDisposal.cleanNode;
          ko.removeNode = ko.utils.domNodeDisposal.removeNode;
          ko.exportSymbol('cleanNode', ko.cleanNode);
          ko.exportSymbol('removeNode', ko.removeNode);
          ko.exportSymbol('utils.domNodeDisposal', ko.utils.domNodeDisposal);
          ko.exportSymbol('utils.domNodeDisposal.addDisposeCallback', ko.utils.domNodeDisposal.addDisposeCallback);
          ko.exportSymbol('utils.domNodeDisposal.removeDisposeCallback', ko.utils.domNodeDisposal.removeDisposeCallback);
          (function() {
            var leadingCommentRegex = /^(\s*)<!--(.*?)-->/;
            function simpleHtmlParse(html) {
              var tags = ko.utils.stringTrim(html).toLowerCase(),
                  div = document.createElement("div");
              var wrap = tags.match(/^<(thead|tbody|tfoot)/) && [1, "<table>", "</table>"] || !tags.indexOf("<tr") && [2, "<table><tbody>", "</tbody></table>"] || (!tags.indexOf("<td") || !tags.indexOf("<th")) && [3, "<table><tbody><tr>", "</tr></tbody></table>"] || [0, "", ""];
              var markup = "ignored<div>" + wrap[1] + html + wrap[2] + "</div>";
              if (typeof window['innerShiv'] == "function") {
                div.appendChild(window['innerShiv'](markup));
              } else {
                div.innerHTML = markup;
              }
              while (wrap[0]--)
                div = div.lastChild;
              return ko.utils.makeArray(div.lastChild.childNodes);
            }
            function jQueryHtmlParse(html) {
              if (jQueryInstance['parseHTML']) {
                return jQueryInstance['parseHTML'](html) || [];
              } else {
                var elems = jQueryInstance['clean']([html]);
                if (elems && elems[0]) {
                  var elem = elems[0];
                  while (elem.parentNode && elem.parentNode.nodeType !== 11)
                    elem = elem.parentNode;
                  if (elem.parentNode)
                    elem.parentNode.removeChild(elem);
                }
                return elems;
              }
            }
            ko.utils.parseHtmlFragment = function(html) {
              return jQueryInstance ? jQueryHtmlParse(html) : simpleHtmlParse(html);
            };
            ko.utils.setHtml = function(node, html) {
              ko.utils.emptyDomNode(node);
              html = ko.utils.unwrapObservable(html);
              if ((html !== null) && (html !== undefined)) {
                if (typeof html != 'string')
                  html = html.toString();
                if (jQueryInstance) {
                  jQueryInstance(node)['html'](html);
                } else {
                  var parsedNodes = ko.utils.parseHtmlFragment(html);
                  for (var i = 0; i < parsedNodes.length; i++)
                    node.appendChild(parsedNodes[i]);
                }
              }
            };
          })();
          ko.exportSymbol('utils.parseHtmlFragment', ko.utils.parseHtmlFragment);
          ko.exportSymbol('utils.setHtml', ko.utils.setHtml);
          ko.memoization = (function() {
            var memos = {};
            function randomMax8HexChars() {
              return (((1 + Math.random()) * 0x100000000) | 0).toString(16).substring(1);
            }
            function generateRandomId() {
              return randomMax8HexChars() + randomMax8HexChars();
            }
            function findMemoNodes(rootNode, appendToArray) {
              if (!rootNode)
                return;
              if (rootNode.nodeType == 8) {
                var memoId = ko.memoization.parseMemoText(rootNode.nodeValue);
                if (memoId != null)
                  appendToArray.push({
                    domNode: rootNode,
                    memoId: memoId
                  });
              } else if (rootNode.nodeType == 1) {
                for (var i = 0,
                    childNodes = rootNode.childNodes,
                    j = childNodes.length; i < j; i++)
                  findMemoNodes(childNodes[i], appendToArray);
              }
            }
            return {
              memoize: function(callback) {
                if (typeof callback != "function")
                  throw new Error("You can only pass a function to ko.memoization.memoize()");
                var memoId = generateRandomId();
                memos[memoId] = callback;
                return "<!--[ko_memo:" + memoId + "]-->";
              },
              unmemoize: function(memoId, callbackParams) {
                var callback = memos[memoId];
                if (callback === undefined)
                  throw new Error("Couldn't find any memo with ID " + memoId + ". Perhaps it's already been unmemoized.");
                try {
                  callback.apply(null, callbackParams || []);
                  return true;
                } finally {
                  delete memos[memoId];
                }
              },
              unmemoizeDomNodeAndDescendants: function(domNode, extraCallbackParamsArray) {
                var memos = [];
                findMemoNodes(domNode, memos);
                for (var i = 0,
                    j = memos.length; i < j; i++) {
                  var node = memos[i].domNode;
                  var combinedParams = [node];
                  if (extraCallbackParamsArray)
                    ko.utils.arrayPushAll(combinedParams, extraCallbackParamsArray);
                  ko.memoization.unmemoize(memos[i].memoId, combinedParams);
                  node.nodeValue = "";
                  if (node.parentNode)
                    node.parentNode.removeChild(node);
                }
              },
              parseMemoText: function(memoText) {
                var match = memoText.match(/^\[ko_memo\:(.*?)\]$/);
                return match ? match[1] : null;
              }
            };
          })();
          ko.exportSymbol('memoization', ko.memoization);
          ko.exportSymbol('memoization.memoize', ko.memoization.memoize);
          ko.exportSymbol('memoization.unmemoize', ko.memoization.unmemoize);
          ko.exportSymbol('memoization.parseMemoText', ko.memoization.parseMemoText);
          ko.exportSymbol('memoization.unmemoizeDomNodeAndDescendants', ko.memoization.unmemoizeDomNodeAndDescendants);
          ko.extenders = {
            'throttle': function(target, timeout) {
              target['throttleEvaluation'] = timeout;
              var writeTimeoutInstance = null;
              return ko.dependentObservable({
                'read': target,
                'write': function(value) {
                  clearTimeout(writeTimeoutInstance);
                  writeTimeoutInstance = setTimeout(function() {
                    target(value);
                  }, timeout);
                }
              });
            },
            'rateLimit': function(target, options) {
              var timeout,
                  method,
                  limitFunction;
              if (typeof options == 'number') {
                timeout = options;
              } else {
                timeout = options['timeout'];
                method = options['method'];
              }
              limitFunction = method == 'notifyWhenChangesStop' ? debounce : throttle;
              target.limit(function(callback) {
                return limitFunction(callback, timeout);
              });
            },
            'notify': function(target, notifyWhen) {
              target["equalityComparer"] = notifyWhen == "always" ? null : valuesArePrimitiveAndEqual;
            }
          };
          var primitiveTypes = {
            'undefined': 1,
            'boolean': 1,
            'number': 1,
            'string': 1
          };
          function valuesArePrimitiveAndEqual(a, b) {
            var oldValueIsPrimitive = (a === null) || (typeof(a) in primitiveTypes);
            return oldValueIsPrimitive ? (a === b) : false;
          }
          function throttle(callback, timeout) {
            var timeoutInstance;
            return function() {
              if (!timeoutInstance) {
                timeoutInstance = setTimeout(function() {
                  timeoutInstance = undefined;
                  callback();
                }, timeout);
              }
            };
          }
          function debounce(callback, timeout) {
            var timeoutInstance;
            return function() {
              clearTimeout(timeoutInstance);
              timeoutInstance = setTimeout(callback, timeout);
            };
          }
          function applyExtenders(requestedExtenders) {
            var target = this;
            if (requestedExtenders) {
              ko.utils.objectForEach(requestedExtenders, function(key, value) {
                var extenderHandler = ko.extenders[key];
                if (typeof extenderHandler == 'function') {
                  target = extenderHandler(target, value) || target;
                }
              });
            }
            return target;
          }
          ko.exportSymbol('extenders', ko.extenders);
          ko.subscription = function(target, callback, disposeCallback) {
            this.target = target;
            this.callback = callback;
            this.disposeCallback = disposeCallback;
            this.isDisposed = false;
            ko.exportProperty(this, 'dispose', this.dispose);
          };
          ko.subscription.prototype.dispose = function() {
            this.isDisposed = true;
            this.disposeCallback();
          };
          ko.subscribable = function() {
            ko.utils.setPrototypeOfOrExtend(this, ko.subscribable['fn']);
            this._subscriptions = {};
          };
          var defaultEvent = "change";
          var ko_subscribable_fn = {
            subscribe: function(callback, callbackTarget, event) {
              var self = this;
              event = event || defaultEvent;
              var boundCallback = callbackTarget ? callback.bind(callbackTarget) : callback;
              var subscription = new ko.subscription(self, boundCallback, function() {
                ko.utils.arrayRemoveItem(self._subscriptions[event], subscription);
                if (self.afterSubscriptionRemove)
                  self.afterSubscriptionRemove(event);
              });
              if (self.beforeSubscriptionAdd)
                self.beforeSubscriptionAdd(event);
              if (!self._subscriptions[event])
                self._subscriptions[event] = [];
              self._subscriptions[event].push(subscription);
              return subscription;
            },
            "notifySubscribers": function(valueToNotify, event) {
              event = event || defaultEvent;
              if (this.hasSubscriptionsForEvent(event)) {
                try {
                  ko.dependencyDetection.begin();
                  for (var a = this._subscriptions[event].slice(0),
                      i = 0,
                      subscription; subscription = a[i]; ++i) {
                    if (!subscription.isDisposed)
                      subscription.callback(valueToNotify);
                  }
                } finally {
                  ko.dependencyDetection.end();
                }
              }
            },
            limit: function(limitFunction) {
              var self = this,
                  selfIsObservable = ko.isObservable(self),
                  isPending,
                  previousValue,
                  pendingValue,
                  beforeChange = 'beforeChange';
              if (!self._origNotifySubscribers) {
                self._origNotifySubscribers = self["notifySubscribers"];
                self["notifySubscribers"] = function(value, event) {
                  if (!event || event === defaultEvent) {
                    self._rateLimitedChange(value);
                  } else if (event === beforeChange) {
                    self._rateLimitedBeforeChange(value);
                  } else {
                    self._origNotifySubscribers(value, event);
                  }
                };
              }
              var finish = limitFunction(function() {
                if (selfIsObservable && pendingValue === self) {
                  pendingValue = self();
                }
                isPending = false;
                if (self.isDifferent(previousValue, pendingValue)) {
                  self._origNotifySubscribers(previousValue = pendingValue);
                }
              });
              self._rateLimitedChange = function(value) {
                isPending = true;
                pendingValue = value;
                finish();
              };
              self._rateLimitedBeforeChange = function(value) {
                if (!isPending) {
                  previousValue = value;
                  self._origNotifySubscribers(value, beforeChange);
                }
              };
            },
            hasSubscriptionsForEvent: function(event) {
              return this._subscriptions[event] && this._subscriptions[event].length;
            },
            getSubscriptionsCount: function() {
              var total = 0;
              ko.utils.objectForEach(this._subscriptions, function(eventName, subscriptions) {
                total += subscriptions.length;
              });
              return total;
            },
            isDifferent: function(oldValue, newValue) {
              return !this['equalityComparer'] || !this['equalityComparer'](oldValue, newValue);
            },
            extend: applyExtenders
          };
          ko.exportProperty(ko_subscribable_fn, 'subscribe', ko_subscribable_fn.subscribe);
          ko.exportProperty(ko_subscribable_fn, 'extend', ko_subscribable_fn.extend);
          ko.exportProperty(ko_subscribable_fn, 'getSubscriptionsCount', ko_subscribable_fn.getSubscriptionsCount);
          if (ko.utils.canSetPrototype) {
            ko.utils.setPrototypeOf(ko_subscribable_fn, Function.prototype);
          }
          ko.subscribable['fn'] = ko_subscribable_fn;
          ko.isSubscribable = function(instance) {
            return instance != null && typeof instance.subscribe == "function" && typeof instance["notifySubscribers"] == "function";
          };
          ko.exportSymbol('subscribable', ko.subscribable);
          ko.exportSymbol('isSubscribable', ko.isSubscribable);
          ko.computedContext = ko.dependencyDetection = (function() {
            var outerFrames = [],
                currentFrame,
                lastId = 0;
            function getId() {
              return ++lastId;
            }
            function begin(options) {
              outerFrames.push(currentFrame);
              currentFrame = options;
            }
            function end() {
              currentFrame = outerFrames.pop();
            }
            return {
              begin: begin,
              end: end,
              registerDependency: function(subscribable) {
                if (currentFrame) {
                  if (!ko.isSubscribable(subscribable))
                    throw new Error("Only subscribable things can act as dependencies");
                  currentFrame.callback(subscribable, subscribable._id || (subscribable._id = getId()));
                }
              },
              ignore: function(callback, callbackTarget, callbackArgs) {
                try {
                  begin();
                  return callback.apply(callbackTarget, callbackArgs || []);
                } finally {
                  end();
                }
              },
              getDependenciesCount: function() {
                if (currentFrame)
                  return currentFrame.computed.getDependenciesCount();
              },
              isInitial: function() {
                if (currentFrame)
                  return currentFrame.isInitial;
              }
            };
          })();
          ko.exportSymbol('computedContext', ko.computedContext);
          ko.exportSymbol('computedContext.getDependenciesCount', ko.computedContext.getDependenciesCount);
          ko.exportSymbol('computedContext.isInitial', ko.computedContext.isInitial);
          ko.exportSymbol('computedContext.isSleeping', ko.computedContext.isSleeping);
          ko.observable = function(initialValue) {
            var _latestValue = initialValue;
            function observable() {
              if (arguments.length > 0) {
                if (observable.isDifferent(_latestValue, arguments[0])) {
                  observable.valueWillMutate();
                  _latestValue = arguments[0];
                  if (DEBUG)
                    observable._latestValue = _latestValue;
                  observable.valueHasMutated();
                }
                return this;
              } else {
                ko.dependencyDetection.registerDependency(observable);
                return _latestValue;
              }
            }
            ko.subscribable.call(observable);
            ko.utils.setPrototypeOfOrExtend(observable, ko.observable['fn']);
            if (DEBUG)
              observable._latestValue = _latestValue;
            observable.peek = function() {
              return _latestValue;
            };
            observable.valueHasMutated = function() {
              observable["notifySubscribers"](_latestValue);
            };
            observable.valueWillMutate = function() {
              observable["notifySubscribers"](_latestValue, "beforeChange");
            };
            ko.exportProperty(observable, 'peek', observable.peek);
            ko.exportProperty(observable, "valueHasMutated", observable.valueHasMutated);
            ko.exportProperty(observable, "valueWillMutate", observable.valueWillMutate);
            return observable;
          };
          ko.observable['fn'] = {"equalityComparer": valuesArePrimitiveAndEqual};
          var protoProperty = ko.observable.protoProperty = "__ko_proto__";
          ko.observable['fn'][protoProperty] = ko.observable;
          if (ko.utils.canSetPrototype) {
            ko.utils.setPrototypeOf(ko.observable['fn'], ko.subscribable['fn']);
          }
          ko.hasPrototype = function(instance, prototype) {
            if ((instance === null) || (instance === undefined) || (instance[protoProperty] === undefined))
              return false;
            if (instance[protoProperty] === prototype)
              return true;
            return ko.hasPrototype(instance[protoProperty], prototype);
          };
          ko.isObservable = function(instance) {
            return ko.hasPrototype(instance, ko.observable);
          };
          ko.isWriteableObservable = function(instance) {
            if ((typeof instance == "function") && instance[protoProperty] === ko.observable)
              return true;
            if ((typeof instance == "function") && (instance[protoProperty] === ko.dependentObservable) && (instance.hasWriteFunction))
              return true;
            return false;
          };
          ko.exportSymbol('observable', ko.observable);
          ko.exportSymbol('isObservable', ko.isObservable);
          ko.exportSymbol('isWriteableObservable', ko.isWriteableObservable);
          ko.exportSymbol('isWritableObservable', ko.isWriteableObservable);
          ko.observableArray = function(initialValues) {
            initialValues = initialValues || [];
            if (typeof initialValues != 'object' || !('length' in initialValues))
              throw new Error("The argument passed when initializing an observable array must be an array, or null, or undefined.");
            var result = ko.observable(initialValues);
            ko.utils.setPrototypeOfOrExtend(result, ko.observableArray['fn']);
            return result.extend({'trackArrayChanges': true});
          };
          ko.observableArray['fn'] = {
            'remove': function(valueOrPredicate) {
              var underlyingArray = this.peek();
              var removedValues = [];
              var predicate = typeof valueOrPredicate == "function" && !ko.isObservable(valueOrPredicate) ? valueOrPredicate : function(value) {
                return value === valueOrPredicate;
              };
              for (var i = 0; i < underlyingArray.length; i++) {
                var value = underlyingArray[i];
                if (predicate(value)) {
                  if (removedValues.length === 0) {
                    this.valueWillMutate();
                  }
                  removedValues.push(value);
                  underlyingArray.splice(i, 1);
                  i--;
                }
              }
              if (removedValues.length) {
                this.valueHasMutated();
              }
              return removedValues;
            },
            'removeAll': function(arrayOfValues) {
              if (arrayOfValues === undefined) {
                var underlyingArray = this.peek();
                var allValues = underlyingArray.slice(0);
                this.valueWillMutate();
                underlyingArray.splice(0, underlyingArray.length);
                this.valueHasMutated();
                return allValues;
              }
              if (!arrayOfValues)
                return [];
              return this['remove'](function(value) {
                return ko.utils.arrayIndexOf(arrayOfValues, value) >= 0;
              });
            },
            'destroy': function(valueOrPredicate) {
              var underlyingArray = this.peek();
              var predicate = typeof valueOrPredicate == "function" && !ko.isObservable(valueOrPredicate) ? valueOrPredicate : function(value) {
                return value === valueOrPredicate;
              };
              this.valueWillMutate();
              for (var i = underlyingArray.length - 1; i >= 0; i--) {
                var value = underlyingArray[i];
                if (predicate(value))
                  underlyingArray[i]["_destroy"] = true;
              }
              this.valueHasMutated();
            },
            'destroyAll': function(arrayOfValues) {
              if (arrayOfValues === undefined)
                return this['destroy'](function() {
                  return true;
                });
              if (!arrayOfValues)
                return [];
              return this['destroy'](function(value) {
                return ko.utils.arrayIndexOf(arrayOfValues, value) >= 0;
              });
            },
            'indexOf': function(item) {
              var underlyingArray = this();
              return ko.utils.arrayIndexOf(underlyingArray, item);
            },
            'replace': function(oldItem, newItem) {
              var index = this['indexOf'](oldItem);
              if (index >= 0) {
                this.valueWillMutate();
                this.peek()[index] = newItem;
                this.valueHasMutated();
              }
            }
          };
          ko.utils.arrayForEach(["pop", "push", "reverse", "shift", "sort", "splice", "unshift"], function(methodName) {
            ko.observableArray['fn'][methodName] = function() {
              var underlyingArray = this.peek();
              this.valueWillMutate();
              this.cacheDiffForKnownOperation(underlyingArray, methodName, arguments);
              var methodCallResult = underlyingArray[methodName].apply(underlyingArray, arguments);
              this.valueHasMutated();
              return methodCallResult;
            };
          });
          ko.utils.arrayForEach(["slice"], function(methodName) {
            ko.observableArray['fn'][methodName] = function() {
              var underlyingArray = this();
              return underlyingArray[methodName].apply(underlyingArray, arguments);
            };
          });
          if (ko.utils.canSetPrototype) {
            ko.utils.setPrototypeOf(ko.observableArray['fn'], ko.observable['fn']);
          }
          ko.exportSymbol('observableArray', ko.observableArray);
          var arrayChangeEventName = 'arrayChange';
          ko.extenders['trackArrayChanges'] = function(target) {
            if (target.cacheDiffForKnownOperation) {
              return;
            }
            var trackingChanges = false,
                cachedDiff = null,
                pendingNotifications = 0,
                underlyingSubscribeFunction = target.subscribe;
            target.subscribe = target['subscribe'] = function(callback, callbackTarget, event) {
              if (event === arrayChangeEventName) {
                trackChanges();
              }
              return underlyingSubscribeFunction.apply(this, arguments);
            };
            function trackChanges() {
              if (trackingChanges) {
                return;
              }
              trackingChanges = true;
              var underlyingNotifySubscribersFunction = target['notifySubscribers'];
              target['notifySubscribers'] = function(valueToNotify, event) {
                if (!event || event === defaultEvent) {
                  ++pendingNotifications;
                }
                return underlyingNotifySubscribersFunction.apply(this, arguments);
              };
              var previousContents = [].concat(target.peek() || []);
              cachedDiff = null;
              target.subscribe(function(currentContents) {
                currentContents = [].concat(currentContents || []);
                if (target.hasSubscriptionsForEvent(arrayChangeEventName)) {
                  var changes = getChanges(previousContents, currentContents);
                  if (changes.length) {
                    target['notifySubscribers'](changes, arrayChangeEventName);
                  }
                }
                previousContents = currentContents;
                cachedDiff = null;
                pendingNotifications = 0;
              });
            }
            function getChanges(previousContents, currentContents) {
              if (!cachedDiff || pendingNotifications > 1) {
                cachedDiff = ko.utils.compareArrays(previousContents, currentContents, {'sparse': true});
              }
              return cachedDiff;
            }
            target.cacheDiffForKnownOperation = function(rawArray, operationName, args) {
              if (!trackingChanges || pendingNotifications) {
                return;
              }
              var diff = [],
                  arrayLength = rawArray.length,
                  argsLength = args.length,
                  offset = 0;
              function pushDiff(status, value, index) {
                return diff[diff.length] = {
                  'status': status,
                  'value': value,
                  'index': index
                };
              }
              switch (operationName) {
                case 'push':
                  offset = arrayLength;
                case 'unshift':
                  for (var index = 0; index < argsLength; index++) {
                    pushDiff('added', args[index], offset + index);
                  }
                  break;
                case 'pop':
                  offset = arrayLength - 1;
                case 'shift':
                  if (arrayLength) {
                    pushDiff('deleted', rawArray[offset], offset);
                  }
                  break;
                case 'splice':
                  var startIndex = Math.min(Math.max(0, args[0] < 0 ? arrayLength + args[0] : args[0]), arrayLength),
                      endDeleteIndex = argsLength === 1 ? arrayLength : Math.min(startIndex + (args[1] || 0), arrayLength),
                      endAddIndex = startIndex + argsLength - 2,
                      endIndex = Math.max(endDeleteIndex, endAddIndex),
                      additions = [],
                      deletions = [];
                  for (var index = startIndex,
                      argsIndex = 2; index < endIndex; ++index, ++argsIndex) {
                    if (index < endDeleteIndex)
                      deletions.push(pushDiff('deleted', rawArray[index], index));
                    if (index < endAddIndex)
                      additions.push(pushDiff('added', args[argsIndex], index));
                  }
                  ko.utils.findMovesInArrayComparison(deletions, additions);
                  break;
                default:
                  return;
              }
              cachedDiff = diff;
            };
          };
          ko.computed = ko.dependentObservable = function(evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
            var _latestValue,
                _needsEvaluation = true,
                _isBeingEvaluated = false,
                _suppressDisposalUntilDisposeWhenReturnsFalse = false,
                _isDisposed = false,
                readFunction = evaluatorFunctionOrOptions,
                pure = false,
                isSleeping = false;
            if (readFunction && typeof readFunction == "object") {
              options = readFunction;
              readFunction = options["read"];
            } else {
              options = options || {};
              if (!readFunction)
                readFunction = options["read"];
            }
            if (typeof readFunction != "function")
              throw new Error("Pass a function that returns the value of the ko.computed");
            function addSubscriptionToDependency(subscribable, id) {
              if (!_subscriptionsToDependencies[id]) {
                _subscriptionsToDependencies[id] = subscribable.subscribe(evaluatePossiblyAsync);
                ++_dependenciesCount;
              }
            }
            function disposeAllSubscriptionsToDependencies() {
              ko.utils.objectForEach(_subscriptionsToDependencies, function(id, subscription) {
                subscription.dispose();
              });
              _subscriptionsToDependencies = {};
            }
            function disposeComputed() {
              disposeAllSubscriptionsToDependencies();
              _dependenciesCount = 0;
              _isDisposed = true;
              _needsEvaluation = false;
            }
            function evaluatePossiblyAsync() {
              var throttleEvaluationTimeout = dependentObservable['throttleEvaluation'];
              if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
                clearTimeout(evaluationTimeoutInstance);
                evaluationTimeoutInstance = setTimeout(evaluateImmediate, throttleEvaluationTimeout);
              } else if (dependentObservable._evalRateLimited) {
                dependentObservable._evalRateLimited();
              } else {
                evaluateImmediate();
              }
            }
            function evaluateImmediate(suppressChangeNotification) {
              if (_isBeingEvaluated) {
                if (pure) {
                  throw Error("A 'pure' computed must not be called recursively");
                }
                return;
              }
              if (_isDisposed) {
                return;
              }
              if (disposeWhen && disposeWhen()) {
                if (!_suppressDisposalUntilDisposeWhenReturnsFalse) {
                  dispose();
                  return;
                }
              } else {
                _suppressDisposalUntilDisposeWhenReturnsFalse = false;
              }
              _isBeingEvaluated = true;
              if (isSleeping) {
                try {
                  var dependencyTracking = {};
                  ko.dependencyDetection.begin({
                    callback: function(subscribable, id) {
                      if (!dependencyTracking[id]) {
                        dependencyTracking[id] = 1;
                        ++_dependenciesCount;
                      }
                    },
                    computed: dependentObservable,
                    isInitial: undefined
                  });
                  _dependenciesCount = 0;
                  _latestValue = readFunction.call(evaluatorFunctionTarget);
                } finally {
                  ko.dependencyDetection.end();
                  _isBeingEvaluated = false;
                }
              } else {
                try {
                  var disposalCandidates = _subscriptionsToDependencies,
                      disposalCount = _dependenciesCount;
                  ko.dependencyDetection.begin({
                    callback: function(subscribable, id) {
                      if (!_isDisposed) {
                        if (disposalCount && disposalCandidates[id]) {
                          _subscriptionsToDependencies[id] = disposalCandidates[id];
                          ++_dependenciesCount;
                          delete disposalCandidates[id];
                          --disposalCount;
                        } else {
                          addSubscriptionToDependency(subscribable, id);
                        }
                      }
                    },
                    computed: dependentObservable,
                    isInitial: pure ? undefined : !_dependenciesCount
                  });
                  _subscriptionsToDependencies = {};
                  _dependenciesCount = 0;
                  try {
                    var newValue = evaluatorFunctionTarget ? readFunction.call(evaluatorFunctionTarget) : readFunction();
                  } finally {
                    ko.dependencyDetection.end();
                    if (disposalCount) {
                      ko.utils.objectForEach(disposalCandidates, function(id, toDispose) {
                        toDispose.dispose();
                      });
                    }
                    _needsEvaluation = false;
                  }
                  if (dependentObservable.isDifferent(_latestValue, newValue)) {
                    dependentObservable["notifySubscribers"](_latestValue, "beforeChange");
                    _latestValue = newValue;
                    if (DEBUG)
                      dependentObservable._latestValue = _latestValue;
                    if (suppressChangeNotification !== true) {
                      dependentObservable["notifySubscribers"](_latestValue);
                    }
                  }
                } finally {
                  _isBeingEvaluated = false;
                }
              }
              if (!_dependenciesCount)
                dispose();
            }
            function dependentObservable() {
              if (arguments.length > 0) {
                if (typeof writeFunction === "function") {
                  writeFunction.apply(evaluatorFunctionTarget, arguments);
                } else {
                  throw new Error("Cannot write a value to a ko.computed unless you specify a 'write' option. If you wish to read the current value, don't pass any parameters.");
                }
                return this;
              } else {
                ko.dependencyDetection.registerDependency(dependentObservable);
                if (_needsEvaluation)
                  evaluateImmediate(true);
                return _latestValue;
              }
            }
            function peek() {
              if (_needsEvaluation && !_dependenciesCount)
                evaluateImmediate(true);
              return _latestValue;
            }
            function isActive() {
              return _needsEvaluation || _dependenciesCount > 0;
            }
            var writeFunction = options["write"],
                disposeWhenNodeIsRemoved = options["disposeWhenNodeIsRemoved"] || options.disposeWhenNodeIsRemoved || null,
                disposeWhenOption = options["disposeWhen"] || options.disposeWhen,
                disposeWhen = disposeWhenOption,
                dispose = disposeComputed,
                _subscriptionsToDependencies = {},
                _dependenciesCount = 0,
                evaluationTimeoutInstance = null;
            if (!evaluatorFunctionTarget)
              evaluatorFunctionTarget = options["owner"];
            ko.subscribable.call(dependentObservable);
            ko.utils.setPrototypeOfOrExtend(dependentObservable, ko.dependentObservable['fn']);
            dependentObservable.peek = peek;
            dependentObservable.getDependenciesCount = function() {
              return _dependenciesCount;
            };
            dependentObservable.hasWriteFunction = typeof options["write"] === "function";
            dependentObservable.dispose = function() {
              dispose();
            };
            dependentObservable.isActive = isActive;
            var originalLimit = dependentObservable.limit;
            dependentObservable.limit = function(limitFunction) {
              originalLimit.call(dependentObservable, limitFunction);
              dependentObservable._evalRateLimited = function() {
                dependentObservable._rateLimitedBeforeChange(_latestValue);
                _needsEvaluation = true;
                dependentObservable._rateLimitedChange(dependentObservable);
              };
            };
            if (options['pure']) {
              pure = true;
              isSleeping = true;
              dependentObservable.beforeSubscriptionAdd = function() {
                if (isSleeping) {
                  isSleeping = false;
                  evaluateImmediate(true);
                }
              };
              dependentObservable.afterSubscriptionRemove = function() {
                if (!dependentObservable.getSubscriptionsCount()) {
                  disposeAllSubscriptionsToDependencies();
                  isSleeping = _needsEvaluation = true;
                }
              };
            } else if (options['deferEvaluation']) {
              dependentObservable.beforeSubscriptionAdd = function() {
                peek();
                delete dependentObservable.beforeSubscriptionAdd;
              };
            }
            ko.exportProperty(dependentObservable, 'peek', dependentObservable.peek);
            ko.exportProperty(dependentObservable, 'dispose', dependentObservable.dispose);
            ko.exportProperty(dependentObservable, 'isActive', dependentObservable.isActive);
            ko.exportProperty(dependentObservable, 'getDependenciesCount', dependentObservable.getDependenciesCount);
            if (disposeWhenNodeIsRemoved) {
              _suppressDisposalUntilDisposeWhenReturnsFalse = true;
              if (disposeWhenNodeIsRemoved.nodeType) {
                disposeWhen = function() {
                  return !ko.utils.domNodeIsAttachedToDocument(disposeWhenNodeIsRemoved) || (disposeWhenOption && disposeWhenOption());
                };
              }
            }
            if (!isSleeping && !options['deferEvaluation'])
              evaluateImmediate();
            if (disposeWhenNodeIsRemoved && isActive() && disposeWhenNodeIsRemoved.nodeType) {
              dispose = function() {
                ko.utils.domNodeDisposal.removeDisposeCallback(disposeWhenNodeIsRemoved, dispose);
                disposeComputed();
              };
              ko.utils.domNodeDisposal.addDisposeCallback(disposeWhenNodeIsRemoved, dispose);
            }
            return dependentObservable;
          };
          ko.isComputed = function(instance) {
            return ko.hasPrototype(instance, ko.dependentObservable);
          };
          var protoProp = ko.observable.protoProperty;
          ko.dependentObservable[protoProp] = ko.observable;
          ko.dependentObservable['fn'] = {"equalityComparer": valuesArePrimitiveAndEqual};
          ko.dependentObservable['fn'][protoProp] = ko.dependentObservable;
          if (ko.utils.canSetPrototype) {
            ko.utils.setPrototypeOf(ko.dependentObservable['fn'], ko.subscribable['fn']);
          }
          ko.exportSymbol('dependentObservable', ko.dependentObservable);
          ko.exportSymbol('computed', ko.dependentObservable);
          ko.exportSymbol('isComputed', ko.isComputed);
          ko.pureComputed = function(evaluatorFunctionOrOptions, evaluatorFunctionTarget) {
            if (typeof evaluatorFunctionOrOptions === 'function') {
              return ko.computed(evaluatorFunctionOrOptions, evaluatorFunctionTarget, {'pure': true});
            } else {
              evaluatorFunctionOrOptions = ko.utils.extend({}, evaluatorFunctionOrOptions);
              evaluatorFunctionOrOptions['pure'] = true;
              return ko.computed(evaluatorFunctionOrOptions, evaluatorFunctionTarget);
            }
          };
          ko.exportSymbol('pureComputed', ko.pureComputed);
          (function() {
            var maxNestedObservableDepth = 10;
            ko.toJS = function(rootObject) {
              if (arguments.length == 0)
                throw new Error("When calling ko.toJS, pass the object you want to convert.");
              return mapJsObjectGraph(rootObject, function(valueToMap) {
                for (var i = 0; ko.isObservable(valueToMap) && (i < maxNestedObservableDepth); i++)
                  valueToMap = valueToMap();
                return valueToMap;
              });
            };
            ko.toJSON = function(rootObject, replacer, space) {
              var plainJavaScriptObject = ko.toJS(rootObject);
              return ko.utils.stringifyJson(plainJavaScriptObject, replacer, space);
            };
            function mapJsObjectGraph(rootObject, mapInputCallback, visitedObjects) {
              visitedObjects = visitedObjects || new objectLookup();
              rootObject = mapInputCallback(rootObject);
              var canHaveProperties = (typeof rootObject == "object") && (rootObject !== null) && (rootObject !== undefined) && (!(rootObject instanceof Date)) && (!(rootObject instanceof String)) && (!(rootObject instanceof Number)) && (!(rootObject instanceof Boolean));
              if (!canHaveProperties)
                return rootObject;
              var outputProperties = rootObject instanceof Array ? [] : {};
              visitedObjects.save(rootObject, outputProperties);
              visitPropertiesOrArrayEntries(rootObject, function(indexer) {
                var propertyValue = mapInputCallback(rootObject[indexer]);
                switch (typeof propertyValue) {
                  case "boolean":
                  case "number":
                  case "string":
                  case "function":
                    outputProperties[indexer] = propertyValue;
                    break;
                  case "object":
                  case "undefined":
                    var previouslyMappedValue = visitedObjects.get(propertyValue);
                    outputProperties[indexer] = (previouslyMappedValue !== undefined) ? previouslyMappedValue : mapJsObjectGraph(propertyValue, mapInputCallback, visitedObjects);
                    break;
                }
              });
              return outputProperties;
            }
            function visitPropertiesOrArrayEntries(rootObject, visitorCallback) {
              if (rootObject instanceof Array) {
                for (var i = 0; i < rootObject.length; i++)
                  visitorCallback(i);
                if (typeof rootObject['toJSON'] == 'function')
                  visitorCallback('toJSON');
              } else {
                for (var propertyName in rootObject) {
                  visitorCallback(propertyName);
                }
              }
            }
            ;
            function objectLookup() {
              this.keys = [];
              this.values = [];
            }
            ;
            objectLookup.prototype = {
              constructor: objectLookup,
              save: function(key, value) {
                var existingIndex = ko.utils.arrayIndexOf(this.keys, key);
                if (existingIndex >= 0)
                  this.values[existingIndex] = value;
                else {
                  this.keys.push(key);
                  this.values.push(value);
                }
              },
              get: function(key) {
                var existingIndex = ko.utils.arrayIndexOf(this.keys, key);
                return (existingIndex >= 0) ? this.values[existingIndex] : undefined;
              }
            };
          })();
          ko.exportSymbol('toJS', ko.toJS);
          ko.exportSymbol('toJSON', ko.toJSON);
          (function() {
            var hasDomDataExpandoProperty = '__ko__hasDomDataOptionValue__';
            ko.selectExtensions = {
              readValue: function(element) {
                switch (ko.utils.tagNameLower(element)) {
                  case 'option':
                    if (element[hasDomDataExpandoProperty] === true)
                      return ko.utils.domData.get(element, ko.bindingHandlers.options.optionValueDomDataKey);
                    return ko.utils.ieVersion <= 7 ? (element.getAttributeNode('value') && element.getAttributeNode('value').specified ? element.value : element.text) : element.value;
                  case 'select':
                    return element.selectedIndex >= 0 ? ko.selectExtensions.readValue(element.options[element.selectedIndex]) : undefined;
                  default:
                    return element.value;
                }
              },
              writeValue: function(element, value, allowUnset) {
                switch (ko.utils.tagNameLower(element)) {
                  case 'option':
                    switch (typeof value) {
                      case "string":
                        ko.utils.domData.set(element, ko.bindingHandlers.options.optionValueDomDataKey, undefined);
                        if (hasDomDataExpandoProperty in element) {
                          delete element[hasDomDataExpandoProperty];
                        }
                        element.value = value;
                        break;
                      default:
                        ko.utils.domData.set(element, ko.bindingHandlers.options.optionValueDomDataKey, value);
                        element[hasDomDataExpandoProperty] = true;
                        element.value = typeof value === "number" ? value : "";
                        break;
                    }
                    break;
                  case 'select':
                    if (value === "" || value === null)
                      value = undefined;
                    var selection = -1;
                    for (var i = 0,
                        n = element.options.length,
                        optionValue; i < n; ++i) {
                      optionValue = ko.selectExtensions.readValue(element.options[i]);
                      if (optionValue == value || (optionValue == "" && value === undefined)) {
                        selection = i;
                        break;
                      }
                    }
                    if (allowUnset || selection >= 0 || (value === undefined && element.size > 1)) {
                      element.selectedIndex = selection;
                    }
                    break;
                  default:
                    if ((value === null) || (value === undefined))
                      value = "";
                    element.value = value;
                    break;
                }
              }
            };
          })();
          ko.exportSymbol('selectExtensions', ko.selectExtensions);
          ko.exportSymbol('selectExtensions.readValue', ko.selectExtensions.readValue);
          ko.exportSymbol('selectExtensions.writeValue', ko.selectExtensions.writeValue);
          ko.expressionRewriting = (function() {
            var javaScriptReservedWords = ["true", "false", "null", "undefined"];
            var javaScriptAssignmentTarget = /^(?:[$_a-z][$\w]*|(.+)(\.\s*[$_a-z][$\w]*|\[.+\]))$/i;
            function getWriteableValue(expression) {
              if (ko.utils.arrayIndexOf(javaScriptReservedWords, expression) >= 0)
                return false;
              var match = expression.match(javaScriptAssignmentTarget);
              return match === null ? false : match[1] ? ('Object(' + match[1] + ')' + match[2]) : expression;
            }
            var stringDouble = '"(?:[^"\\\\]|\\\\.)*"',
                stringSingle = "'(?:[^'\\\\]|\\\\.)*'",
                stringRegexp = '/(?:[^/\\\\]|\\\\.)*/\w*',
                specials = ',"\'{}()/:[\\]',
                everyThingElse = '[^\\s:,/][^' + specials + ']*[^\\s' + specials + ']',
                oneNotSpace = '[^\\s]',
                bindingToken = RegExp(stringDouble + '|' + stringSingle + '|' + stringRegexp + '|' + everyThingElse + '|' + oneNotSpace, 'g'),
                divisionLookBehind = /[\])"'A-Za-z0-9_$]+$/,
                keywordRegexLookBehind = {
                  'in': 1,
                  'return': 1,
                  'typeof': 1
                };
            function parseObjectLiteral(objectLiteralString) {
              var str = ko.utils.stringTrim(objectLiteralString);
              if (str.charCodeAt(0) === 123)
                str = str.slice(1, -1);
              var result = [],
                  toks = str.match(bindingToken),
                  key,
                  values,
                  depth = 0;
              if (toks) {
                toks.push(',');
                for (var i = 0,
                    tok; tok = toks[i]; ++i) {
                  var c = tok.charCodeAt(0);
                  if (c === 44) {
                    if (depth <= 0) {
                      if (key)
                        result.push(values ? {
                          key: key,
                          value: values.join('')
                        } : {'unknown': key});
                      key = values = depth = 0;
                      continue;
                    }
                  } else if (c === 58) {
                    if (!values)
                      continue;
                  } else if (c === 47 && i && tok.length > 1) {
                    var match = toks[i - 1].match(divisionLookBehind);
                    if (match && !keywordRegexLookBehind[match[0]]) {
                      str = str.substr(str.indexOf(tok) + 1);
                      toks = str.match(bindingToken);
                      toks.push(',');
                      i = -1;
                      tok = '/';
                    }
                  } else if (c === 40 || c === 123 || c === 91) {
                    ++depth;
                  } else if (c === 41 || c === 125 || c === 93) {
                    --depth;
                  } else if (!key && !values) {
                    key = (c === 34 || c === 39) ? tok.slice(1, -1) : tok;
                    continue;
                  }
                  if (values)
                    values.push(tok);
                  else
                    values = [tok];
                }
              }
              return result;
            }
            var twoWayBindings = {};
            function preProcessBindings(bindingsStringOrKeyValueArray, bindingOptions) {
              bindingOptions = bindingOptions || {};
              function processKeyValue(key, val) {
                var writableVal;
                function callPreprocessHook(obj) {
                  return (obj && obj['preprocess']) ? (val = obj['preprocess'](val, key, processKeyValue)) : true;
                }
                if (!bindingParams) {
                  if (!callPreprocessHook(ko['getBindingHandler'](key)))
                    return;
                  if (twoWayBindings[key] && (writableVal = getWriteableValue(val))) {
                    propertyAccessorResultStrings.push("'" + key + "':function(_z){" + writableVal + "=_z}");
                  }
                }
                if (makeValueAccessors) {
                  val = 'function(){return ' + val + ' }';
                }
                resultStrings.push("'" + key + "':" + val);
              }
              var resultStrings = [],
                  propertyAccessorResultStrings = [],
                  makeValueAccessors = bindingOptions['valueAccessors'],
                  bindingParams = bindingOptions['bindingParams'],
                  keyValueArray = typeof bindingsStringOrKeyValueArray === "string" ? parseObjectLiteral(bindingsStringOrKeyValueArray) : bindingsStringOrKeyValueArray;
              ko.utils.arrayForEach(keyValueArray, function(keyValue) {
                processKeyValue(keyValue.key || keyValue['unknown'], keyValue.value);
              });
              if (propertyAccessorResultStrings.length)
                processKeyValue('_ko_property_writers', "{" + propertyAccessorResultStrings.join(",") + " }");
              return resultStrings.join(",");
            }
            return {
              bindingRewriteValidators: [],
              twoWayBindings: twoWayBindings,
              parseObjectLiteral: parseObjectLiteral,
              preProcessBindings: preProcessBindings,
              keyValueArrayContainsKey: function(keyValueArray, key) {
                for (var i = 0; i < keyValueArray.length; i++)
                  if (keyValueArray[i]['key'] == key)
                    return true;
                return false;
              },
              writeValueToProperty: function(property, allBindings, key, value, checkIfDifferent) {
                if (!property || !ko.isObservable(property)) {
                  var propWriters = allBindings.get('_ko_property_writers');
                  if (propWriters && propWriters[key])
                    propWriters[key](value);
                } else if (ko.isWriteableObservable(property) && (!checkIfDifferent || property.peek() !== value)) {
                  property(value);
                }
              }
            };
          })();
          ko.exportSymbol('expressionRewriting', ko.expressionRewriting);
          ko.exportSymbol('expressionRewriting.bindingRewriteValidators', ko.expressionRewriting.bindingRewriteValidators);
          ko.exportSymbol('expressionRewriting.parseObjectLiteral', ko.expressionRewriting.parseObjectLiteral);
          ko.exportSymbol('expressionRewriting.preProcessBindings', ko.expressionRewriting.preProcessBindings);
          ko.exportSymbol('expressionRewriting._twoWayBindings', ko.expressionRewriting.twoWayBindings);
          ko.exportSymbol('jsonExpressionRewriting', ko.expressionRewriting);
          ko.exportSymbol('jsonExpressionRewriting.insertPropertyAccessorsIntoJson', ko.expressionRewriting.preProcessBindings);
          (function() {
            var commentNodesHaveTextProperty = document && document.createComment("test").text === "<!--test-->";
            var startCommentRegex = commentNodesHaveTextProperty ? /^<!--\s*ko(?:\s+([\s\S]+))?\s*-->$/ : /^\s*ko(?:\s+([\s\S]+))?\s*$/;
            var endCommentRegex = commentNodesHaveTextProperty ? /^<!--\s*\/ko\s*-->$/ : /^\s*\/ko\s*$/;
            var htmlTagsWithOptionallyClosingChildren = {
              'ul': true,
              'ol': true
            };
            function isStartComment(node) {
              return (node.nodeType == 8) && startCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
            }
            function isEndComment(node) {
              return (node.nodeType == 8) && endCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
            }
            function getVirtualChildren(startComment, allowUnbalanced) {
              var currentNode = startComment;
              var depth = 1;
              var children = [];
              while (currentNode = currentNode.nextSibling) {
                if (isEndComment(currentNode)) {
                  depth--;
                  if (depth === 0)
                    return children;
                }
                children.push(currentNode);
                if (isStartComment(currentNode))
                  depth++;
              }
              if (!allowUnbalanced)
                throw new Error("Cannot find closing comment tag to match: " + startComment.nodeValue);
              return null;
            }
            function getMatchingEndComment(startComment, allowUnbalanced) {
              var allVirtualChildren = getVirtualChildren(startComment, allowUnbalanced);
              if (allVirtualChildren) {
                if (allVirtualChildren.length > 0)
                  return allVirtualChildren[allVirtualChildren.length - 1].nextSibling;
                return startComment.nextSibling;
              } else
                return null;
            }
            function getUnbalancedChildTags(node) {
              var childNode = node.firstChild,
                  captureRemaining = null;
              if (childNode) {
                do {
                  if (captureRemaining)
                    captureRemaining.push(childNode);
                  else if (isStartComment(childNode)) {
                    var matchingEndComment = getMatchingEndComment(childNode, true);
                    if (matchingEndComment)
                      childNode = matchingEndComment;
                    else
                      captureRemaining = [childNode];
                  } else if (isEndComment(childNode)) {
                    captureRemaining = [childNode];
                  }
                } while (childNode = childNode.nextSibling);
              }
              return captureRemaining;
            }
            ko.virtualElements = {
              allowedBindings: {},
              childNodes: function(node) {
                return isStartComment(node) ? getVirtualChildren(node) : node.childNodes;
              },
              emptyNode: function(node) {
                if (!isStartComment(node))
                  ko.utils.emptyDomNode(node);
                else {
                  var virtualChildren = ko.virtualElements.childNodes(node);
                  for (var i = 0,
                      j = virtualChildren.length; i < j; i++)
                    ko.removeNode(virtualChildren[i]);
                }
              },
              setDomNodeChildren: function(node, childNodes) {
                if (!isStartComment(node))
                  ko.utils.setDomNodeChildren(node, childNodes);
                else {
                  ko.virtualElements.emptyNode(node);
                  var endCommentNode = node.nextSibling;
                  for (var i = 0,
                      j = childNodes.length; i < j; i++)
                    endCommentNode.parentNode.insertBefore(childNodes[i], endCommentNode);
                }
              },
              prepend: function(containerNode, nodeToPrepend) {
                if (!isStartComment(containerNode)) {
                  if (containerNode.firstChild)
                    containerNode.insertBefore(nodeToPrepend, containerNode.firstChild);
                  else
                    containerNode.appendChild(nodeToPrepend);
                } else {
                  containerNode.parentNode.insertBefore(nodeToPrepend, containerNode.nextSibling);
                }
              },
              insertAfter: function(containerNode, nodeToInsert, insertAfterNode) {
                if (!insertAfterNode) {
                  ko.virtualElements.prepend(containerNode, nodeToInsert);
                } else if (!isStartComment(containerNode)) {
                  if (insertAfterNode.nextSibling)
                    containerNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
                  else
                    containerNode.appendChild(nodeToInsert);
                } else {
                  containerNode.parentNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
                }
              },
              firstChild: function(node) {
                if (!isStartComment(node))
                  return node.firstChild;
                if (!node.nextSibling || isEndComment(node.nextSibling))
                  return null;
                return node.nextSibling;
              },
              nextSibling: function(node) {
                if (isStartComment(node))
                  node = getMatchingEndComment(node);
                if (node.nextSibling && isEndComment(node.nextSibling))
                  return null;
                return node.nextSibling;
              },
              hasBindingValue: isStartComment,
              virtualNodeBindingValue: function(node) {
                var regexMatch = (commentNodesHaveTextProperty ? node.text : node.nodeValue).match(startCommentRegex);
                return regexMatch ? regexMatch[1] : null;
              },
              normaliseVirtualElementDomStructure: function(elementVerified) {
                if (!htmlTagsWithOptionallyClosingChildren[ko.utils.tagNameLower(elementVerified)])
                  return;
                var childNode = elementVerified.firstChild;
                if (childNode) {
                  do {
                    if (childNode.nodeType === 1) {
                      var unbalancedTags = getUnbalancedChildTags(childNode);
                      if (unbalancedTags) {
                        var nodeToInsertBefore = childNode.nextSibling;
                        for (var i = 0; i < unbalancedTags.length; i++) {
                          if (nodeToInsertBefore)
                            elementVerified.insertBefore(unbalancedTags[i], nodeToInsertBefore);
                          else
                            elementVerified.appendChild(unbalancedTags[i]);
                        }
                      }
                    }
                  } while (childNode = childNode.nextSibling);
                }
              }
            };
          })();
          ko.exportSymbol('virtualElements', ko.virtualElements);
          ko.exportSymbol('virtualElements.allowedBindings', ko.virtualElements.allowedBindings);
          ko.exportSymbol('virtualElements.emptyNode', ko.virtualElements.emptyNode);
          ko.exportSymbol('virtualElements.insertAfter', ko.virtualElements.insertAfter);
          ko.exportSymbol('virtualElements.prepend', ko.virtualElements.prepend);
          ko.exportSymbol('virtualElements.setDomNodeChildren', ko.virtualElements.setDomNodeChildren);
          (function() {
            var defaultBindingAttributeName = "data-bind";
            ko.bindingProvider = function() {
              this.bindingCache = {};
            };
            ko.utils.extend(ko.bindingProvider.prototype, {
              'nodeHasBindings': function(node) {
                switch (node.nodeType) {
                  case 1:
                    return node.getAttribute(defaultBindingAttributeName) != null || ko.components['getComponentNameForNode'](node);
                  case 8:
                    return ko.virtualElements.hasBindingValue(node);
                  default:
                    return false;
                }
              },
              'getBindings': function(node, bindingContext) {
                var bindingsString = this['getBindingsString'](node, bindingContext),
                    parsedBindings = bindingsString ? this['parseBindingsString'](bindingsString, bindingContext, node) : null;
                return ko.components.addBindingsForCustomElement(parsedBindings, node, bindingContext, false);
              },
              'getBindingAccessors': function(node, bindingContext) {
                var bindingsString = this['getBindingsString'](node, bindingContext),
                    parsedBindings = bindingsString ? this['parseBindingsString'](bindingsString, bindingContext, node, {'valueAccessors': true}) : null;
                return ko.components.addBindingsForCustomElement(parsedBindings, node, bindingContext, true);
              },
              'getBindingsString': function(node, bindingContext) {
                switch (node.nodeType) {
                  case 1:
                    return node.getAttribute(defaultBindingAttributeName);
                  case 8:
                    return ko.virtualElements.virtualNodeBindingValue(node);
                  default:
                    return null;
                }
              },
              'parseBindingsString': function(bindingsString, bindingContext, node, options) {
                try {
                  var bindingFunction = createBindingsStringEvaluatorViaCache(bindingsString, this.bindingCache, options);
                  return bindingFunction(bindingContext, node);
                } catch (ex) {
                  ex.message = "Unable to parse bindings.\nBindings value: " + bindingsString + "\nMessage: " + ex.message;
                  throw ex;
                }
              }
            });
            ko.bindingProvider['instance'] = new ko.bindingProvider();
            function createBindingsStringEvaluatorViaCache(bindingsString, cache, options) {
              var cacheKey = bindingsString + (options && options['valueAccessors'] || '');
              return cache[cacheKey] || (cache[cacheKey] = createBindingsStringEvaluator(bindingsString, options));
            }
            function createBindingsStringEvaluator(bindingsString, options) {
              var rewrittenBindings = ko.expressionRewriting.preProcessBindings(bindingsString, options),
                  functionBody = "with($context){with($data||{}){return{" + rewrittenBindings + "}}}";
              return new Function("$context", "$element", functionBody);
            }
          })();
          ko.exportSymbol('bindingProvider', ko.bindingProvider);
          (function() {
            ko.bindingHandlers = {};
            var bindingDoesNotRecurseIntoElementTypes = {'script': true};
            ko['getBindingHandler'] = function(bindingKey) {
              return ko.bindingHandlers[bindingKey];
            };
            ko.bindingContext = function(dataItemOrAccessor, parentContext, dataItemAlias, extendCallback) {
              function updateContext() {
                var dataItemOrObservable = isFunc ? dataItemOrAccessor() : dataItemOrAccessor,
                    dataItem = ko.utils.unwrapObservable(dataItemOrObservable);
                if (parentContext) {
                  if (parentContext._subscribable)
                    parentContext._subscribable();
                  ko.utils.extend(self, parentContext);
                  if (subscribable) {
                    self._subscribable = subscribable;
                  }
                } else {
                  self['$parents'] = [];
                  self['$root'] = dataItem;
                  self['ko'] = ko;
                }
                self['$rawData'] = dataItemOrObservable;
                self['$data'] = dataItem;
                if (dataItemAlias)
                  self[dataItemAlias] = dataItem;
                if (extendCallback)
                  extendCallback(self, parentContext, dataItem);
                return self['$data'];
              }
              function disposeWhen() {
                return nodes && !ko.utils.anyDomNodeIsAttachedToDocument(nodes);
              }
              var self = this,
                  isFunc = typeof(dataItemOrAccessor) == "function" && !ko.isObservable(dataItemOrAccessor),
                  nodes,
                  subscribable = ko.dependentObservable(updateContext, null, {
                    disposeWhen: disposeWhen,
                    disposeWhenNodeIsRemoved: true
                  });
              if (subscribable.isActive()) {
                self._subscribable = subscribable;
                subscribable['equalityComparer'] = null;
                nodes = [];
                subscribable._addNode = function(node) {
                  nodes.push(node);
                  ko.utils.domNodeDisposal.addDisposeCallback(node, function(node) {
                    ko.utils.arrayRemoveItem(nodes, node);
                    if (!nodes.length) {
                      subscribable.dispose();
                      self._subscribable = subscribable = undefined;
                    }
                  });
                };
              }
            };
            ko.bindingContext.prototype['createChildContext'] = function(dataItemOrAccessor, dataItemAlias, extendCallback) {
              return new ko.bindingContext(dataItemOrAccessor, this, dataItemAlias, function(self, parentContext) {
                self['$parentContext'] = parentContext;
                self['$parent'] = parentContext['$data'];
                self['$parents'] = (parentContext['$parents'] || []).slice(0);
                self['$parents'].unshift(self['$parent']);
                if (extendCallback)
                  extendCallback(self);
              });
            };
            ko.bindingContext.prototype['extend'] = function(properties) {
              return new ko.bindingContext(this._subscribable || this['$data'], this, null, function(self, parentContext) {
                self['$rawData'] = parentContext['$rawData'];
                ko.utils.extend(self, typeof(properties) == "function" ? properties() : properties);
              });
            };
            function makeValueAccessor(value) {
              return function() {
                return value;
              };
            }
            function evaluateValueAccessor(valueAccessor) {
              return valueAccessor();
            }
            function makeAccessorsFromFunction(callback) {
              return ko.utils.objectMap(ko.dependencyDetection.ignore(callback), function(value, key) {
                return function() {
                  return callback()[key];
                };
              });
            }
            function makeBindingAccessors(bindings, context, node) {
              if (typeof bindings === 'function') {
                return makeAccessorsFromFunction(bindings.bind(null, context, node));
              } else {
                return ko.utils.objectMap(bindings, makeValueAccessor);
              }
            }
            function getBindingsAndMakeAccessors(node, context) {
              return makeAccessorsFromFunction(this['getBindings'].bind(this, node, context));
            }
            function validateThatBindingIsAllowedForVirtualElements(bindingName) {
              var validator = ko.virtualElements.allowedBindings[bindingName];
              if (!validator)
                throw new Error("The binding '" + bindingName + "' cannot be used with virtual elements");
            }
            function applyBindingsToDescendantsInternal(bindingContext, elementOrVirtualElement, bindingContextsMayDifferFromDomParentElement) {
              var currentChild,
                  nextInQueue = ko.virtualElements.firstChild(elementOrVirtualElement),
                  provider = ko.bindingProvider['instance'],
                  preprocessNode = provider['preprocessNode'];
              if (preprocessNode) {
                while (currentChild = nextInQueue) {
                  nextInQueue = ko.virtualElements.nextSibling(currentChild);
                  preprocessNode.call(provider, currentChild);
                }
                nextInQueue = ko.virtualElements.firstChild(elementOrVirtualElement);
              }
              while (currentChild = nextInQueue) {
                nextInQueue = ko.virtualElements.nextSibling(currentChild);
                applyBindingsToNodeAndDescendantsInternal(bindingContext, currentChild, bindingContextsMayDifferFromDomParentElement);
              }
            }
            function applyBindingsToNodeAndDescendantsInternal(bindingContext, nodeVerified, bindingContextMayDifferFromDomParentElement) {
              var shouldBindDescendants = true;
              var isElement = (nodeVerified.nodeType === 1);
              if (isElement)
                ko.virtualElements.normaliseVirtualElementDomStructure(nodeVerified);
              var shouldApplyBindings = (isElement && bindingContextMayDifferFromDomParentElement) || ko.bindingProvider['instance']['nodeHasBindings'](nodeVerified);
              if (shouldApplyBindings)
                shouldBindDescendants = applyBindingsToNodeInternal(nodeVerified, null, bindingContext, bindingContextMayDifferFromDomParentElement)['shouldBindDescendants'];
              if (shouldBindDescendants && !bindingDoesNotRecurseIntoElementTypes[ko.utils.tagNameLower(nodeVerified)]) {
                applyBindingsToDescendantsInternal(bindingContext, nodeVerified, !isElement);
              }
            }
            var boundElementDomDataKey = ko.utils.domData.nextKey();
            function topologicalSortBindings(bindings) {
              var result = [],
                  bindingsConsidered = {},
                  cyclicDependencyStack = [];
              ko.utils.objectForEach(bindings, function pushBinding(bindingKey) {
                if (!bindingsConsidered[bindingKey]) {
                  var binding = ko['getBindingHandler'](bindingKey);
                  if (binding) {
                    if (binding['after']) {
                      cyclicDependencyStack.push(bindingKey);
                      ko.utils.arrayForEach(binding['after'], function(bindingDependencyKey) {
                        if (bindings[bindingDependencyKey]) {
                          if (ko.utils.arrayIndexOf(cyclicDependencyStack, bindingDependencyKey) !== -1) {
                            throw Error("Cannot combine the following bindings, because they have a cyclic dependency: " + cyclicDependencyStack.join(", "));
                          } else {
                            pushBinding(bindingDependencyKey);
                          }
                        }
                      });
                      cyclicDependencyStack.length--;
                    }
                    result.push({
                      key: bindingKey,
                      handler: binding
                    });
                  }
                  bindingsConsidered[bindingKey] = true;
                }
              });
              return result;
            }
            function applyBindingsToNodeInternal(node, sourceBindings, bindingContext, bindingContextMayDifferFromDomParentElement) {
              var alreadyBound = ko.utils.domData.get(node, boundElementDomDataKey);
              if (!sourceBindings) {
                if (alreadyBound) {
                  throw Error("You cannot apply bindings multiple times to the same element.");
                }
                ko.utils.domData.set(node, boundElementDomDataKey, true);
              }
              if (!alreadyBound && bindingContextMayDifferFromDomParentElement)
                ko.storedBindingContextForNode(node, bindingContext);
              var bindings;
              if (sourceBindings && typeof sourceBindings !== 'function') {
                bindings = sourceBindings;
              } else {
                var provider = ko.bindingProvider['instance'],
                    getBindings = provider['getBindingAccessors'] || getBindingsAndMakeAccessors;
                var bindingsUpdater = ko.dependentObservable(function() {
                  bindings = sourceBindings ? sourceBindings(bindingContext, node) : getBindings.call(provider, node, bindingContext);
                  if (bindings && bindingContext._subscribable)
                    bindingContext._subscribable();
                  return bindings;
                }, null, {disposeWhenNodeIsRemoved: node});
                if (!bindings || !bindingsUpdater.isActive())
                  bindingsUpdater = null;
              }
              var bindingHandlerThatControlsDescendantBindings;
              if (bindings) {
                var getValueAccessor = bindingsUpdater ? function(bindingKey) {
                  return function() {
                    return evaluateValueAccessor(bindingsUpdater()[bindingKey]);
                  };
                } : function(bindingKey) {
                  return bindings[bindingKey];
                };
                function allBindings() {
                  return ko.utils.objectMap(bindingsUpdater ? bindingsUpdater() : bindings, evaluateValueAccessor);
                }
                allBindings['get'] = function(key) {
                  return bindings[key] && evaluateValueAccessor(getValueAccessor(key));
                };
                allBindings['has'] = function(key) {
                  return key in bindings;
                };
                var orderedBindings = topologicalSortBindings(bindings);
                ko.utils.arrayForEach(orderedBindings, function(bindingKeyAndHandler) {
                  var handlerInitFn = bindingKeyAndHandler.handler["init"],
                      handlerUpdateFn = bindingKeyAndHandler.handler["update"],
                      bindingKey = bindingKeyAndHandler.key;
                  if (node.nodeType === 8) {
                    validateThatBindingIsAllowedForVirtualElements(bindingKey);
                  }
                  try {
                    if (typeof handlerInitFn == "function") {
                      ko.dependencyDetection.ignore(function() {
                        var initResult = handlerInitFn(node, getValueAccessor(bindingKey), allBindings, bindingContext['$data'], bindingContext);
                        if (initResult && initResult['controlsDescendantBindings']) {
                          if (bindingHandlerThatControlsDescendantBindings !== undefined)
                            throw new Error("Multiple bindings (" + bindingHandlerThatControlsDescendantBindings + " and " + bindingKey + ") are trying to control descendant bindings of the same element. You cannot use these bindings together on the same element.");
                          bindingHandlerThatControlsDescendantBindings = bindingKey;
                        }
                      });
                    }
                    if (typeof handlerUpdateFn == "function") {
                      ko.dependentObservable(function() {
                        handlerUpdateFn(node, getValueAccessor(bindingKey), allBindings, bindingContext['$data'], bindingContext);
                      }, null, {disposeWhenNodeIsRemoved: node});
                    }
                  } catch (ex) {
                    ex.message = "Unable to process binding \"" + bindingKey + ": " + bindings[bindingKey] + "\"\nMessage: " + ex.message;
                    throw ex;
                  }
                });
              }
              return {'shouldBindDescendants': bindingHandlerThatControlsDescendantBindings === undefined};
            }
            ;
            var storedBindingContextDomDataKey = ko.utils.domData.nextKey();
            ko.storedBindingContextForNode = function(node, bindingContext) {
              if (arguments.length == 2) {
                ko.utils.domData.set(node, storedBindingContextDomDataKey, bindingContext);
                if (bindingContext._subscribable)
                  bindingContext._subscribable._addNode(node);
              } else {
                return ko.utils.domData.get(node, storedBindingContextDomDataKey);
              }
            };
            function getBindingContext(viewModelOrBindingContext) {
              return viewModelOrBindingContext && (viewModelOrBindingContext instanceof ko.bindingContext) ? viewModelOrBindingContext : new ko.bindingContext(viewModelOrBindingContext);
            }
            ko.applyBindingAccessorsToNode = function(node, bindings, viewModelOrBindingContext) {
              if (node.nodeType === 1)
                ko.virtualElements.normaliseVirtualElementDomStructure(node);
              return applyBindingsToNodeInternal(node, bindings, getBindingContext(viewModelOrBindingContext), true);
            };
            ko.applyBindingsToNode = function(node, bindings, viewModelOrBindingContext) {
              var context = getBindingContext(viewModelOrBindingContext);
              return ko.applyBindingAccessorsToNode(node, makeBindingAccessors(bindings, context, node), context);
            };
            ko.applyBindingsToDescendants = function(viewModelOrBindingContext, rootNode) {
              if (rootNode.nodeType === 1 || rootNode.nodeType === 8)
                applyBindingsToDescendantsInternal(getBindingContext(viewModelOrBindingContext), rootNode, true);
            };
            ko.applyBindings = function(viewModelOrBindingContext, rootNode) {
              if (!jQueryInstance && window['jQuery']) {
                jQueryInstance = window['jQuery'];
              }
              if (rootNode && (rootNode.nodeType !== 1) && (rootNode.nodeType !== 8))
                throw new Error("ko.applyBindings: first parameter should be your view model; second parameter should be a DOM node");
              rootNode = rootNode || window.document.body;
              applyBindingsToNodeAndDescendantsInternal(getBindingContext(viewModelOrBindingContext), rootNode, true);
            };
            ko.contextFor = function(node) {
              switch (node.nodeType) {
                case 1:
                case 8:
                  var context = ko.storedBindingContextForNode(node);
                  if (context)
                    return context;
                  if (node.parentNode)
                    return ko.contextFor(node.parentNode);
                  break;
              }
              return undefined;
            };
            ko.dataFor = function(node) {
              var context = ko.contextFor(node);
              return context ? context['$data'] : undefined;
            };
            ko.exportSymbol('bindingHandlers', ko.bindingHandlers);
            ko.exportSymbol('applyBindings', ko.applyBindings);
            ko.exportSymbol('applyBindingsToDescendants', ko.applyBindingsToDescendants);
            ko.exportSymbol('applyBindingAccessorsToNode', ko.applyBindingAccessorsToNode);
            ko.exportSymbol('applyBindingsToNode', ko.applyBindingsToNode);
            ko.exportSymbol('contextFor', ko.contextFor);
            ko.exportSymbol('dataFor', ko.dataFor);
          })();
          (function(undefined) {
            var loadingSubscribablesCache = {},
                loadedDefinitionsCache = {};
            ko.components = {
              get: function(componentName, callback) {
                var cachedDefinition = getObjectOwnProperty(loadedDefinitionsCache, componentName);
                if (cachedDefinition) {
                  setTimeout(function() {
                    callback(cachedDefinition);
                  }, 0);
                } else {
                  loadComponentAndNotify(componentName, callback);
                }
              },
              clearCachedDefinition: function(componentName) {
                delete loadedDefinitionsCache[componentName];
              },
              _getFirstResultFromLoaders: getFirstResultFromLoaders
            };
            function getObjectOwnProperty(obj, propName) {
              return obj.hasOwnProperty(propName) ? obj[propName] : undefined;
            }
            function loadComponentAndNotify(componentName, callback) {
              var subscribable = getObjectOwnProperty(loadingSubscribablesCache, componentName),
                  completedAsync;
              if (!subscribable) {
                subscribable = loadingSubscribablesCache[componentName] = new ko.subscribable();
                beginLoadingComponent(componentName, function(definition) {
                  loadedDefinitionsCache[componentName] = definition;
                  delete loadingSubscribablesCache[componentName];
                  if (completedAsync) {
                    subscribable['notifySubscribers'](definition);
                  } else {
                    setTimeout(function() {
                      subscribable['notifySubscribers'](definition);
                    }, 0);
                  }
                });
                completedAsync = true;
              }
              subscribable.subscribe(callback);
            }
            function beginLoadingComponent(componentName, callback) {
              getFirstResultFromLoaders('getConfig', [componentName], function(config) {
                if (config) {
                  getFirstResultFromLoaders('loadComponent', [componentName, config], function(definition) {
                    callback(definition);
                  });
                } else {
                  callback(null);
                }
              });
            }
            function getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders) {
              if (!candidateLoaders) {
                candidateLoaders = ko.components['loaders'].slice(0);
              }
              var currentCandidateLoader = candidateLoaders.shift();
              if (currentCandidateLoader) {
                var methodInstance = currentCandidateLoader[methodName];
                if (methodInstance) {
                  var wasAborted = false,
                      synchronousReturnValue = methodInstance.apply(currentCandidateLoader, argsExceptCallback.concat(function(result) {
                        if (wasAborted) {
                          callback(null);
                        } else if (result !== null) {
                          callback(result);
                        } else {
                          getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders);
                        }
                      }));
                  if (synchronousReturnValue !== undefined) {
                    wasAborted = true;
                    if (!currentCandidateLoader['suppressLoaderExceptions']) {
                      throw new Error('Component loaders must supply values by invoking the callback, not by returning values synchronously.');
                    }
                  }
                } else {
                  getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders);
                }
              } else {
                callback(null);
              }
            }
            ko.components['loaders'] = [];
            ko.exportSymbol('components', ko.components);
            ko.exportSymbol('components.get', ko.components.get);
            ko.exportSymbol('components.clearCachedDefinition', ko.components.clearCachedDefinition);
          })();
          (function(undefined) {
            var defaultConfigRegistry = {};
            ko.components.register = function(componentName, config) {
              if (!config) {
                throw new Error('Invalid configuration for ' + componentName);
              }
              if (ko.components.isRegistered(componentName)) {
                throw new Error('Component ' + componentName + ' is already registered');
              }
              defaultConfigRegistry[componentName] = config;
            };
            ko.components.isRegistered = function(componentName) {
              return componentName in defaultConfigRegistry;
            };
            ko.components.unregister = function(componentName) {
              delete defaultConfigRegistry[componentName];
              ko.components.clearCachedDefinition(componentName);
            };
            ko.components.defaultLoader = {
              'getConfig': function(componentName, callback) {
                var result = defaultConfigRegistry.hasOwnProperty(componentName) ? defaultConfigRegistry[componentName] : null;
                callback(result);
              },
              'loadComponent': function(componentName, config, callback) {
                var errorCallback = makeErrorCallback(componentName);
                possiblyGetConfigFromAmd(errorCallback, config, function(loadedConfig) {
                  resolveConfig(componentName, errorCallback, loadedConfig, callback);
                });
              },
              'loadTemplate': function(componentName, templateConfig, callback) {
                resolveTemplate(makeErrorCallback(componentName), templateConfig, callback);
              },
              'loadViewModel': function(componentName, viewModelConfig, callback) {
                resolveViewModel(makeErrorCallback(componentName), viewModelConfig, callback);
              }
            };
            var createViewModelKey = 'createViewModel';
            function resolveConfig(componentName, errorCallback, config, callback) {
              var result = {},
                  makeCallBackWhenZero = 2,
                  tryIssueCallback = function() {
                    if (--makeCallBackWhenZero === 0) {
                      callback(result);
                    }
                  },
                  templateConfig = config['template'],
                  viewModelConfig = config['viewModel'];
              if (templateConfig) {
                possiblyGetConfigFromAmd(errorCallback, templateConfig, function(loadedConfig) {
                  ko.components._getFirstResultFromLoaders('loadTemplate', [componentName, loadedConfig], function(resolvedTemplate) {
                    result['template'] = resolvedTemplate;
                    tryIssueCallback();
                  });
                });
              } else {
                tryIssueCallback();
              }
              if (viewModelConfig) {
                possiblyGetConfigFromAmd(errorCallback, viewModelConfig, function(loadedConfig) {
                  ko.components._getFirstResultFromLoaders('loadViewModel', [componentName, loadedConfig], function(resolvedViewModel) {
                    result[createViewModelKey] = resolvedViewModel;
                    tryIssueCallback();
                  });
                });
              } else {
                tryIssueCallback();
              }
            }
            function resolveTemplate(errorCallback, templateConfig, callback) {
              if (typeof templateConfig === 'string') {
                callback(ko.utils.parseHtmlFragment(templateConfig));
              } else if (templateConfig instanceof Array) {
                callback(templateConfig);
              } else if (isDocumentFragment(templateConfig)) {
                callback(ko.utils.makeArray(templateConfig.childNodes));
              } else if (templateConfig['element']) {
                var element = templateConfig['element'];
                if (isDomElement(element)) {
                  callback(cloneNodesFromTemplateSourceElement(element));
                } else if (typeof element === 'string') {
                  var elemInstance = document.getElementById(element);
                  if (elemInstance) {
                    callback(cloneNodesFromTemplateSourceElement(elemInstance));
                  } else {
                    errorCallback('Cannot find element with ID ' + element);
                  }
                } else {
                  errorCallback('Unknown element type: ' + element);
                }
              } else {
                errorCallback('Unknown template value: ' + templateConfig);
              }
            }
            function resolveViewModel(errorCallback, viewModelConfig, callback) {
              if (typeof viewModelConfig === 'function') {
                callback(function(params) {
                  return new viewModelConfig(params);
                });
              } else if (typeof viewModelConfig[createViewModelKey] === 'function') {
                callback(viewModelConfig[createViewModelKey]);
              } else if ('instance' in viewModelConfig) {
                var fixedInstance = viewModelConfig['instance'];
                callback(function(params, componentInfo) {
                  return fixedInstance;
                });
              } else if ('viewModel' in viewModelConfig) {
                resolveViewModel(errorCallback, viewModelConfig['viewModel'], callback);
              } else {
                errorCallback('Unknown viewModel value: ' + viewModelConfig);
              }
            }
            function cloneNodesFromTemplateSourceElement(elemInstance) {
              switch (ko.utils.tagNameLower(elemInstance)) {
                case 'script':
                  return ko.utils.parseHtmlFragment(elemInstance.text);
                case 'textarea':
                  return ko.utils.parseHtmlFragment(elemInstance.value);
                case 'template':
                  if (isDocumentFragment(elemInstance.content)) {
                    return ko.utils.cloneNodes(elemInstance.content.childNodes);
                  }
              }
              return ko.utils.cloneNodes(elemInstance.childNodes);
            }
            function isDomElement(obj) {
              if (window['HTMLElement']) {
                return obj instanceof HTMLElement;
              } else {
                return obj && obj.tagName && obj.nodeType === 1;
              }
            }
            function isDocumentFragment(obj) {
              if (window['DocumentFragment']) {
                return obj instanceof DocumentFragment;
              } else {
                return obj && obj.nodeType === 11;
              }
            }
            function possiblyGetConfigFromAmd(errorCallback, config, callback) {
              if (typeof config['require'] === 'string') {
                if (require || window['require']) {
                  (require || window['require'])([config['require']], callback);
                } else {
                  errorCallback('Uses require, but no AMD loader is present');
                }
              } else {
                callback(config);
              }
            }
            function makeErrorCallback(componentName) {
              return function(message) {
                throw new Error('Component \'' + componentName + '\': ' + message);
              };
            }
            ko.exportSymbol('components.register', ko.components.register);
            ko.exportSymbol('components.isRegistered', ko.components.isRegistered);
            ko.exportSymbol('components.unregister', ko.components.unregister);
            ko.exportSymbol('components.defaultLoader', ko.components.defaultLoader);
            ko.components['loaders'].push(ko.components.defaultLoader);
            ko.components._allRegisteredComponents = defaultConfigRegistry;
          })();
          (function(undefined) {
            ko.components['getComponentNameForNode'] = function(node) {
              var tagNameLower = ko.utils.tagNameLower(node);
              return ko.components.isRegistered(tagNameLower) && tagNameLower;
            };
            ko.components.addBindingsForCustomElement = function(allBindings, node, bindingContext, valueAccessors) {
              if (node.nodeType === 1) {
                var componentName = ko.components['getComponentNameForNode'](node);
                if (componentName) {
                  allBindings = allBindings || {};
                  if (allBindings['component']) {
                    throw new Error('Cannot use the "component" binding on a custom element matching a component');
                  }
                  var componentBindingValue = {
                    'name': componentName,
                    'params': getComponentParamsFromCustomElement(node, bindingContext)
                  };
                  allBindings['component'] = valueAccessors ? function() {
                    return componentBindingValue;
                  } : componentBindingValue;
                }
              }
              return allBindings;
            };
            var nativeBindingProviderInstance = new ko.bindingProvider();
            function getComponentParamsFromCustomElement(elem, bindingContext) {
              var paramsAttribute = elem.getAttribute('params');
              if (paramsAttribute) {
                var params = nativeBindingProviderInstance['parseBindingsString'](paramsAttribute, bindingContext, elem, {
                  'valueAccessors': true,
                  'bindingParams': true
                }),
                    rawParamComputedValues = ko.utils.objectMap(params, function(paramValue, paramName) {
                      return ko.computed(paramValue, null, {disposeWhenNodeIsRemoved: elem});
                    }),
                    result = ko.utils.objectMap(rawParamComputedValues, function(paramValueComputed, paramName) {
                      if (!paramValueComputed.isActive()) {
                        return paramValueComputed.peek();
                      } else {
                        return ko.computed(function() {
                          return ko.utils.unwrapObservable(paramValueComputed());
                        }, null, {disposeWhenNodeIsRemoved: elem});
                      }
                    });
                if (!result.hasOwnProperty('$raw')) {
                  result['$raw'] = rawParamComputedValues;
                }
                return result;
              } else {
                return {'$raw': {}};
              }
            }
            if (ko.utils.ieVersion < 9) {
              ko.components['register'] = (function(originalFunction) {
                return function(componentName) {
                  document.createElement(componentName);
                  return originalFunction.apply(this, arguments);
                };
              })(ko.components['register']);
              document.createDocumentFragment = (function(originalFunction) {
                return function() {
                  var newDocFrag = originalFunction(),
                      allComponents = ko.components._allRegisteredComponents;
                  for (var componentName in allComponents) {
                    if (allComponents.hasOwnProperty(componentName)) {
                      newDocFrag.createElement(componentName);
                    }
                  }
                  return newDocFrag;
                };
              })(document.createDocumentFragment);
            }
          })();
          (function(undefined) {
            var componentLoadingOperationUniqueId = 0;
            ko.bindingHandlers['component'] = {'init': function(element, valueAccessor, ignored1, ignored2, bindingContext) {
                var currentViewModel,
                    currentLoadingOperationId,
                    disposeAssociatedComponentViewModel = function() {
                      var currentViewModelDispose = currentViewModel && currentViewModel['dispose'];
                      if (typeof currentViewModelDispose === 'function') {
                        currentViewModelDispose.call(currentViewModel);
                      }
                      currentLoadingOperationId = null;
                    };
                ko.utils.domNodeDisposal.addDisposeCallback(element, disposeAssociatedComponentViewModel);
                ko.computed(function() {
                  var value = ko.utils.unwrapObservable(valueAccessor()),
                      componentName,
                      componentParams;
                  if (typeof value === 'string') {
                    componentName = value;
                  } else {
                    componentName = ko.utils.unwrapObservable(value['name']);
                    componentParams = ko.utils.unwrapObservable(value['params']);
                  }
                  if (!componentName) {
                    throw new Error('No component name specified');
                  }
                  var loadingOperationId = currentLoadingOperationId = ++componentLoadingOperationUniqueId;
                  ko.components.get(componentName, function(componentDefinition) {
                    if (currentLoadingOperationId !== loadingOperationId) {
                      return;
                    }
                    disposeAssociatedComponentViewModel();
                    if (!componentDefinition) {
                      throw new Error('Unknown component \'' + componentName + '\'');
                    }
                    cloneTemplateIntoElement(componentName, componentDefinition, element);
                    var componentViewModel = createViewModel(componentDefinition, element, componentParams),
                        childBindingContext = bindingContext['createChildContext'](componentViewModel);
                    currentViewModel = componentViewModel;
                    ko.applyBindingsToDescendants(childBindingContext, element);
                  });
                }, null, {disposeWhenNodeIsRemoved: element});
                return {'controlsDescendantBindings': true};
              }};
            ko.virtualElements.allowedBindings['component'] = true;
            function cloneTemplateIntoElement(componentName, componentDefinition, element) {
              var template = componentDefinition['template'];
              if (!template) {
                throw new Error('Component \'' + componentName + '\' has no template');
              }
              var clonedNodesArray = ko.utils.cloneNodes(template);
              ko.virtualElements.setDomNodeChildren(element, clonedNodesArray);
            }
            function createViewModel(componentDefinition, element, componentParams) {
              var componentViewModelFactory = componentDefinition['createViewModel'];
              return componentViewModelFactory ? componentViewModelFactory.call(componentDefinition, componentParams, {element: element}) : componentParams;
            }
          })();
          var attrHtmlToJavascriptMap = {
            'class': 'className',
            'for': 'htmlFor'
          };
          ko.bindingHandlers['attr'] = {'update': function(element, valueAccessor, allBindings) {
              var value = ko.utils.unwrapObservable(valueAccessor()) || {};
              ko.utils.objectForEach(value, function(attrName, attrValue) {
                attrValue = ko.utils.unwrapObservable(attrValue);
                var toRemove = (attrValue === false) || (attrValue === null) || (attrValue === undefined);
                if (toRemove)
                  element.removeAttribute(attrName);
                if (ko.utils.ieVersion <= 8 && attrName in attrHtmlToJavascriptMap) {
                  attrName = attrHtmlToJavascriptMap[attrName];
                  if (toRemove)
                    element.removeAttribute(attrName);
                  else
                    element[attrName] = attrValue;
                } else if (!toRemove) {
                  element.setAttribute(attrName, attrValue.toString());
                }
                if (attrName === "name") {
                  ko.utils.setElementName(element, toRemove ? "" : attrValue.toString());
                }
              });
            }};
          (function() {
            ko.bindingHandlers['checked'] = {
              'after': ['value', 'attr'],
              'init': function(element, valueAccessor, allBindings) {
                var checkedValue = ko.pureComputed(function() {
                  if (allBindings['has']('checkedValue')) {
                    return ko.utils.unwrapObservable(allBindings.get('checkedValue'));
                  } else if (allBindings['has']('value')) {
                    return ko.utils.unwrapObservable(allBindings.get('value'));
                  }
                  return element.value;
                });
                function updateModel() {
                  var isChecked = element.checked,
                      elemValue = useCheckedValue ? checkedValue() : isChecked;
                  if (ko.computedContext.isInitial()) {
                    return;
                  }
                  if (isRadio && !isChecked) {
                    return;
                  }
                  var modelValue = ko.dependencyDetection.ignore(valueAccessor);
                  if (isValueArray) {
                    if (oldElemValue !== elemValue) {
                      if (isChecked) {
                        ko.utils.addOrRemoveItem(modelValue, elemValue, true);
                        ko.utils.addOrRemoveItem(modelValue, oldElemValue, false);
                      }
                      oldElemValue = elemValue;
                    } else {
                      ko.utils.addOrRemoveItem(modelValue, elemValue, isChecked);
                    }
                  } else {
                    ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'checked', elemValue, true);
                  }
                }
                ;
                function updateView() {
                  var modelValue = ko.utils.unwrapObservable(valueAccessor());
                  if (isValueArray) {
                    element.checked = ko.utils.arrayIndexOf(modelValue, checkedValue()) >= 0;
                  } else if (isCheckbox) {
                    element.checked = modelValue;
                  } else {
                    element.checked = (checkedValue() === modelValue);
                  }
                }
                ;
                var isCheckbox = element.type == "checkbox",
                    isRadio = element.type == "radio";
                if (!isCheckbox && !isRadio) {
                  return;
                }
                var isValueArray = isCheckbox && (ko.utils.unwrapObservable(valueAccessor()) instanceof Array),
                    oldElemValue = isValueArray ? checkedValue() : undefined,
                    useCheckedValue = isRadio || isValueArray;
                if (isRadio && !element.name)
                  ko.bindingHandlers['uniqueName']['init'](element, function() {
                    return true;
                  });
                ko.computed(updateModel, null, {disposeWhenNodeIsRemoved: element});
                ko.utils.registerEventHandler(element, "click", updateModel);
                ko.computed(updateView, null, {disposeWhenNodeIsRemoved: element});
              }
            };
            ko.expressionRewriting.twoWayBindings['checked'] = true;
            ko.bindingHandlers['checkedValue'] = {'update': function(element, valueAccessor) {
                element.value = ko.utils.unwrapObservable(valueAccessor());
              }};
          })();
          var classesWrittenByBindingKey = '__ko__cssValue';
          ko.bindingHandlers['css'] = {'update': function(element, valueAccessor) {
              var value = ko.utils.unwrapObservable(valueAccessor());
              if (typeof value == "object") {
                ko.utils.objectForEach(value, function(className, shouldHaveClass) {
                  shouldHaveClass = ko.utils.unwrapObservable(shouldHaveClass);
                  ko.utils.toggleDomNodeCssClass(element, className, shouldHaveClass);
                });
              } else {
                value = String(value || '');
                ko.utils.toggleDomNodeCssClass(element, element[classesWrittenByBindingKey], false);
                element[classesWrittenByBindingKey] = value;
                ko.utils.toggleDomNodeCssClass(element, value, true);
              }
            }};
          ko.bindingHandlers['enable'] = {'update': function(element, valueAccessor) {
              var value = ko.utils.unwrapObservable(valueAccessor());
              if (value && element.disabled)
                element.removeAttribute("disabled");
              else if ((!value) && (!element.disabled))
                element.disabled = true;
            }};
          ko.bindingHandlers['disable'] = {'update': function(element, valueAccessor) {
              ko.bindingHandlers['enable']['update'](element, function() {
                return !ko.utils.unwrapObservable(valueAccessor());
              });
            }};
          function makeEventHandlerShortcut(eventName) {
            ko.bindingHandlers[eventName] = {'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                var newValueAccessor = function() {
                  var result = {};
                  result[eventName] = valueAccessor();
                  return result;
                };
                return ko.bindingHandlers['event']['init'].call(this, element, newValueAccessor, allBindings, viewModel, bindingContext);
              }};
          }
          ko.bindingHandlers['event'] = {'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
              var eventsToHandle = valueAccessor() || {};
              ko.utils.objectForEach(eventsToHandle, function(eventName) {
                if (typeof eventName == "string") {
                  ko.utils.registerEventHandler(element, eventName, function(event) {
                    var handlerReturnValue;
                    var handlerFunction = valueAccessor()[eventName];
                    if (!handlerFunction)
                      return;
                    try {
                      var argsForHandler = ko.utils.makeArray(arguments);
                      viewModel = bindingContext['$data'];
                      argsForHandler.unshift(viewModel);
                      handlerReturnValue = handlerFunction.apply(viewModel, argsForHandler);
                    } finally {
                      if (handlerReturnValue !== true) {
                        if (event.preventDefault)
                          event.preventDefault();
                        else
                          event.returnValue = false;
                      }
                    }
                    var bubble = allBindings.get(eventName + 'Bubble') !== false;
                    if (!bubble) {
                      event.cancelBubble = true;
                      if (event.stopPropagation)
                        event.stopPropagation();
                    }
                  });
                }
              });
            }};
          ko.bindingHandlers['foreach'] = {
            makeTemplateValueAccessor: function(valueAccessor) {
              return function() {
                var modelValue = valueAccessor(),
                    unwrappedValue = ko.utils.peekObservable(modelValue);
                if ((!unwrappedValue) || typeof unwrappedValue.length == "number")
                  return {
                    'foreach': modelValue,
                    'templateEngine': ko.nativeTemplateEngine.instance
                  };
                ko.utils.unwrapObservable(modelValue);
                return {
                  'foreach': unwrappedValue['data'],
                  'as': unwrappedValue['as'],
                  'includeDestroyed': unwrappedValue['includeDestroyed'],
                  'afterAdd': unwrappedValue['afterAdd'],
                  'beforeRemove': unwrappedValue['beforeRemove'],
                  'afterRender': unwrappedValue['afterRender'],
                  'beforeMove': unwrappedValue['beforeMove'],
                  'afterMove': unwrappedValue['afterMove'],
                  'templateEngine': ko.nativeTemplateEngine.instance
                };
              };
            },
            'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
              return ko.bindingHandlers['template']['init'](element, ko.bindingHandlers['foreach'].makeTemplateValueAccessor(valueAccessor));
            },
            'update': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
              return ko.bindingHandlers['template']['update'](element, ko.bindingHandlers['foreach'].makeTemplateValueAccessor(valueAccessor), allBindings, viewModel, bindingContext);
            }
          };
          ko.expressionRewriting.bindingRewriteValidators['foreach'] = false;
          ko.virtualElements.allowedBindings['foreach'] = true;
          var hasfocusUpdatingProperty = '__ko_hasfocusUpdating';
          var hasfocusLastValue = '__ko_hasfocusLastValue';
          ko.bindingHandlers['hasfocus'] = {
            'init': function(element, valueAccessor, allBindings) {
              var handleElementFocusChange = function(isFocused) {
                element[hasfocusUpdatingProperty] = true;
                var ownerDoc = element.ownerDocument;
                if ("activeElement" in ownerDoc) {
                  var active;
                  try {
                    active = ownerDoc.activeElement;
                  } catch (e) {
                    active = ownerDoc.body;
                  }
                  isFocused = (active === element);
                }
                var modelValue = valueAccessor();
                ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'hasfocus', isFocused, true);
                element[hasfocusLastValue] = isFocused;
                element[hasfocusUpdatingProperty] = false;
              };
              var handleElementFocusIn = handleElementFocusChange.bind(null, true);
              var handleElementFocusOut = handleElementFocusChange.bind(null, false);
              ko.utils.registerEventHandler(element, "focus", handleElementFocusIn);
              ko.utils.registerEventHandler(element, "focusin", handleElementFocusIn);
              ko.utils.registerEventHandler(element, "blur", handleElementFocusOut);
              ko.utils.registerEventHandler(element, "focusout", handleElementFocusOut);
            },
            'update': function(element, valueAccessor) {
              var value = !!ko.utils.unwrapObservable(valueAccessor());
              if (!element[hasfocusUpdatingProperty] && element[hasfocusLastValue] !== value) {
                value ? element.focus() : element.blur();
                ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, value ? "focusin" : "focusout"]);
              }
            }
          };
          ko.expressionRewriting.twoWayBindings['hasfocus'] = true;
          ko.bindingHandlers['hasFocus'] = ko.bindingHandlers['hasfocus'];
          ko.expressionRewriting.twoWayBindings['hasFocus'] = true;
          ko.bindingHandlers['html'] = {
            'init': function() {
              return {'controlsDescendantBindings': true};
            },
            'update': function(element, valueAccessor) {
              ko.utils.setHtml(element, valueAccessor());
            }
          };
          function makeWithIfBinding(bindingKey, isWith, isNot, makeContextCallback) {
            ko.bindingHandlers[bindingKey] = {'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                var didDisplayOnLastUpdate,
                    savedNodes;
                ko.computed(function() {
                  var dataValue = ko.utils.unwrapObservable(valueAccessor()),
                      shouldDisplay = !isNot !== !dataValue,
                      isFirstRender = !savedNodes,
                      needsRefresh = isFirstRender || isWith || (shouldDisplay !== didDisplayOnLastUpdate);
                  if (needsRefresh) {
                    if (isFirstRender && ko.computedContext.getDependenciesCount()) {
                      savedNodes = ko.utils.cloneNodes(ko.virtualElements.childNodes(element), true);
                    }
                    if (shouldDisplay) {
                      if (!isFirstRender) {
                        ko.virtualElements.setDomNodeChildren(element, ko.utils.cloneNodes(savedNodes));
                      }
                      ko.applyBindingsToDescendants(makeContextCallback ? makeContextCallback(bindingContext, dataValue) : bindingContext, element);
                    } else {
                      ko.virtualElements.emptyNode(element);
                    }
                    didDisplayOnLastUpdate = shouldDisplay;
                  }
                }, null, {disposeWhenNodeIsRemoved: element});
                return {'controlsDescendantBindings': true};
              }};
            ko.expressionRewriting.bindingRewriteValidators[bindingKey] = false;
            ko.virtualElements.allowedBindings[bindingKey] = true;
          }
          makeWithIfBinding('if');
          makeWithIfBinding('ifnot', false, true);
          makeWithIfBinding('with', true, false, function(bindingContext, dataValue) {
            return bindingContext['createChildContext'](dataValue);
          });
          var captionPlaceholder = {};
          ko.bindingHandlers['options'] = {
            'init': function(element) {
              if (ko.utils.tagNameLower(element) !== "select")
                throw new Error("options binding applies only to SELECT elements");
              while (element.length > 0) {
                element.remove(0);
              }
              return {'controlsDescendantBindings': true};
            },
            'update': function(element, valueAccessor, allBindings) {
              function selectedOptions() {
                return ko.utils.arrayFilter(element.options, function(node) {
                  return node.selected;
                });
              }
              var selectWasPreviouslyEmpty = element.length == 0;
              var previousScrollTop = (!selectWasPreviouslyEmpty && element.multiple) ? element.scrollTop : null;
              var unwrappedArray = ko.utils.unwrapObservable(valueAccessor());
              var includeDestroyed = allBindings.get('optionsIncludeDestroyed');
              var arrayToDomNodeChildrenOptions = {};
              var captionValue;
              var filteredArray;
              var previousSelectedValues;
              if (element.multiple) {
                previousSelectedValues = ko.utils.arrayMap(selectedOptions(), ko.selectExtensions.readValue);
              } else {
                previousSelectedValues = element.selectedIndex >= 0 ? [ko.selectExtensions.readValue(element.options[element.selectedIndex])] : [];
              }
              if (unwrappedArray) {
                if (typeof unwrappedArray.length == "undefined")
                  unwrappedArray = [unwrappedArray];
                filteredArray = ko.utils.arrayFilter(unwrappedArray, function(item) {
                  return includeDestroyed || item === undefined || item === null || !ko.utils.unwrapObservable(item['_destroy']);
                });
                if (allBindings['has']('optionsCaption')) {
                  captionValue = ko.utils.unwrapObservable(allBindings.get('optionsCaption'));
                  if (captionValue !== null && captionValue !== undefined) {
                    filteredArray.unshift(captionPlaceholder);
                  }
                }
              } else {}
              function applyToObject(object, predicate, defaultValue) {
                var predicateType = typeof predicate;
                if (predicateType == "function")
                  return predicate(object);
                else if (predicateType == "string")
                  return object[predicate];
                else
                  return defaultValue;
              }
              var itemUpdate = false;
              function optionForArrayItem(arrayEntry, index, oldOptions) {
                if (oldOptions.length) {
                  previousSelectedValues = oldOptions[0].selected ? [ko.selectExtensions.readValue(oldOptions[0])] : [];
                  itemUpdate = true;
                }
                var option = element.ownerDocument.createElement("option");
                if (arrayEntry === captionPlaceholder) {
                  ko.utils.setTextContent(option, allBindings.get('optionsCaption'));
                  ko.selectExtensions.writeValue(option, undefined);
                } else {
                  var optionValue = applyToObject(arrayEntry, allBindings.get('optionsValue'), arrayEntry);
                  ko.selectExtensions.writeValue(option, ko.utils.unwrapObservable(optionValue));
                  var optionText = applyToObject(arrayEntry, allBindings.get('optionsText'), optionValue);
                  ko.utils.setTextContent(option, optionText);
                }
                return [option];
              }
              arrayToDomNodeChildrenOptions['beforeRemove'] = function(option) {
                element.removeChild(option);
              };
              function setSelectionCallback(arrayEntry, newOptions) {
                if (previousSelectedValues.length) {
                  var isSelected = ko.utils.arrayIndexOf(previousSelectedValues, ko.selectExtensions.readValue(newOptions[0])) >= 0;
                  ko.utils.setOptionNodeSelectionState(newOptions[0], isSelected);
                  if (itemUpdate && !isSelected)
                    ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, "change"]);
                }
              }
              var callback = setSelectionCallback;
              if (allBindings['has']('optionsAfterRender')) {
                callback = function(arrayEntry, newOptions) {
                  setSelectionCallback(arrayEntry, newOptions);
                  ko.dependencyDetection.ignore(allBindings.get('optionsAfterRender'), null, [newOptions[0], arrayEntry !== captionPlaceholder ? arrayEntry : undefined]);
                };
              }
              ko.utils.setDomNodeChildrenFromArrayMapping(element, filteredArray, optionForArrayItem, arrayToDomNodeChildrenOptions, callback);
              ko.dependencyDetection.ignore(function() {
                if (allBindings.get('valueAllowUnset') && allBindings['has']('value')) {
                  ko.selectExtensions.writeValue(element, ko.utils.unwrapObservable(allBindings.get('value')), true);
                } else {
                  var selectionChanged;
                  if (element.multiple) {
                    selectionChanged = previousSelectedValues.length && selectedOptions().length < previousSelectedValues.length;
                  } else {
                    selectionChanged = (previousSelectedValues.length && element.selectedIndex >= 0) ? (ko.selectExtensions.readValue(element.options[element.selectedIndex]) !== previousSelectedValues[0]) : (previousSelectedValues.length || element.selectedIndex >= 0);
                  }
                  if (selectionChanged) {
                    ko.utils.triggerEvent(element, "change");
                  }
                }
              });
              ko.utils.ensureSelectElementIsRenderedCorrectly(element);
              if (previousScrollTop && Math.abs(previousScrollTop - element.scrollTop) > 20)
                element.scrollTop = previousScrollTop;
            }
          };
          ko.bindingHandlers['options'].optionValueDomDataKey = ko.utils.domData.nextKey();
          ko.bindingHandlers['selectedOptions'] = {
            'after': ['options', 'foreach'],
            'init': function(element, valueAccessor, allBindings) {
              ko.utils.registerEventHandler(element, "change", function() {
                var value = valueAccessor(),
                    valueToWrite = [];
                ko.utils.arrayForEach(element.getElementsByTagName("option"), function(node) {
                  if (node.selected)
                    valueToWrite.push(ko.selectExtensions.readValue(node));
                });
                ko.expressionRewriting.writeValueToProperty(value, allBindings, 'selectedOptions', valueToWrite);
              });
            },
            'update': function(element, valueAccessor) {
              if (ko.utils.tagNameLower(element) != "select")
                throw new Error("values binding applies only to SELECT elements");
              var newValue = ko.utils.unwrapObservable(valueAccessor());
              if (newValue && typeof newValue.length == "number") {
                ko.utils.arrayForEach(element.getElementsByTagName("option"), function(node) {
                  var isSelected = ko.utils.arrayIndexOf(newValue, ko.selectExtensions.readValue(node)) >= 0;
                  ko.utils.setOptionNodeSelectionState(node, isSelected);
                });
              }
            }
          };
          ko.expressionRewriting.twoWayBindings['selectedOptions'] = true;
          ko.bindingHandlers['style'] = {'update': function(element, valueAccessor) {
              var value = ko.utils.unwrapObservable(valueAccessor() || {});
              ko.utils.objectForEach(value, function(styleName, styleValue) {
                styleValue = ko.utils.unwrapObservable(styleValue);
                if (styleValue === null || styleValue === undefined || styleValue === false) {
                  styleValue = "";
                }
                element.style[styleName] = styleValue;
              });
            }};
          ko.bindingHandlers['submit'] = {'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
              if (typeof valueAccessor() != "function")
                throw new Error("The value for a submit binding must be a function");
              ko.utils.registerEventHandler(element, "submit", function(event) {
                var handlerReturnValue;
                var value = valueAccessor();
                try {
                  handlerReturnValue = value.call(bindingContext['$data'], element);
                } finally {
                  if (handlerReturnValue !== true) {
                    if (event.preventDefault)
                      event.preventDefault();
                    else
                      event.returnValue = false;
                  }
                }
              });
            }};
          ko.bindingHandlers['text'] = {
            'init': function() {
              return {'controlsDescendantBindings': true};
            },
            'update': function(element, valueAccessor) {
              ko.utils.setTextContent(element, valueAccessor());
            }
          };
          ko.virtualElements.allowedBindings['text'] = true;
          (function() {
            if (window && window.navigator) {
              var parseVersion = function(matches) {
                if (matches) {
                  return parseFloat(matches[1]);
                }
              };
              var operaVersion = window.opera && window.opera.version && parseInt(window.opera.version()),
                  userAgent = window.navigator.userAgent,
                  safariVersion = parseVersion(userAgent.match(/^(?:(?!chrome).)*version\/([^ ]*) safari/i)),
                  firefoxVersion = parseVersion(userAgent.match(/Firefox\/([^ ]*)/));
            }
            if (ko.utils.ieVersion < 10) {
              var selectionChangeRegisteredName = ko.utils.domData.nextKey(),
                  selectionChangeHandlerName = ko.utils.domData.nextKey();
              var selectionChangeHandler = function(event) {
                var target = this.activeElement,
                    handler = target && ko.utils.domData.get(target, selectionChangeHandlerName);
                if (handler) {
                  handler(event);
                }
              };
              var registerForSelectionChangeEvent = function(element, handler) {
                var ownerDoc = element.ownerDocument;
                if (!ko.utils.domData.get(ownerDoc, selectionChangeRegisteredName)) {
                  ko.utils.domData.set(ownerDoc, selectionChangeRegisteredName, true);
                  ko.utils.registerEventHandler(ownerDoc, 'selectionchange', selectionChangeHandler);
                }
                ko.utils.domData.set(element, selectionChangeHandlerName, handler);
              };
            }
            ko.bindingHandlers['textInput'] = {'init': function(element, valueAccessor, allBindings) {
                var previousElementValue = element.value,
                    timeoutHandle,
                    elementValueBeforeEvent;
                var updateModel = function(event) {
                  clearTimeout(timeoutHandle);
                  elementValueBeforeEvent = timeoutHandle = undefined;
                  var elementValue = element.value;
                  if (previousElementValue !== elementValue) {
                    if (DEBUG && event)
                      element['_ko_textInputProcessedEvent'] = event.type;
                    previousElementValue = elementValue;
                    ko.expressionRewriting.writeValueToProperty(valueAccessor(), allBindings, 'textInput', elementValue);
                  }
                };
                var deferUpdateModel = function(event) {
                  if (!timeoutHandle) {
                    elementValueBeforeEvent = element.value;
                    var handler = DEBUG ? updateModel.bind(element, {type: event.type}) : updateModel;
                    timeoutHandle = setTimeout(handler, 4);
                  }
                };
                var updateView = function() {
                  var modelValue = ko.utils.unwrapObservable(valueAccessor());
                  if (modelValue === null || modelValue === undefined) {
                    modelValue = '';
                  }
                  if (elementValueBeforeEvent !== undefined && modelValue === elementValueBeforeEvent) {
                    setTimeout(updateView, 4);
                    return;
                  }
                  if (element.value !== modelValue) {
                    previousElementValue = modelValue;
                    element.value = modelValue;
                  }
                };
                var onEvent = function(event, handler) {
                  ko.utils.registerEventHandler(element, event, handler);
                };
                if (DEBUG && ko.bindingHandlers['textInput']['_forceUpdateOn']) {
                  ko.utils.arrayForEach(ko.bindingHandlers['textInput']['_forceUpdateOn'], function(eventName) {
                    if (eventName.slice(0, 5) == 'after') {
                      onEvent(eventName.slice(5), deferUpdateModel);
                    } else {
                      onEvent(eventName, updateModel);
                    }
                  });
                } else {
                  if (ko.utils.ieVersion < 10) {
                    onEvent('propertychange', function(event) {
                      if (event.propertyName === 'value') {
                        updateModel(event);
                      }
                    });
                    if (ko.utils.ieVersion == 8) {
                      onEvent('keyup', updateModel);
                      onEvent('keydown', updateModel);
                    }
                    if (ko.utils.ieVersion >= 8) {
                      registerForSelectionChangeEvent(element, updateModel);
                      onEvent('dragend', deferUpdateModel);
                    }
                  } else {
                    onEvent('input', updateModel);
                    if (safariVersion < 5 && ko.utils.tagNameLower(element) === "textarea") {
                      onEvent('keydown', deferUpdateModel);
                      onEvent('paste', deferUpdateModel);
                      onEvent('cut', deferUpdateModel);
                    } else if (operaVersion < 11) {
                      onEvent('keydown', deferUpdateModel);
                    } else if (firefoxVersion < 4.0) {
                      onEvent('DOMAutoComplete', updateModel);
                      onEvent('dragdrop', updateModel);
                      onEvent('drop', updateModel);
                    }
                  }
                }
                onEvent('change', updateModel);
                ko.computed(updateView, null, {disposeWhenNodeIsRemoved: element});
              }};
            ko.expressionRewriting.twoWayBindings['textInput'] = true;
            ko.bindingHandlers['textinput'] = {'preprocess': function(value, name, addBinding) {
                addBinding('textInput', value);
              }};
          })();
          ko.bindingHandlers['uniqueName'] = {'init': function(element, valueAccessor) {
              if (valueAccessor()) {
                var name = "ko_unique_" + (++ko.bindingHandlers['uniqueName'].currentIndex);
                ko.utils.setElementName(element, name);
              }
            }};
          ko.bindingHandlers['uniqueName'].currentIndex = 0;
          ko.bindingHandlers['value'] = {
            'after': ['options', 'foreach'],
            'init': function(element, valueAccessor, allBindings) {
              if (element.tagName.toLowerCase() == "input" && (element.type == "checkbox" || element.type == "radio")) {
                ko.applyBindingAccessorsToNode(element, {'checkedValue': valueAccessor});
                return;
              }
              var eventsToCatch = ["change"];
              var requestedEventsToCatch = allBindings.get("valueUpdate");
              var propertyChangedFired = false;
              var elementValueBeforeEvent = null;
              if (requestedEventsToCatch) {
                if (typeof requestedEventsToCatch == "string")
                  requestedEventsToCatch = [requestedEventsToCatch];
                ko.utils.arrayPushAll(eventsToCatch, requestedEventsToCatch);
                eventsToCatch = ko.utils.arrayGetDistinctValues(eventsToCatch);
              }
              var valueUpdateHandler = function() {
                elementValueBeforeEvent = null;
                propertyChangedFired = false;
                var modelValue = valueAccessor();
                var elementValue = ko.selectExtensions.readValue(element);
                ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'value', elementValue);
              };
              var ieAutoCompleteHackNeeded = ko.utils.ieVersion && element.tagName.toLowerCase() == "input" && element.type == "text" && element.autocomplete != "off" && (!element.form || element.form.autocomplete != "off");
              if (ieAutoCompleteHackNeeded && ko.utils.arrayIndexOf(eventsToCatch, "propertychange") == -1) {
                ko.utils.registerEventHandler(element, "propertychange", function() {
                  propertyChangedFired = true;
                });
                ko.utils.registerEventHandler(element, "focus", function() {
                  propertyChangedFired = false;
                });
                ko.utils.registerEventHandler(element, "blur", function() {
                  if (propertyChangedFired) {
                    valueUpdateHandler();
                  }
                });
              }
              ko.utils.arrayForEach(eventsToCatch, function(eventName) {
                var handler = valueUpdateHandler;
                if (ko.utils.stringStartsWith(eventName, "after")) {
                  handler = function() {
                    elementValueBeforeEvent = ko.selectExtensions.readValue(element);
                    setTimeout(valueUpdateHandler, 0);
                  };
                  eventName = eventName.substring("after".length);
                }
                ko.utils.registerEventHandler(element, eventName, handler);
              });
              var updateFromModel = function() {
                var newValue = ko.utils.unwrapObservable(valueAccessor());
                var elementValue = ko.selectExtensions.readValue(element);
                if (elementValueBeforeEvent !== null && newValue === elementValueBeforeEvent) {
                  setTimeout(updateFromModel, 0);
                  return;
                }
                var valueHasChanged = (newValue !== elementValue);
                if (valueHasChanged) {
                  if (ko.utils.tagNameLower(element) === "select") {
                    var allowUnset = allBindings.get('valueAllowUnset');
                    var applyValueAction = function() {
                      ko.selectExtensions.writeValue(element, newValue, allowUnset);
                    };
                    applyValueAction();
                    if (!allowUnset && newValue !== ko.selectExtensions.readValue(element)) {
                      ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, "change"]);
                    } else {
                      setTimeout(applyValueAction, 0);
                    }
                  } else {
                    ko.selectExtensions.writeValue(element, newValue);
                  }
                }
              };
              ko.computed(updateFromModel, null, {disposeWhenNodeIsRemoved: element});
            },
            'update': function() {}
          };
          ko.expressionRewriting.twoWayBindings['value'] = true;
          ko.bindingHandlers['visible'] = {'update': function(element, valueAccessor) {
              var value = ko.utils.unwrapObservable(valueAccessor());
              var isCurrentlyVisible = !(element.style.display == "none");
              if (value && !isCurrentlyVisible)
                element.style.display = "";
              else if ((!value) && isCurrentlyVisible)
                element.style.display = "none";
            }};
          makeEventHandlerShortcut('click');
          ko.templateEngine = function() {};
          ko.templateEngine.prototype['renderTemplateSource'] = function(templateSource, bindingContext, options) {
            throw new Error("Override renderTemplateSource");
          };
          ko.templateEngine.prototype['createJavaScriptEvaluatorBlock'] = function(script) {
            throw new Error("Override createJavaScriptEvaluatorBlock");
          };
          ko.templateEngine.prototype['makeTemplateSource'] = function(template, templateDocument) {
            if (typeof template == "string") {
              templateDocument = templateDocument || document;
              var elem = templateDocument.getElementById(template);
              if (!elem)
                throw new Error("Cannot find template with ID " + template);
              return new ko.templateSources.domElement(elem);
            } else if ((template.nodeType == 1) || (template.nodeType == 8)) {
              return new ko.templateSources.anonymousTemplate(template);
            } else
              throw new Error("Unknown template type: " + template);
          };
          ko.templateEngine.prototype['renderTemplate'] = function(template, bindingContext, options, templateDocument) {
            var templateSource = this['makeTemplateSource'](template, templateDocument);
            return this['renderTemplateSource'](templateSource, bindingContext, options);
          };
          ko.templateEngine.prototype['isTemplateRewritten'] = function(template, templateDocument) {
            if (this['allowTemplateRewriting'] === false)
              return true;
            return this['makeTemplateSource'](template, templateDocument)['data']("isRewritten");
          };
          ko.templateEngine.prototype['rewriteTemplate'] = function(template, rewriterCallback, templateDocument) {
            var templateSource = this['makeTemplateSource'](template, templateDocument);
            var rewritten = rewriterCallback(templateSource['text']());
            templateSource['text'](rewritten);
            templateSource['data']("isRewritten", true);
          };
          ko.exportSymbol('templateEngine', ko.templateEngine);
          ko.templateRewriting = (function() {
            var memoizeDataBindingAttributeSyntaxRegex = /(<([a-z]+\d*)(?:\s+(?!data-bind\s*=\s*)[a-z0-9\-]+(?:=(?:\"[^\"]*\"|\'[^\']*\'))?)*\s+)data-bind\s*=\s*(["'])([\s\S]*?)\3/gi;
            var memoizeVirtualContainerBindingSyntaxRegex = /<!--\s*ko\b\s*([\s\S]*?)\s*-->/g;
            function validateDataBindValuesForRewriting(keyValueArray) {
              var allValidators = ko.expressionRewriting.bindingRewriteValidators;
              for (var i = 0; i < keyValueArray.length; i++) {
                var key = keyValueArray[i]['key'];
                if (allValidators.hasOwnProperty(key)) {
                  var validator = allValidators[key];
                  if (typeof validator === "function") {
                    var possibleErrorMessage = validator(keyValueArray[i]['value']);
                    if (possibleErrorMessage)
                      throw new Error(possibleErrorMessage);
                  } else if (!validator) {
                    throw new Error("This template engine does not support the '" + key + "' binding within its templates");
                  }
                }
              }
            }
            function constructMemoizedTagReplacement(dataBindAttributeValue, tagToRetain, nodeName, templateEngine) {
              var dataBindKeyValueArray = ko.expressionRewriting.parseObjectLiteral(dataBindAttributeValue);
              validateDataBindValuesForRewriting(dataBindKeyValueArray);
              var rewrittenDataBindAttributeValue = ko.expressionRewriting.preProcessBindings(dataBindKeyValueArray, {'valueAccessors': true});
              var applyBindingsToNextSiblingScript = "ko.__tr_ambtns(function($context,$element){return(function(){return{ " + rewrittenDataBindAttributeValue + " } })()},'" + nodeName.toLowerCase() + "')";
              return templateEngine['createJavaScriptEvaluatorBlock'](applyBindingsToNextSiblingScript) + tagToRetain;
            }
            return {
              ensureTemplateIsRewritten: function(template, templateEngine, templateDocument) {
                if (!templateEngine['isTemplateRewritten'](template, templateDocument))
                  templateEngine['rewriteTemplate'](template, function(htmlString) {
                    return ko.templateRewriting.memoizeBindingAttributeSyntax(htmlString, templateEngine);
                  }, templateDocument);
              },
              memoizeBindingAttributeSyntax: function(htmlString, templateEngine) {
                return htmlString.replace(memoizeDataBindingAttributeSyntaxRegex, function() {
                  return constructMemoizedTagReplacement(arguments[4], arguments[1], arguments[2], templateEngine);
                }).replace(memoizeVirtualContainerBindingSyntaxRegex, function() {
                  return constructMemoizedTagReplacement(arguments[1], "<!-- ko -->", "#comment", templateEngine);
                });
              },
              applyMemoizedBindingsToNextSibling: function(bindings, nodeName) {
                return ko.memoization.memoize(function(domNode, bindingContext) {
                  var nodeToBind = domNode.nextSibling;
                  if (nodeToBind && nodeToBind.nodeName.toLowerCase() === nodeName) {
                    ko.applyBindingAccessorsToNode(nodeToBind, bindings, bindingContext);
                  }
                });
              }
            };
          })();
          ko.exportSymbol('__tr_ambtns', ko.templateRewriting.applyMemoizedBindingsToNextSibling);
          (function() {
            ko.templateSources = {};
            ko.templateSources.domElement = function(element) {
              this.domElement = element;
            };
            ko.templateSources.domElement.prototype['text'] = function() {
              var tagNameLower = ko.utils.tagNameLower(this.domElement),
                  elemContentsProperty = tagNameLower === "script" ? "text" : tagNameLower === "textarea" ? "value" : "innerHTML";
              if (arguments.length == 0) {
                return this.domElement[elemContentsProperty];
              } else {
                var valueToWrite = arguments[0];
                if (elemContentsProperty === "innerHTML")
                  ko.utils.setHtml(this.domElement, valueToWrite);
                else
                  this.domElement[elemContentsProperty] = valueToWrite;
              }
            };
            var dataDomDataPrefix = ko.utils.domData.nextKey() + "_";
            ko.templateSources.domElement.prototype['data'] = function(key) {
              if (arguments.length === 1) {
                return ko.utils.domData.get(this.domElement, dataDomDataPrefix + key);
              } else {
                ko.utils.domData.set(this.domElement, dataDomDataPrefix + key, arguments[1]);
              }
            };
            var anonymousTemplatesDomDataKey = ko.utils.domData.nextKey();
            ko.templateSources.anonymousTemplate = function(element) {
              this.domElement = element;
            };
            ko.templateSources.anonymousTemplate.prototype = new ko.templateSources.domElement();
            ko.templateSources.anonymousTemplate.prototype.constructor = ko.templateSources.anonymousTemplate;
            ko.templateSources.anonymousTemplate.prototype['text'] = function() {
              if (arguments.length == 0) {
                var templateData = ko.utils.domData.get(this.domElement, anonymousTemplatesDomDataKey) || {};
                if (templateData.textData === undefined && templateData.containerData)
                  templateData.textData = templateData.containerData.innerHTML;
                return templateData.textData;
              } else {
                var valueToWrite = arguments[0];
                ko.utils.domData.set(this.domElement, anonymousTemplatesDomDataKey, {textData: valueToWrite});
              }
            };
            ko.templateSources.domElement.prototype['nodes'] = function() {
              if (arguments.length == 0) {
                var templateData = ko.utils.domData.get(this.domElement, anonymousTemplatesDomDataKey) || {};
                return templateData.containerData;
              } else {
                var valueToWrite = arguments[0];
                ko.utils.domData.set(this.domElement, anonymousTemplatesDomDataKey, {containerData: valueToWrite});
              }
            };
            ko.exportSymbol('templateSources', ko.templateSources);
            ko.exportSymbol('templateSources.domElement', ko.templateSources.domElement);
            ko.exportSymbol('templateSources.anonymousTemplate', ko.templateSources.anonymousTemplate);
          })();
          (function() {
            var _templateEngine;
            ko.setTemplateEngine = function(templateEngine) {
              if ((templateEngine != undefined) && !(templateEngine instanceof ko.templateEngine))
                throw new Error("templateEngine must inherit from ko.templateEngine");
              _templateEngine = templateEngine;
            };
            function invokeForEachNodeInContinuousRange(firstNode, lastNode, action) {
              var node,
                  nextInQueue = firstNode,
                  firstOutOfRangeNode = ko.virtualElements.nextSibling(lastNode);
              while (nextInQueue && ((node = nextInQueue) !== firstOutOfRangeNode)) {
                nextInQueue = ko.virtualElements.nextSibling(node);
                action(node, nextInQueue);
              }
            }
            function activateBindingsOnContinuousNodeArray(continuousNodeArray, bindingContext) {
              if (continuousNodeArray.length) {
                var firstNode = continuousNodeArray[0],
                    lastNode = continuousNodeArray[continuousNodeArray.length - 1],
                    parentNode = firstNode.parentNode,
                    provider = ko.bindingProvider['instance'],
                    preprocessNode = provider['preprocessNode'];
                if (preprocessNode) {
                  invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node, nextNodeInRange) {
                    var nodePreviousSibling = node.previousSibling;
                    var newNodes = preprocessNode.call(provider, node);
                    if (newNodes) {
                      if (node === firstNode)
                        firstNode = newNodes[0] || nextNodeInRange;
                      if (node === lastNode)
                        lastNode = newNodes[newNodes.length - 1] || nodePreviousSibling;
                    }
                  });
                  continuousNodeArray.length = 0;
                  if (!firstNode) {
                    return;
                  }
                  if (firstNode === lastNode) {
                    continuousNodeArray.push(firstNode);
                  } else {
                    continuousNodeArray.push(firstNode, lastNode);
                    ko.utils.fixUpContinuousNodeArray(continuousNodeArray, parentNode);
                  }
                }
                invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node) {
                  if (node.nodeType === 1 || node.nodeType === 8)
                    ko.applyBindings(bindingContext, node);
                });
                invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node) {
                  if (node.nodeType === 1 || node.nodeType === 8)
                    ko.memoization.unmemoizeDomNodeAndDescendants(node, [bindingContext]);
                });
                ko.utils.fixUpContinuousNodeArray(continuousNodeArray, parentNode);
              }
            }
            function getFirstNodeFromPossibleArray(nodeOrNodeArray) {
              return nodeOrNodeArray.nodeType ? nodeOrNodeArray : nodeOrNodeArray.length > 0 ? nodeOrNodeArray[0] : null;
            }
            function executeTemplate(targetNodeOrNodeArray, renderMode, template, bindingContext, options) {
              options = options || {};
              var firstTargetNode = targetNodeOrNodeArray && getFirstNodeFromPossibleArray(targetNodeOrNodeArray);
              var templateDocument = firstTargetNode && firstTargetNode.ownerDocument;
              var templateEngineToUse = (options['templateEngine'] || _templateEngine);
              ko.templateRewriting.ensureTemplateIsRewritten(template, templateEngineToUse, templateDocument);
              var renderedNodesArray = templateEngineToUse['renderTemplate'](template, bindingContext, options, templateDocument);
              if ((typeof renderedNodesArray.length != "number") || (renderedNodesArray.length > 0 && typeof renderedNodesArray[0].nodeType != "number"))
                throw new Error("Template engine must return an array of DOM nodes");
              var haveAddedNodesToParent = false;
              switch (renderMode) {
                case "replaceChildren":
                  ko.virtualElements.setDomNodeChildren(targetNodeOrNodeArray, renderedNodesArray);
                  haveAddedNodesToParent = true;
                  break;
                case "replaceNode":
                  ko.utils.replaceDomNodes(targetNodeOrNodeArray, renderedNodesArray);
                  haveAddedNodesToParent = true;
                  break;
                case "ignoreTargetNode":
                  break;
                default:
                  throw new Error("Unknown renderMode: " + renderMode);
              }
              if (haveAddedNodesToParent) {
                activateBindingsOnContinuousNodeArray(renderedNodesArray, bindingContext);
                if (options['afterRender'])
                  ko.dependencyDetection.ignore(options['afterRender'], null, [renderedNodesArray, bindingContext['$data']]);
              }
              return renderedNodesArray;
            }
            function resolveTemplateName(template, data, context) {
              if (ko.isObservable(template)) {
                return template();
              } else if (typeof template === 'function') {
                return template(data, context);
              } else {
                return template;
              }
            }
            ko.renderTemplate = function(template, dataOrBindingContext, options, targetNodeOrNodeArray, renderMode) {
              options = options || {};
              if ((options['templateEngine'] || _templateEngine) == undefined)
                throw new Error("Set a template engine before calling renderTemplate");
              renderMode = renderMode || "replaceChildren";
              if (targetNodeOrNodeArray) {
                var firstTargetNode = getFirstNodeFromPossibleArray(targetNodeOrNodeArray);
                var whenToDispose = function() {
                  return (!firstTargetNode) || !ko.utils.domNodeIsAttachedToDocument(firstTargetNode);
                };
                var activelyDisposeWhenNodeIsRemoved = (firstTargetNode && renderMode == "replaceNode") ? firstTargetNode.parentNode : firstTargetNode;
                return ko.dependentObservable(function() {
                  var bindingContext = (dataOrBindingContext && (dataOrBindingContext instanceof ko.bindingContext)) ? dataOrBindingContext : new ko.bindingContext(ko.utils.unwrapObservable(dataOrBindingContext));
                  var templateName = resolveTemplateName(template, bindingContext['$data'], bindingContext),
                      renderedNodesArray = executeTemplate(targetNodeOrNodeArray, renderMode, templateName, bindingContext, options);
                  if (renderMode == "replaceNode") {
                    targetNodeOrNodeArray = renderedNodesArray;
                    firstTargetNode = getFirstNodeFromPossibleArray(targetNodeOrNodeArray);
                  }
                }, null, {
                  disposeWhen: whenToDispose,
                  disposeWhenNodeIsRemoved: activelyDisposeWhenNodeIsRemoved
                });
              } else {
                return ko.memoization.memoize(function(domNode) {
                  ko.renderTemplate(template, dataOrBindingContext, options, domNode, "replaceNode");
                });
              }
            };
            ko.renderTemplateForEach = function(template, arrayOrObservableArray, options, targetNode, parentBindingContext) {
              var arrayItemContext;
              var executeTemplateForArrayItem = function(arrayValue, index) {
                arrayItemContext = parentBindingContext['createChildContext'](arrayValue, options['as'], function(context) {
                  context['$index'] = index;
                });
                var templateName = resolveTemplateName(template, arrayValue, arrayItemContext);
                return executeTemplate(null, "ignoreTargetNode", templateName, arrayItemContext, options);
              };
              var activateBindingsCallback = function(arrayValue, addedNodesArray, index) {
                activateBindingsOnContinuousNodeArray(addedNodesArray, arrayItemContext);
                if (options['afterRender'])
                  options['afterRender'](addedNodesArray, arrayValue);
              };
              return ko.dependentObservable(function() {
                var unwrappedArray = ko.utils.unwrapObservable(arrayOrObservableArray) || [];
                if (typeof unwrappedArray.length == "undefined")
                  unwrappedArray = [unwrappedArray];
                var filteredArray = ko.utils.arrayFilter(unwrappedArray, function(item) {
                  return options['includeDestroyed'] || item === undefined || item === null || !ko.utils.unwrapObservable(item['_destroy']);
                });
                ko.dependencyDetection.ignore(ko.utils.setDomNodeChildrenFromArrayMapping, null, [targetNode, filteredArray, executeTemplateForArrayItem, options, activateBindingsCallback]);
              }, null, {disposeWhenNodeIsRemoved: targetNode});
            };
            var templateComputedDomDataKey = ko.utils.domData.nextKey();
            function disposeOldComputedAndStoreNewOne(element, newComputed) {
              var oldComputed = ko.utils.domData.get(element, templateComputedDomDataKey);
              if (oldComputed && (typeof(oldComputed.dispose) == 'function'))
                oldComputed.dispose();
              ko.utils.domData.set(element, templateComputedDomDataKey, (newComputed && newComputed.isActive()) ? newComputed : undefined);
            }
            ko.bindingHandlers['template'] = {
              'init': function(element, valueAccessor) {
                var bindingValue = ko.utils.unwrapObservable(valueAccessor());
                if (typeof bindingValue == "string" || bindingValue['name']) {
                  ko.virtualElements.emptyNode(element);
                } else {
                  var templateNodes = ko.virtualElements.childNodes(element),
                      container = ko.utils.moveCleanedNodesToContainerElement(templateNodes);
                  new ko.templateSources.anonymousTemplate(element)['nodes'](container);
                }
                return {'controlsDescendantBindings': true};
              },
              'update': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                var value = valueAccessor(),
                    dataValue,
                    options = ko.utils.unwrapObservable(value),
                    shouldDisplay = true,
                    templateComputed = null,
                    templateName;
                if (typeof options == "string") {
                  templateName = value;
                  options = {};
                } else {
                  templateName = options['name'];
                  if ('if' in options)
                    shouldDisplay = ko.utils.unwrapObservable(options['if']);
                  if (shouldDisplay && 'ifnot' in options)
                    shouldDisplay = !ko.utils.unwrapObservable(options['ifnot']);
                  dataValue = ko.utils.unwrapObservable(options['data']);
                }
                if ('foreach' in options) {
                  var dataArray = (shouldDisplay && options['foreach']) || [];
                  templateComputed = ko.renderTemplateForEach(templateName || element, dataArray, options, element, bindingContext);
                } else if (!shouldDisplay) {
                  ko.virtualElements.emptyNode(element);
                } else {
                  var innerBindingContext = ('data' in options) ? bindingContext['createChildContext'](dataValue, options['as']) : bindingContext;
                  templateComputed = ko.renderTemplate(templateName || element, innerBindingContext, options, element);
                }
                disposeOldComputedAndStoreNewOne(element, templateComputed);
              }
            };
            ko.expressionRewriting.bindingRewriteValidators['template'] = function(bindingValue) {
              var parsedBindingValue = ko.expressionRewriting.parseObjectLiteral(bindingValue);
              if ((parsedBindingValue.length == 1) && parsedBindingValue[0]['unknown'])
                return null;
              if (ko.expressionRewriting.keyValueArrayContainsKey(parsedBindingValue, "name"))
                return null;
              return "This template engine does not support anonymous templates nested within its templates";
            };
            ko.virtualElements.allowedBindings['template'] = true;
          })();
          ko.exportSymbol('setTemplateEngine', ko.setTemplateEngine);
          ko.exportSymbol('renderTemplate', ko.renderTemplate);
          ko.utils.findMovesInArrayComparison = function(left, right, limitFailedCompares) {
            if (left.length && right.length) {
              var failedCompares,
                  l,
                  r,
                  leftItem,
                  rightItem;
              for (failedCompares = l = 0; (!limitFailedCompares || failedCompares < limitFailedCompares) && (leftItem = left[l]); ++l) {
                for (r = 0; rightItem = right[r]; ++r) {
                  if (leftItem['value'] === rightItem['value']) {
                    leftItem['moved'] = rightItem['index'];
                    rightItem['moved'] = leftItem['index'];
                    right.splice(r, 1);
                    failedCompares = r = 0;
                    break;
                  }
                }
                failedCompares += r;
              }
            }
          };
          ko.utils.compareArrays = (function() {
            var statusNotInOld = 'added',
                statusNotInNew = 'deleted';
            function compareArrays(oldArray, newArray, options) {
              options = (typeof options === 'boolean') ? {'dontLimitMoves': options} : (options || {});
              oldArray = oldArray || [];
              newArray = newArray || [];
              if (oldArray.length <= newArray.length)
                return compareSmallArrayToBigArray(oldArray, newArray, statusNotInOld, statusNotInNew, options);
              else
                return compareSmallArrayToBigArray(newArray, oldArray, statusNotInNew, statusNotInOld, options);
            }
            function compareSmallArrayToBigArray(smlArray, bigArray, statusNotInSml, statusNotInBig, options) {
              var myMin = Math.min,
                  myMax = Math.max,
                  editDistanceMatrix = [],
                  smlIndex,
                  smlIndexMax = smlArray.length,
                  bigIndex,
                  bigIndexMax = bigArray.length,
                  compareRange = (bigIndexMax - smlIndexMax) || 1,
                  maxDistance = smlIndexMax + bigIndexMax + 1,
                  thisRow,
                  lastRow,
                  bigIndexMaxForRow,
                  bigIndexMinForRow;
              for (smlIndex = 0; smlIndex <= smlIndexMax; smlIndex++) {
                lastRow = thisRow;
                editDistanceMatrix.push(thisRow = []);
                bigIndexMaxForRow = myMin(bigIndexMax, smlIndex + compareRange);
                bigIndexMinForRow = myMax(0, smlIndex - 1);
                for (bigIndex = bigIndexMinForRow; bigIndex <= bigIndexMaxForRow; bigIndex++) {
                  if (!bigIndex)
                    thisRow[bigIndex] = smlIndex + 1;
                  else if (!smlIndex)
                    thisRow[bigIndex] = bigIndex + 1;
                  else if (smlArray[smlIndex - 1] === bigArray[bigIndex - 1])
                    thisRow[bigIndex] = lastRow[bigIndex - 1];
                  else {
                    var northDistance = lastRow[bigIndex] || maxDistance;
                    var westDistance = thisRow[bigIndex - 1] || maxDistance;
                    thisRow[bigIndex] = myMin(northDistance, westDistance) + 1;
                  }
                }
              }
              var editScript = [],
                  meMinusOne,
                  notInSml = [],
                  notInBig = [];
              for (smlIndex = smlIndexMax, bigIndex = bigIndexMax; smlIndex || bigIndex; ) {
                meMinusOne = editDistanceMatrix[smlIndex][bigIndex] - 1;
                if (bigIndex && meMinusOne === editDistanceMatrix[smlIndex][bigIndex - 1]) {
                  notInSml.push(editScript[editScript.length] = {
                    'status': statusNotInSml,
                    'value': bigArray[--bigIndex],
                    'index': bigIndex
                  });
                } else if (smlIndex && meMinusOne === editDistanceMatrix[smlIndex - 1][bigIndex]) {
                  notInBig.push(editScript[editScript.length] = {
                    'status': statusNotInBig,
                    'value': smlArray[--smlIndex],
                    'index': smlIndex
                  });
                } else {
                  --bigIndex;
                  --smlIndex;
                  if (!options['sparse']) {
                    editScript.push({
                      'status': "retained",
                      'value': bigArray[bigIndex]
                    });
                  }
                }
              }
              ko.utils.findMovesInArrayComparison(notInSml, notInBig, smlIndexMax * 10);
              return editScript.reverse();
            }
            return compareArrays;
          })();
          ko.exportSymbol('utils.compareArrays', ko.utils.compareArrays);
          (function() {
            function mapNodeAndRefreshWhenChanged(containerNode, mapping, valueToMap, callbackAfterAddingNodes, index) {
              var mappedNodes = [];
              var dependentObservable = ko.dependentObservable(function() {
                var newMappedNodes = mapping(valueToMap, index, ko.utils.fixUpContinuousNodeArray(mappedNodes, containerNode)) || [];
                if (mappedNodes.length > 0) {
                  ko.utils.replaceDomNodes(mappedNodes, newMappedNodes);
                  if (callbackAfterAddingNodes)
                    ko.dependencyDetection.ignore(callbackAfterAddingNodes, null, [valueToMap, newMappedNodes, index]);
                }
                mappedNodes.length = 0;
                ko.utils.arrayPushAll(mappedNodes, newMappedNodes);
              }, null, {
                disposeWhenNodeIsRemoved: containerNode,
                disposeWhen: function() {
                  return !ko.utils.anyDomNodeIsAttachedToDocument(mappedNodes);
                }
              });
              return {
                mappedNodes: mappedNodes,
                dependentObservable: (dependentObservable.isActive() ? dependentObservable : undefined)
              };
            }
            var lastMappingResultDomDataKey = ko.utils.domData.nextKey();
            ko.utils.setDomNodeChildrenFromArrayMapping = function(domNode, array, mapping, options, callbackAfterAddingNodes) {
              array = array || [];
              options = options || {};
              var isFirstExecution = ko.utils.domData.get(domNode, lastMappingResultDomDataKey) === undefined;
              var lastMappingResult = ko.utils.domData.get(domNode, lastMappingResultDomDataKey) || [];
              var lastArray = ko.utils.arrayMap(lastMappingResult, function(x) {
                return x.arrayEntry;
              });
              var editScript = ko.utils.compareArrays(lastArray, array, options['dontLimitMoves']);
              var newMappingResult = [];
              var lastMappingResultIndex = 0;
              var newMappingResultIndex = 0;
              var nodesToDelete = [];
              var itemsToProcess = [];
              var itemsForBeforeRemoveCallbacks = [];
              var itemsForMoveCallbacks = [];
              var itemsForAfterAddCallbacks = [];
              var mapData;
              function itemMovedOrRetained(editScriptIndex, oldPosition) {
                mapData = lastMappingResult[oldPosition];
                if (newMappingResultIndex !== oldPosition)
                  itemsForMoveCallbacks[editScriptIndex] = mapData;
                mapData.indexObservable(newMappingResultIndex++);
                ko.utils.fixUpContinuousNodeArray(mapData.mappedNodes, domNode);
                newMappingResult.push(mapData);
                itemsToProcess.push(mapData);
              }
              function callCallback(callback, items) {
                if (callback) {
                  for (var i = 0,
                      n = items.length; i < n; i++) {
                    if (items[i]) {
                      ko.utils.arrayForEach(items[i].mappedNodes, function(node) {
                        callback(node, i, items[i].arrayEntry);
                      });
                    }
                  }
                }
              }
              for (var i = 0,
                  editScriptItem,
                  movedIndex; editScriptItem = editScript[i]; i++) {
                movedIndex = editScriptItem['moved'];
                switch (editScriptItem['status']) {
                  case "deleted":
                    if (movedIndex === undefined) {
                      mapData = lastMappingResult[lastMappingResultIndex];
                      if (mapData.dependentObservable)
                        mapData.dependentObservable.dispose();
                      nodesToDelete.push.apply(nodesToDelete, ko.utils.fixUpContinuousNodeArray(mapData.mappedNodes, domNode));
                      if (options['beforeRemove']) {
                        itemsForBeforeRemoveCallbacks[i] = mapData;
                        itemsToProcess.push(mapData);
                      }
                    }
                    lastMappingResultIndex++;
                    break;
                  case "retained":
                    itemMovedOrRetained(i, lastMappingResultIndex++);
                    break;
                  case "added":
                    if (movedIndex !== undefined) {
                      itemMovedOrRetained(i, movedIndex);
                    } else {
                      mapData = {
                        arrayEntry: editScriptItem['value'],
                        indexObservable: ko.observable(newMappingResultIndex++)
                      };
                      newMappingResult.push(mapData);
                      itemsToProcess.push(mapData);
                      if (!isFirstExecution)
                        itemsForAfterAddCallbacks[i] = mapData;
                    }
                    break;
                }
              }
              callCallback(options['beforeMove'], itemsForMoveCallbacks);
              ko.utils.arrayForEach(nodesToDelete, options['beforeRemove'] ? ko.cleanNode : ko.removeNode);
              for (var i = 0,
                  nextNode = ko.virtualElements.firstChild(domNode),
                  lastNode,
                  node; mapData = itemsToProcess[i]; i++) {
                if (!mapData.mappedNodes)
                  ko.utils.extend(mapData, mapNodeAndRefreshWhenChanged(domNode, mapping, mapData.arrayEntry, callbackAfterAddingNodes, mapData.indexObservable));
                for (var j = 0; node = mapData.mappedNodes[j]; nextNode = node.nextSibling, lastNode = node, j++) {
                  if (node !== nextNode)
                    ko.virtualElements.insertAfter(domNode, node, lastNode);
                }
                if (!mapData.initialized && callbackAfterAddingNodes) {
                  callbackAfterAddingNodes(mapData.arrayEntry, mapData.mappedNodes, mapData.indexObservable);
                  mapData.initialized = true;
                }
              }
              callCallback(options['beforeRemove'], itemsForBeforeRemoveCallbacks);
              callCallback(options['afterMove'], itemsForMoveCallbacks);
              callCallback(options['afterAdd'], itemsForAfterAddCallbacks);
              ko.utils.domData.set(domNode, lastMappingResultDomDataKey, newMappingResult);
            };
          })();
          ko.exportSymbol('utils.setDomNodeChildrenFromArrayMapping', ko.utils.setDomNodeChildrenFromArrayMapping);
          ko.nativeTemplateEngine = function() {
            this['allowTemplateRewriting'] = false;
          };
          ko.nativeTemplateEngine.prototype = new ko.templateEngine();
          ko.nativeTemplateEngine.prototype.constructor = ko.nativeTemplateEngine;
          ko.nativeTemplateEngine.prototype['renderTemplateSource'] = function(templateSource, bindingContext, options) {
            var useNodesIfAvailable = !(ko.utils.ieVersion < 9),
                templateNodesFunc = useNodesIfAvailable ? templateSource['nodes'] : null,
                templateNodes = templateNodesFunc ? templateSource['nodes']() : null;
            if (templateNodes) {
              return ko.utils.makeArray(templateNodes.cloneNode(true).childNodes);
            } else {
              var templateText = templateSource['text']();
              return ko.utils.parseHtmlFragment(templateText);
            }
          };
          ko.nativeTemplateEngine.instance = new ko.nativeTemplateEngine();
          ko.setTemplateEngine(ko.nativeTemplateEngine.instance);
          ko.exportSymbol('nativeTemplateEngine', ko.nativeTemplateEngine);
          (function() {
            ko.jqueryTmplTemplateEngine = function() {
              var jQueryTmplVersion = this.jQueryTmplVersion = (function() {
                if (!jQueryInstance || !(jQueryInstance['tmpl']))
                  return 0;
                try {
                  if (jQueryInstance['tmpl']['tag']['tmpl']['open'].toString().indexOf('__') >= 0) {
                    return 2;
                  }
                } catch (ex) {}
                return 1;
              })();
              function ensureHasReferencedJQueryTemplates() {
                if (jQueryTmplVersion < 2)
                  throw new Error("Your version of jQuery.tmpl is too old. Please upgrade to jQuery.tmpl 1.0.0pre or later.");
              }
              function executeTemplate(compiledTemplate, data, jQueryTemplateOptions) {
                return jQueryInstance['tmpl'](compiledTemplate, data, jQueryTemplateOptions);
              }
              this['renderTemplateSource'] = function(templateSource, bindingContext, options) {
                options = options || {};
                ensureHasReferencedJQueryTemplates();
                var precompiled = templateSource['data']('precompiled');
                if (!precompiled) {
                  var templateText = templateSource['text']() || "";
                  templateText = "{{ko_with $item.koBindingContext}}" + templateText + "{{/ko_with}}";
                  precompiled = jQueryInstance['template'](null, templateText);
                  templateSource['data']('precompiled', precompiled);
                }
                var data = [bindingContext['$data']];
                var jQueryTemplateOptions = jQueryInstance['extend']({'koBindingContext': bindingContext}, options['templateOptions']);
                var resultNodes = executeTemplate(precompiled, data, jQueryTemplateOptions);
                resultNodes['appendTo'](document.createElement("div"));
                jQueryInstance['fragments'] = {};
                return resultNodes;
              };
              this['createJavaScriptEvaluatorBlock'] = function(script) {
                return "{{ko_code ((function() { return " + script + " })()) }}";
              };
              this['addTemplate'] = function(templateName, templateMarkup) {
                document.write("<script type='text/html' id='" + templateName + "'>" + templateMarkup + "<" + "/script>");
              };
              if (jQueryTmplVersion > 0) {
                jQueryInstance['tmpl']['tag']['ko_code'] = {open: "__.push($1 || '');"};
                jQueryInstance['tmpl']['tag']['ko_with'] = {
                  open: "with($1) {",
                  close: "} "
                };
              }
            };
            ko.jqueryTmplTemplateEngine.prototype = new ko.templateEngine();
            ko.jqueryTmplTemplateEngine.prototype.constructor = ko.jqueryTmplTemplateEngine;
            var jqueryTmplTemplateEngineInstance = new ko.jqueryTmplTemplateEngine();
            if (jqueryTmplTemplateEngineInstance.jQueryTmplVersion > 0)
              ko.setTemplateEngine(jqueryTmplTemplateEngineInstance);
            ko.exportSymbol('jqueryTmplTemplateEngine', ko.jqueryTmplTemplateEngine);
          })();
        }));
      }());
    })();
  })(require("github:jspm/nodelibs-process@0.1.0"));
  global.define = __define;
  return module.exports;
});



System.register("npm:debug@2.1.1", ["npm:debug@2.1.1/browser"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:debug@2.1.1/browser");
  global.define = __define;
  return module.exports;
});



System.register("npm:knockout@3.2.0", ["npm:knockout@3.2.0/build/output/knockout-latest.debug"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:knockout@3.2.0/build/output/knockout-latest.debug");
  global.define = __define;
  return module.exports;
});



System.register("npm:jsonp@0.1.0/index", ["npm:debug@2.1.1"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var debug = require("npm:debug@2.1.1")('jsonp');
  module.exports = jsonp;
  var count = 0;
  function noop() {}
  function jsonp(url, opts, fn) {
    if ('function' == typeof opts) {
      fn = opts;
      opts = {};
    }
    if (!opts)
      opts = {};
    var prefix = opts.prefix || '__jp';
    var param = opts.param || 'callback';
    var timeout = null != opts.timeout ? opts.timeout : 60000;
    var enc = encodeURIComponent;
    var target = document.getElementsByTagName('script')[0] || document.head;
    var script;
    var timer;
    var id = prefix + (count++);
    if (timeout) {
      timer = setTimeout(function() {
        cleanup();
        if (fn)
          fn(new Error('Timeout'));
      }, timeout);
    }
    function cleanup() {
      if (script.parentNode)
        script.parentNode.removeChild(script);
      window[id] = noop;
      if (timer)
        clearTimeout(timer);
    }
    function cancel() {
      if (window[id]) {
        cleanup();
      }
    }
    window[id] = function(data) {
      debug('jsonp got', data);
      cleanup();
      if (fn)
        fn(null, data);
    };
    url += (~url.indexOf('?') ? '&' : '?') + param + '=' + enc(id);
    url = url.replace('?&', '?');
    debug('jsonp req "%s"', url);
    script = document.createElement('script');
    script.src = url;
    target.parentNode.insertBefore(script, target);
    return cancel;
  }
  global.define = __define;
  return module.exports;
});



System.register("npm:jsonp@0.1.0", ["npm:jsonp@0.1.0/index"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:jsonp@0.1.0/index");
  global.define = __define;
  return module.exports;
});



System.register("lib/locationService", ["npm:jsonp@0.1.0", "npm:format@0.2.1", "lib/constants"], function($__export) {
  "use strict";
  var __moduleName = "lib/locationService";
  var jsonp,
      format,
      Constants,
      LocationService;
  return {
    setters: [function(m) {
      jsonp = m.default;
    }, function(m) {
      format = m.default;
    }, function(m) {
      Constants = m;
    }],
    execute: function() {
      LocationService = (function() {
        var LocationService = function LocationService(bingKey) {
          this.bingKey = bingKey;
        };
        return ($traceurRuntime.createClass)(LocationService, {
          getGeolocation: function() {
            return new Promise((function(resolve, reject) {
              navigator.geolocation.getCurrentPosition((function(location) {
                var loc = {
                  log: location.coords.longitude,
                  lat: location.coords.latitude
                };
                resolve(loc);
              }), reject, null);
            }));
          },
          getAddress: function(location) {
            var $__0 = this;
            return new Promise((function(resolve, reject) {
              var url = format(Constants.BING_URL, location.lat, location.log, $__0.bingKey);
              jsonp(url, {param: 'jsonp'}, (function(err, data) {
                if (err)
                  reject(err);
                var set = data.resourceSets;
                if (!set || set.length < 1)
                  resolve(null);
                var resources = set[0].resources;
                if (!resources || resources.length < 1)
                  resolve(null);
                var address = resources[0].address;
                if (!address)
                  resolve(null);
                resolve(address);
              }));
            }));
          }
        }, {});
      }());
      $__export('default', LocationService);
    }
  };
});



System.register("app", ["github:components/jquery@2.1.3", "npm:knockout@3.2.0", "lib/constants", "lib/locationService", "lib/forecastService", "lib/storageService", "lib/photoService"], function($__export) {
  "use strict";
  var __moduleName = "app";
  var $,
      ko,
      Constants,
      LocationService,
      ForecastService,
      StorageService,
      PhotoService,
      AppViewModel;
  return {
    setters: [function(m) {
      $ = m.default;
    }, function(m) {
      ko = m.default;
    }, function(m) {
      Constants = m;
    }, function(m) {
      LocationService = m.default;
    }, function(m) {
      ForecastService = m.default;
    }, function(m) {
      StorageService = m.default;
    }, function(m) {
      PhotoService = m.default;
    }],
    execute: function() {
      AppViewModel = (function() {
        var AppViewModel = function AppViewModel() {
          var $__0 = this;
          this.isBusy = ko.observable(false);
          this.todaysLow = ko.observable(0.0);
          this.tomorrowsLow = ko.observable(0.0);
          this.freeze = ko.observable('');
          this.city = ko.observable('your town');
          this.photo = ko.observable('');
          this.photoCss = ko.computed((function() {
            return ("url(" + $__0.photo() + ")");
          }));
          this.load();
        };
        return ($traceurRuntime.createClass)(AppViewModel, {
          getRandomInt: function(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
          },
          pickRandomPhoto: function(photos) {
            var index = this.getRandomInt(0, photos.length);
            return photos[index];
          },
          populate: function(address, forecast, photos) {
            if (address)
              this.city(address.locality);
            if (forecast) {
              var today = forecast.daily.data[0];
              var tomorrow = forecast.daily.data[1];
              var todayText = (Math.floor(today.temperatureMin) + "<sub>&deg;</sub>");
              var tomorrowText = (Math.floor(tomorrow.temperatureMin) + "<sub>&deg;</sub>");
              this.todaysLow(todayText);
              this.tomorrowsLow(tomorrowText);
              if (today.temperatureMin < 32 || tomorrow.temperatureMin < 32)
                this.freeze('Yes');
              else
                this.freeze('No');
            }
            if (photos) {
              var photo = this.pickRandomPhoto(photos);
              if (photo) {
                var photoService = new PhotoService(Constants.FLICKR_KEY);
                var photoUrl = photoService.getPhotoUrl(photo);
                this.photo(photoUrl);
              }
            }
            this.isBusy(false);
          },
          refresh: function() {
            var storageService = new StorageService(Constants.LOCAL_STORAGE_EXPIRATION);
            storageService.remove(Constants.SAVED_ADDRESS_KEY);
            storageService.remove(Constants.SAVED_FORECAST_KEY);
            storageService.remove(Constants.SAVED_PHOTOS_KEY);
            this.load();
          },
          load: function() {
            var $__0 = this;
            this.isBusy(true);
            var storageService = new StorageService(Constants.LOCAL_STORAGE_EXPIRATION);
            var savedAddress = storageService.get(Constants.SAVED_ADDRESS_KEY);
            var savedForecast = storageService.get(Constants.SAVED_FORECAST_KEY);
            var savedPhotos = storageService.get(Constants.SAVED_PHOTOS_KEY);
            if (savedAddress && savedForecast && savedPhotos) {
              this.populate(savedAddress, savedForecast, savedPhotos);
              return;
            }
            var locationService = new LocationService(Constants.BING_KEY);
            var forecastService = new ForecastService(Constants.FORECAST_KEY);
            var photoService = new PhotoService(Constants.FLICKR_KEY);
            locationService.getGeolocation().then((function(location) {
              var forecastTask = forecastService.getForecast(location);
              var addressTask = locationService.getAddress(location);
              var photoTask = photoService.getPhotos(location);
              return Promise.all([addressTask, forecastTask, photoTask]);
            })).then((function(data) {
              var address = data[0];
              var forecast = data[1];
              var photos = data[2];
              if (address)
                storageService.set(Constants.SAVED_ADDRESS_KEY, address);
              if (forecast)
                storageService.set(Constants.SAVED_FORECAST_KEY, forecast);
              if (photos)
                storageService.set(Constants.SAVED_PHOTOS_KEY, photos);
              $__0.populate(address, forecast, photos);
            }));
          }
        }, {});
      }());
      ko.bindingHandlers.fadeVisible = {
        init: function(element, valueAccessor) {
          var value = valueAccessor();
          $(element).toggle(ko.unwrap(value));
        },
        update: function(element, valueAccessor) {
          var value = valueAccessor();
          ko.unwrap(value) ? $(element).fadeIn() : $(element).fadeOut();
        }
      };
      $((function() {
        ko.applyBindings(new AppViewModel());
      }));
    }
  };
});




});
//# sourceMappingURL=build.js.map