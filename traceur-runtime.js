!function(a){"use strict";function b(a){return{configurable:!0,enumerable:!1,value:a,writable:!0}}function c(){return"__$"+Math.floor(1e9*Math.random())+"$"+ ++S+"$__"}function d(a){return X[a]}function e(){var a=c();return X[a]=!0,a}function f(a){return"object"==typeof a&&a instanceof i}function g(a){return f(a)?"symbol":typeof a}function h(a){var b=new i(a);if(!(this instanceof h))return b;throw new TypeError("Symbol cannot be new'ed")}function i(a){var b=c();I(this,V,{value:this}),I(this,T,{value:b}),I(this,U,{value:a}),k(this),W[b]=this}function j(a){var b=a[Y];return b&&b.self===a?b:Q(a)?($.hash.value=_++,$.self.value=a,Z.value=G(null,$),I(a,Y,Z),Z.value):void 0}function k(a){return j(a),J.apply(this,arguments)}function l(a){return j(a),O.apply(this,arguments)}function m(a){return j(a),P.apply(this,arguments)}function n(a){return W[a]||X[a]}function o(a){return f(a)?a[T]:a}function p(a){for(var b=[],c=0;c<a.length;c++)n(a[c])||b.push(a[c]);return b}function q(a){return p(L(a))}function r(a){return p(M(a))}function s(a){for(var b=[],c=L(a),d=0;d<c.length;d++){var e=W[c[d]];e&&b.push(e)}return b}function t(a,b){return K(a,o(b))}function u(a){return N.call(this,o(a))}function v(b){return a.traceur&&a.traceur.options[b]}function w(a,b,c){return f(b)&&(b=b[T]),I(a,b,c),a}function x(a){I(a,"defineProperty",{value:w}),I(a,"getOwnPropertyNames",{value:q}),I(a,"getOwnPropertyDescriptor",{value:t}),I(a.prototype,"hasOwnProperty",{value:u}),I(a,"freeze",{value:k}),I(a,"preventExtensions",{value:l}),I(a,"seal",{value:m}),I(a,"keys",{value:r})}function y(a){for(var b=1;b<arguments.length;b++)for(var c=L(arguments[b]),d=0;d<c.length;d++){var e=c[d];n(e)||!function(b,c){I(a,c,{get:function(){return b[c]},enumerable:!0})}(arguments[b],c[d])}return a}function z(a){return null!=a&&("object"==typeof a||"function"==typeof a)}function A(a){if(null==a)throw F();return E(a)}function B(a){if(null==a)throw new TypeError("Value cannot be converted to an Object");return a}function C(a,b){a.Symbol||(a.Symbol=b,Object.getOwnPropertySymbols=s),a.Symbol.iterator||(a.Symbol.iterator=b("Symbol.iterator"))}function D(a){C(a,h),a.Reflect=a.Reflect||{},a.Reflect.global=a.Reflect.global||a,x(a.Object)}if(!a.$traceurRuntime){var E=Object,F=TypeError,G=E.create,H=E.defineProperties,I=E.defineProperty,J=E.freeze,K=E.getOwnPropertyDescriptor,L=E.getOwnPropertyNames,M=E.keys,N=E.prototype.hasOwnProperty,O=(E.prototype.toString,Object.preventExtensions),P=Object.seal,Q=Object.isExtensible,R=b,S=0,T=c(),U=c(),V=c(),W=G(null),X=G(null);I(h.prototype,"constructor",b(h)),I(h.prototype,"toString",R(function(){var a=this[V];if(!v("symbols"))return a[T];if(!a)throw TypeError("Conversion from symbol to string");var b=a[U];return void 0===b&&(b=""),"Symbol("+b+")"})),I(h.prototype,"valueOf",R(function(){var a=this[V];if(!a)throw TypeError("Conversion from symbol to string");return v("symbols")?a:a[T]})),I(i.prototype,"constructor",b(h)),I(i.prototype,"toString",{value:h.prototype.toString,enumerable:!1}),I(i.prototype,"valueOf",{value:h.prototype.valueOf,enumerable:!1});var Y=e(),Z={value:void 0},$={hash:{value:void 0},self:{value:void 0}},_=0;k(i.prototype),D(a),a.$traceurRuntime={checkObjectCoercible:B,createPrivateName:e,defineProperties:H,defineProperty:I,exportStar:y,getOwnHashObject:j,getOwnPropertyDescriptor:K,getOwnPropertyNames:L,isObject:z,isPrivateName:d,isSymbolString:n,keys:M,setupGlobals:D,toObject:A,toProperty:o,"typeof":g}}}("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this),function(){"use strict";function a(a,c){function d(a){return"/"===a.slice(-1)}function e(a){return"/"===a[0]}function f(a){return"."===a[0]}return b=b||"undefined"!=typeof require&&require("path"),d(c)||e(c)?void 0:require(f(c)?b.resolve(b.dirname(a),c):c)}var b;$traceurRuntime.require=a}(),function(){"use strict";function a(){for(var a,b=[],c=0,d=0;d<arguments.length;d++){var e=$traceurRuntime.checkObjectCoercible(arguments[d]);if("function"!=typeof e[$traceurRuntime.toProperty(Symbol.iterator)])throw new TypeError("Cannot spread non-iterable object.");for(var f=e[$traceurRuntime.toProperty(Symbol.iterator)]();!(a=f.next()).done;)b[c++]=a.value}return b}$traceurRuntime.spread=a}(),function(){"use strict";function a(a,b){var c=p(a);do{var d=o(c,b);if(d)return d;c=p(c)}while(c);return void 0}function b(a){return a.__proto__}function c(a,b,c,e){return d(a,b,c).apply(a,e)}function d(b,c,d){var e=a(c,d);return e?e.get?e.get.call(b):e.value:void 0}function e(b,c,d,e){var f=a(c,d);if(f&&f.set)return f.set.call(b,e),e;throw k("super has no setter '"+d+"'.")}function f(a){for(var b={},c=r(a),d=0;d<c.length;d++){var e=c[d];b[e]=o(a,e)}for(var f=s(a),d=0;d<f.length;d++){var g=f[d];b[$traceurRuntime.toProperty(g)]=o(a,$traceurRuntime.toProperty(g))}return b}function g(a,b,c,d){return n(b,"constructor",{value:a,configurable:!0,enumerable:!1,writable:!0}),arguments.length>3?("function"==typeof d&&(a.__proto__=d),a.prototype=l(h(d),f(b))):a.prototype=b,n(a,"prototype",{configurable:!1,writable:!1}),m(a,f(c))}function h(a){if("function"==typeof a){var b=a.prototype;if(j(b)===b||null===b)return a.prototype;throw new k("super prototype must be an Object or null")}if(null===a)return null;throw new k("Super expression must either be null or a function, not "+typeof a+".")}function i(a,b,d){null!==p(b)&&c(a,b,"constructor",d)}var j=Object,k=TypeError,l=j.create,m=$traceurRuntime.defineProperties,n=$traceurRuntime.defineProperty,o=$traceurRuntime.getOwnPropertyDescriptor,p=($traceurRuntime.getOwnPropertyNames,Object.getPrototypeOf),q=Object,r=q.getOwnPropertyNames,s=q.getOwnPropertySymbols;$traceurRuntime.createClass=g,$traceurRuntime.defaultSuperCall=i,$traceurRuntime.superCall=c,$traceurRuntime.superConstructor=b,$traceurRuntime.superGet=d,$traceurRuntime.superSet=e}(),function(){"use strict";function a(a){return{configurable:!0,enumerable:!1,value:a,writable:!0}}function b(a){return new Error("Traceur compiler bug: invalid state in state machine: "+a)}function c(){this.state=0,this.GState=r,this.storedException=void 0,this.finallyFallThrough=void 0,this.sent_=void 0,this.returnValue=void 0,this.tryStack_=[]}function d(a,b,c,d){switch(a.GState){case s:throw new Error('"'+c+'" on executing generator');case u:if("next"==c)return{value:void 0,done:!0};throw d;case r:if("throw"===c)throw a.GState=u,d;if(void 0!==d)throw q("Sent value to newborn generator");case t:a.GState=s,a.action=c,a.sent=d;var e=b(a),f=e===a;return f&&(e=a.returnValue),a.GState=f?u:t,{value:e,done:f}}}function e(){}function f(){}function g(a,b,d){var e=k(a,d),f=new c,g=p(b.prototype);return g[x]=f,g[y]=e,g}function h(a){return a.prototype=p(f.prototype),a.__proto__=f,a}function i(){c.call(this),this.err=void 0;var a=this;a.result=new Promise(function(b,c){a.resolve=b,a.reject=c})}function j(a,b){var c=k(a,b),d=new i;return d.createCallback=function(a){return function(b){d.state=a,d.value=b,c(d)}},d.errback=function(a){l(d,a),c(d)},c(d),d.result}function k(a,b){return function(c){for(;;)try{return a.call(b,c)}catch(d){l(c,d)}}}function l(a,b){a.storedException=b;var c=a.tryStack_[a.tryStack_.length-1];return c?(a.state=void 0!==c.catch?c.catch:c.finally,void(void 0!==c.finallyFallThrough&&(a.finallyFallThrough=c.finallyFallThrough))):void a.handleException(b)}if("object"!=typeof $traceurRuntime)throw new Error("traceur runtime not found.");var m=$traceurRuntime.createPrivateName,n=$traceurRuntime.defineProperties,o=$traceurRuntime.defineProperty,p=Object.create,q=TypeError,r=0,s=1,t=2,u=3,v=-2,w=-3;c.prototype={pushTry:function(a,b){if(null!==b){for(var c=null,d=this.tryStack_.length-1;d>=0;d--)if(void 0!==this.tryStack_[d].catch){c=this.tryStack_[d].catch;break}null===c&&(c=w),this.tryStack_.push({"finally":b,finallyFallThrough:c})}null!==a&&this.tryStack_.push({"catch":a})},popTry:function(){this.tryStack_.pop()},get sent(){return this.maybeThrow(),this.sent_},set sent(a){this.sent_=a},get sentIgnoreThrow(){return this.sent_},maybeThrow:function(){if("throw"===this.action)throw this.action="next",this.sent_},end:function(){switch(this.state){case v:return this;case w:throw this.storedException;default:throw b(this.state)}},handleException:function(a){throw this.GState=u,this.state=v,a}};var x=m(),y=m();e.prototype=f,o(f,"constructor",a(e)),f.prototype={constructor:f,next:function(a){return d(this[x],this[y],"next",a)},"throw":function(a){return d(this[x],this[y],"throw",a)}},n(f.prototype,{constructor:{enumerable:!1},next:{enumerable:!1},"throw":{enumerable:!1}}),Object.defineProperty(f.prototype,Symbol.iterator,a(function(){return this})),i.prototype=p(c.prototype),i.prototype.end=function(){switch(this.state){case v:this.resolve(this.returnValue);break;case w:this.reject(this.storedException);break;default:this.reject(b(this.state))}},i.prototype.handleException=function(){this.state=w},$traceurRuntime.asyncWrap=j,$traceurRuntime.initGeneratorFunction=h,$traceurRuntime.createGeneratorInstance=g}(),function(){function a(a,b,c,d,e,f,g){var h=[];return a&&h.push(a,":"),c&&(h.push("//"),b&&h.push(b,"@"),h.push(c),d&&h.push(":",d)),e&&h.push(e),f&&h.push("?",f),g&&h.push("#",g),h.join("")}function b(a){return a.match(h)}function c(a){if("/"===a)return"/";for(var b="/"===a[0]?"/":"",c="/"===a.slice(-1)?"/":"",d=a.split("/"),e=[],f=0,g=0;g<d.length;g++){var h=d[g];switch(h){case"":case".":break;case"..":e.length?e.pop():f++;break;default:e.push(h)}}if(!b){for(;f-->0;)e.unshift("..");0===e.length&&e.push(".")}return b+e.join("/")+c}function d(b){var d=b[i.PATH]||"";return d=c(d),b[i.PATH]=d,a(b[i.SCHEME],b[i.USER_INFO],b[i.DOMAIN],b[i.PORT],b[i.PATH],b[i.QUERY_DATA],b[i.FRAGMENT])}function e(a){var c=b(a);return d(c)}function f(a,c){var e=b(c),f=b(a);if(e[i.SCHEME])return d(e);e[i.SCHEME]=f[i.SCHEME];for(var g=i.SCHEME;g<=i.PORT;g++)e[g]||(e[g]=f[g]);if("/"==e[i.PATH][0])return d(e);var h=f[i.PATH],j=h.lastIndexOf("/");return h=h.slice(0,j+1)+e[i.PATH],e[i.PATH]=h,d(e)}function g(a){if(!a)return!1;if("/"===a[0])return!0;var c=b(a);return c[i.SCHEME]?!0:!1}var h=new RegExp("^(?:([^:/?#.]+):)?(?://(?:([^/?#]*)@)?([\\w\\d\\-\\u0100-\\uffff.%]*)(?::([0-9]+))?)?([^?#]+)?(?:\\?([^#]*))?(?:#(.*))?$"),i={SCHEME:1,USER_INFO:2,DOMAIN:3,PORT:4,PATH:5,QUERY_DATA:6,FRAGMENT:7};$traceurRuntime.canonicalizeUrl=e,$traceurRuntime.isAbsolute=g,$traceurRuntime.removeDotSegments=c,$traceurRuntime.resolveUrl=f}(),function(){"use strict";function a(a){for(var b=[],e=1;e<arguments.length;e++)b[e-1]=arguments[e];var f=d,g=$traceurRuntime.getOwnHashObject(a).hash;f[g]||(f[g]=Object.create(null)),f=f[g];for(var h=0;h<b.length-1;h++)g=$traceurRuntime.getOwnHashObject(b[h]).hash,f[g]||(f[g]=Object.create(null)),f=f[g];var i=b[b.length-1];return g=$traceurRuntime.getOwnHashObject(i).hash,f[g]||(f[g]=new c(a,b)),f[g]}var b={any:{name:"any"},"boolean":{name:"boolean"},number:{name:"number"},string:{name:"string"},symbol:{name:"symbol"},"void":{name:"void"}},c=function(a,b){this.type=a,this.argumentTypes=b};$traceurRuntime.createClass(c,{},{});var d=Object.create(null);$traceurRuntime.GenericType=c,$traceurRuntime.genericType=a,$traceurRuntime.type=b}(),function(a){"use strict";function b(a,b){var c=[],d=b-3;0>d&&(d=0);for(var e=d;b>e;e++)c.push(a[e]);return c}function c(a,b){var c=b+1;c>a.length-1&&(c=a.length-1);for(var d=[],e=b;c>=e;e++)d.push(a[e]);return d}function d(a){for(var b="",c=0;a-1>c;c++)b+="-";return b}function e(a){if(a){var b=t.normalize(a);return l[b]}}function f(a){var b=arguments[1],c=Object.create(null);return Object.getOwnPropertyNames(a).forEach(function(d){var e,f;if(b===s){var g=Object.getOwnPropertyDescriptor(a,d);g.get&&(e=g.get)}e||(f=a[d],e=function(){return f}),Object.defineProperty(c,d,{get:e,enumerable:!0})}),Object.preventExtensions(c),c}var g,h=$traceurRuntime,i=h.canonicalizeUrl,j=h.resolveUrl,k=h.isAbsolute,l=Object.create(null);g=a.location&&a.location.href?j(a.location.href,"./"):"";var m=function(a,b){this.url=a,this.value_=b};$traceurRuntime.createClass(m,{},{});var n=function(a,b){this.message=this.constructor.name+": "+this.stripCause(b)+" in "+a,this.stack=b instanceof o||!b.stack?"":this.stripStack(b.stack)},o=n;$traceurRuntime.createClass(n,{stripError:function(a){return a.replace(/.*Error:/,this.constructor.name+":")},stripCause:function(a){return a?a.message?this.stripError(a.message):a+"":""},loadedBy:function(a){this.stack+="\n loaded by "+a},stripStack:function(a){var b=[];return a.split("\n").some(function(a){return/UncoatedModuleInstantiator/.test(a)?!0:void b.push(a)}),b[0]=this.stripError(b[0]),b.join("\n")}},{},Error);var p=function(a,b){$traceurRuntime.superConstructor(q).call(this,a,null),this.func=b},q=p;$traceurRuntime.createClass(p,{getUncoatedModule:function(){if(this.value_)return this.value_;try{var e;return void 0!==typeof $traceurRuntime&&(e=$traceurRuntime.require.bind(null,this.url)),this.value_=this.func.call(a,e)}catch(f){if(f instanceof n)throw f.loadedBy(this.url),f;if(f.stack){var g=this.func.toString().split("\n"),h=[];f.stack.split("\n").some(function(a){if(a.indexOf("UncoatedModuleInstantiator.getUncoatedModule")>0)return!0;var e=/(at\s[^\s]*\s).*>:(\d*):(\d*)\)/.exec(a);if(e){var f=parseInt(e[2],10);h=h.concat(b(g,f)),h.push(d(e[3])+"^"),h=h.concat(c(g,f)),h.push("= = = = = = = = =")}else h.push(a)}),f.stack=h.join("\n")}throw new n(this.url,f)}}},{},m);var r=Object.create(null),s={},t={normalize:function(a,b){if("string"!=typeof a)throw new TypeError("module name must be a string, not "+typeof a);if(k(a))return i(a);if(/[^\.]\/\.\.\//.test(a))throw new Error("module name embeds /../: "+a);return"."===a[0]&&b?j(b,a):i(a)},get:function(a){var b=e(a);if(!b)return void 0;var c=r[b.url];return c?c:(c=f(b.getUncoatedModule(),s),r[b.url]=c)},set:function(a,b){a=String(a),l[a]=new p(a,function(){return b}),r[a]=b},get baseURL(){return g},set baseURL(a){g=String(a)},registerModule:function(a,b,c){var d=t.normalize(a);if(l[d])throw new Error("duplicate module named "+d);l[d]=new p(d,c)},bundleStore:Object.create(null),register:function(a,b,c){b&&(b.length||c.length)?this.bundleStore[a]={deps:b,execute:function(){var a=arguments,d={};b.forEach(function(b,c){return d[b]=a[c]});var e=c.call(this,d);return e.execute.call(this),e.exports}}:this.registerModule(a,b,c)},getAnonymousModule:function(b){return new f(b.call(a),s)},getForTesting:function(a){var b=this;return this.testingPrefix_||Object.keys(r).some(function(a){var c=/(traceur@[^\/]*\/)/.exec(a);return c?(b.testingPrefix_=c[1],!0):void 0}),this.get(this.testingPrefix_+a)}},u=new f({ModuleStore:t});t.set("@traceur/src/runtime/ModuleStore",u),t.set("@traceur/src/runtime/ModuleStore.js",u);var v=$traceurRuntime.setupGlobals;$traceurRuntime.setupGlobals=function(a){v(a)},$traceurRuntime.ModuleStore=t,a.System={register:t.register.bind(t),registerModule:t.registerModule.bind(t),get:t.get,set:t.set,normalize:t.normalize},$traceurRuntime.getModuleImpl=function(a){var b=e(a);return b&&b.getUncoatedModule()}}("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js",[],function(){"use strict";function a(a){return a>>>0}function b(a){return a&&("object"==typeof a||"function"==typeof a)}function c(a){return"function"==typeof a}function d(a){return"number"==typeof a}function e(a){return a=+a,u(a)?0:0!==a&&t(a)?a>0?s(a):r(a):a}function f(a){var b=e(a);return 0>b?0:w(b,y)}function g(a){return b(a)?a[Symbol.iterator]:void 0}function h(a){return c(a)}function i(a,b){return{value:a,done:b}}function j(a,b,c){b in a||Object.defineProperty(a,b,c)}function k(a,b,c){j(a,b,{value:c,configurable:!0,enumerable:!1,writable:!0})}function l(a,b,c){j(a,b,{value:c,configurable:!1,enumerable:!1,writable:!1})}function m(a,b){for(var c=0;c<b.length;c+=2){var d=b[c],e=b[c+1];k(a,d,e)}}function n(a,b){for(var c=0;c<b.length;c+=2){var d=b[c],e=b[c+1];l(a,d,e)}}function o(a,b,c){c&&c.iterator&&!a[c.iterator]&&(a["@@iterator"]&&(b=a["@@iterator"]),Object.defineProperty(a,c.iterator,{value:b,configurable:!0,enumerable:!1,writable:!0}))}function p(a){z.push(a)}function q(a){z.forEach(function(b){return b(a)})}var r=Math.ceil,s=Math.floor,t=isFinite,u=isNaN,v=Math.pow,w=Math.min,x=$traceurRuntime.toObject,y=v(2,53)-1,z=[];return{get toObject(){return x},get toUint32(){return a},get isObject(){return b},get isCallable(){return c},get isNumber(){return d},get toInteger(){return e},get toLength(){return f},get checkIterable(){return g},get isConstructor(){return h},get createIteratorResultObject(){return i},get maybeDefine(){return j},get maybeDefineMethod(){return k},get maybeDefineConst(){return l},get maybeAddFunctions(){return m},get maybeAddConsts(){return n},get maybeAddIterator(){return o},get registerPolyfill(){return p},get polyfillAll(){return q}}}),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Map.js",[],function(){"use strict";function a(a,b){if(e(b)){var c=h(b);return c&&a.objectIndex_[c.hash]}return"string"==typeof b?a.stringIndex_[b]:a.primitiveIndex_[b]}function b(a){a.entries_=[],a.objectIndex_=Object.create(null),a.stringIndex_=Object.create(null),a.primitiveIndex_=Object.create(null),a.deletedCount_=0}function c(a){var b=a,c=b.Object,d=b.Symbol;a.Map||(a.Map=k);var e=a.Map.prototype;void 0===e.entries&&(a.Map=k),e.entries&&(f(e,e.entries,d),f(c.getPrototypeOf((new a.Map).entries()),function(){return this},d))}var d=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),e=d.isObject,f=d.maybeAddIterator,g=d.registerPolyfill,h=$traceurRuntime.getOwnHashObject,i=Object.prototype.hasOwnProperty,j={},k=function(){var a=arguments[0];if(!e(this))throw new TypeError("Map called on incompatible type");if(i.call(this,"entries_"))throw new TypeError("Map can not be reentrantly initialised");if(b(this),null!==a&&void 0!==a)for(var c,d=a[$traceurRuntime.toProperty(Symbol.iterator)]();!(c=d.next()).done;){var f=c.value,g=f[0],h=f[1];this.set(g,h)}};return $traceurRuntime.createClass(k,{get size(){return this.entries_.length/2-this.deletedCount_},get:function(b){var c=a(this,b);return void 0!==c?this.entries_[c+1]:void 0},set:function(b,c){var d=e(b),f="string"==typeof b,g=a(this,b);if(void 0!==g)this.entries_[g+1]=c;else if(g=this.entries_.length,this.entries_[g]=b,this.entries_[g+1]=c,d){var i=h(b),j=i.hash;this.objectIndex_[j]=g}else f?this.stringIndex_[b]=g:this.primitiveIndex_[b]=g;return this},has:function(b){return void 0!==a(this,b)},"delete":function(a){var b,c,d=e(a),f="string"==typeof a;if(d){var g=h(a);g&&(b=this.objectIndex_[c=g.hash],delete this.objectIndex_[c])}else f?(b=this.stringIndex_[a],delete this.stringIndex_[a]):(b=this.primitiveIndex_[a],delete this.primitiveIndex_[a]);return void 0!==b?(this.entries_[b]=j,this.entries_[b+1]=void 0,this.deletedCount_++,!0):!1},clear:function(){b(this)},forEach:function(a){for(var b=arguments[1],c=0;c<this.entries_.length;c+=2){var d=this.entries_[c],e=this.entries_[c+1];d!==j&&a.call(b,e,d,this)}},entries:$traceurRuntime.initGeneratorFunction(function l(){var a,b,c;return $traceurRuntime.createGeneratorInstance(function(d){for(;;)switch(d.state){case 0:a=0,d.state=12;break;case 12:d.state=a<this.entries_.length?8:-2;break;case 4:a+=2,d.state=12;break;case 8:b=this.entries_[a],c=this.entries_[a+1],d.state=9;break;case 9:d.state=b===j?4:6;break;case 6:return d.state=2,[b,c];case 2:d.maybeThrow(),d.state=4;break;default:return d.end()}},l,this)}),keys:$traceurRuntime.initGeneratorFunction(function m(){var a,b,c;return $traceurRuntime.createGeneratorInstance(function(d){for(;;)switch(d.state){case 0:a=0,d.state=12;break;case 12:d.state=a<this.entries_.length?8:-2;break;case 4:a+=2,d.state=12;break;case 8:b=this.entries_[a],c=this.entries_[a+1],d.state=9;break;case 9:d.state=b===j?4:6;break;case 6:return d.state=2,b;case 2:d.maybeThrow(),d.state=4;break;default:return d.end()}},m,this)}),values:$traceurRuntime.initGeneratorFunction(function n(){var a,b,c;return $traceurRuntime.createGeneratorInstance(function(d){for(;;)switch(d.state){case 0:a=0,d.state=12;break;case 12:d.state=a<this.entries_.length?8:-2;break;case 4:a+=2,d.state=12;break;case 8:b=this.entries_[a],c=this.entries_[a+1],d.state=9;break;case 9:d.state=b===j?4:6;break;case 6:return d.state=2,c;case 2:d.maybeThrow(),d.state=4;break;default:return d.end()}},n,this)})},{}),Object.defineProperty(k.prototype,Symbol.iterator,{configurable:!0,writable:!0,value:k.prototype.entries}),g(c),{get Map(){return k},get polyfillMap(){return c}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Map.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Set.js",[],function(){"use strict";function a(a){a.map_=new g}function b(a){var b=a,c=b.Object,d=b.Symbol;a.Set||(a.Set=i);var f=a.Set.prototype;f.values&&(e(f,f.values,d),e(c.getPrototypeOf((new a.Set).values()),function(){return this},d))}var c=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),d=c.isObject,e=c.maybeAddIterator,f=c.registerPolyfill,g=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Map.js").Map,h=($traceurRuntime.getOwnHashObject,Object.prototype.hasOwnProperty),i=function(){var b=arguments[0];if(!d(this))throw new TypeError("Set called on incompatible type");if(h.call(this,"map_"))throw new TypeError("Set can not be reentrantly initialised");if(a(this),null!==b&&void 0!==b)for(var c,e=b[$traceurRuntime.toProperty(Symbol.iterator)]();!(c=e.next()).done;){var f=c.value;this.add(f)}};return $traceurRuntime.createClass(i,{get size(){return this.map_.size},has:function(a){return this.map_.has(a)},add:function(a){return this.map_.set(a,a),this},"delete":function(a){return this.map_.delete(a)},clear:function(){return this.map_.clear()},forEach:function(a){var b=arguments[1],c=this;return this.map_.forEach(function(d,e){a.call(b,e,e,c)})},values:$traceurRuntime.initGeneratorFunction(function j(){var a,b;return $traceurRuntime.createGeneratorInstance(function(c){for(;;)switch(c.state){case 0:a=this.map_.keys()[Symbol.iterator](),c.sent=void 0,c.action="next",c.state=12;break;case 12:b=a[c.action](c.sentIgnoreThrow),c.state=9;break;case 9:c.state=b.done?3:2;break;case 3:c.sent=b.value,c.state=-2;break;case 2:return c.state=12,b.value;default:return c.end()}},j,this)}),entries:$traceurRuntime.initGeneratorFunction(function k(){var a,b;return $traceurRuntime.createGeneratorInstance(function(c){for(;;)switch(c.state){case 0:a=this.map_.entries()[Symbol.iterator](),c.sent=void 0,c.action="next",c.state=12;break;case 12:b=a[c.action](c.sentIgnoreThrow),c.state=9;break;case 9:c.state=b.done?3:2;break;case 3:c.sent=b.value,c.state=-2;break;case 2:return c.state=12,b.value;default:return c.end()}},k,this)})},{}),Object.defineProperty(i.prototype,Symbol.iterator,{configurable:!0,writable:!0,value:i.prototype.values}),Object.defineProperty(i.prototype,"keys",{configurable:!0,writable:!0,value:i.prototype.values}),f(b),{get Set(){return i},get polyfillSet(){return b}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Set.js"),System.registerModule("traceur-runtime@0.0.79/node_modules/rsvp/lib/rsvp/asap.js",[],function(){"use strict";function a(a,b){m[h]=a,m[h+1]=b,h+=2,2===h&&g()}function b(){return function(){process.nextTick(f)}}function c(){var a=0,b=new k(f),c=document.createTextNode("");return b.observe(c,{characterData:!0}),function(){c.data=a=++a%2}}function d(){var a=new MessageChannel;return a.port1.onmessage=f,function(){a.port2.postMessage(0)}}function e(){return function(){setTimeout(f,1)}}function f(){for(var a=0;h>a;a+=2){var b=m[a],c=m[a+1];b(c),m[a]=void 0,m[a+1]=void 0}h=0}var g,h=0,i=a,j="undefined"!=typeof window?window:{},k=j.MutationObserver||j.WebKitMutationObserver,l="undefined"!=typeof Uint8ClampedArray&&"undefined"!=typeof importScripts&&"undefined"!=typeof MessageChannel,m=new Array(1e3);return g="undefined"!=typeof process&&"[object process]"==={}.toString.call(process)?b():k?c():l?d():e(),{get default(){return i}}}),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Promise.js",[],function(){"use strict";function a(a){return a&&"object"==typeof a&&void 0!==a.status_}function b(a){return a}function c(a){throw a}function d(a){var d=void 0!==arguments[1]?arguments[1]:b,f=void 0!==arguments[2]?arguments[2]:c,g=e(a.constructor);switch(a.status_){case void 0:throw TypeError;case 0:a.onResolve_.push(d,g),a.onReject_.push(f,g);break;case 1:k(a.value_,[d,g]);break;case-1:k(a.value_,[f,g])}return g.promise}function e(a){if(this===t){var b=g(new t(r));return{promise:b,resolve:function(a){h(b,a)},reject:function(a){i(b,a)}}}var c={};return c.promise=new a(function(a,b){c.resolve=a,c.reject=b}),c}function f(a,b,c,d,e){return a.status_=b,a.value_=c,a.onResolve_=d,a.onReject_=e,a}function g(a){return f(a,0,void 0,[],[])}function h(a,b){j(a,1,b,a.onResolve_)}function i(a,b){j(a,-1,b,a.onReject_)}function j(a,b,c,d){0===a.status_&&(k(c,d),f(a,b,c))}function k(a,b){p(function(){for(var c=0;c<b.length;c+=2)l(a,b[c],b[c+1])})}function l(b,c,e){try{var f=c(b);if(f===e.promise)throw new TypeError;a(f)?d(f,e.resolve,e.reject):e.resolve(f)}catch(g){try{e.reject(g)}catch(g){}}}function m(a){return a&&("object"==typeof a||"function"==typeof a)}function n(b,c){if(!a(c)&&m(c)){var d;try{d=c.then}catch(f){var g=u.call(b,f);return c[v]=g,g}if("function"==typeof d){var h=c[v];if(h)return h;var i=e(b);c[v]=i.promise;try{d.call(c,i.resolve,i.reject)}catch(f){i.reject(f)}return i.promise}}return c}function o(a){a.Promise||(a.Promise=s)}var p=System.get("traceur-runtime@0.0.79/node_modules/rsvp/lib/rsvp/asap.js").default,q=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js").registerPolyfill,r={},s=function(a){if(a!==r){if("function"!=typeof a)throw new TypeError;var b=g(this);try{a(function(a){h(b,a)},function(a){i(b,a)})}catch(c){i(b,c)}}};$traceurRuntime.createClass(s,{"catch":function(a){return this.then(void 0,a)},then:function(e,f){"function"!=typeof e&&(e=b),"function"!=typeof f&&(f=c);var g=this,h=this.constructor;return d(this,function(b){return b=n(h,b),b===g?f(new TypeError):a(b)?b.then(e,f):e(b)},f)}},{resolve:function(b){return this===t?a(b)?b:f(new t(r),1,b):new this(function(a){a(b)})},reject:function(a){return this===t?f(new t(r),-1,a):new this(function(b,c){c(a)})},all:function(a){var b=e(this),c=[];try{var d=a.length;if(0===d)b.resolve(c);else for(var f=0;f<a.length;f++)this.resolve(a[f]).then(function(a,e){c[a]=e,0===--d&&b.resolve(c)}.bind(void 0,f),function(a){b.reject(a)})}catch(g){b.reject(g)}return b.promise},race:function(a){var b=e(this);try{for(var c=0;c<a.length;c++)this.resolve(a[c]).then(function(a){b.resolve(a)},function(a){b.reject(a)})}catch(d){b.reject(d)}return b.promise}});var t=s,u=t.reject,v="@@thenable";return q(o),{get Promise(){return s},get polyfillPromise(){return o}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Promise.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/StringIterator.js",[],function(){"use strict";function a(a){var b=String(a),c=Object.create(j.prototype);return c[f(h)]=b,c[f(i)]=0,c}var b,c=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),d=c.createIteratorResultObject,e=c.isObject,f=$traceurRuntime.toProperty,g=Object.prototype.hasOwnProperty,h=Symbol("iteratedString"),i=Symbol("stringIteratorNextIndex"),j=function(){};return $traceurRuntime.createClass(j,(b={},Object.defineProperty(b,"next",{value:function(){var a=this;if(!e(a)||!g.call(a,h))throw new TypeError("this must be a StringIterator object");var b=a[f(h)];if(void 0===b)return d(void 0,!0);var c=a[f(i)],j=b.length;if(c>=j)return a[f(h)]=void 0,d(void 0,!0);var k,l=b.charCodeAt(c);if(55296>l||l>56319||c+1===j)k=String.fromCharCode(l);else{var m=b.charCodeAt(c+1);k=56320>m||m>57343?String.fromCharCode(l):String.fromCharCode(l)+String.fromCharCode(m)}return a[f(i)]=c+k.length,d(k,!1)},configurable:!0,enumerable:!0,writable:!0}),Object.defineProperty(b,Symbol.iterator,{value:function(){return this},configurable:!0,enumerable:!0,writable:!0}),b),{}),{get createStringIterator(){return a}}}),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/String.js",[],function(){"use strict";function a(a){var b=String(this);if(null==this||"[object RegExp]"==o.call(a))throw TypeError();var c=b.length,d=String(a),e=(d.length,arguments.length>1?arguments[1]:void 0),f=e?Number(e):0;isNaN(f)&&(f=0);var g=Math.min(Math.max(f,0),c);return p.call(b,d,f)==g}function b(a){var b=String(this);if(null==this||"[object RegExp]"==o.call(a))throw TypeError();var c=b.length,d=String(a),e=d.length,f=c;if(arguments.length>1){var g=arguments[1];void 0!==g&&(f=g?Number(g):0,isNaN(f)&&(f=0))}var h=Math.min(Math.max(f,0),c),i=h-e;return 0>i?!1:q.call(b,d,i)==i}function c(a){if(null==this)throw TypeError();var b=String(this);if(a&&"[object RegExp]"==o.call(a))throw TypeError();var c=b.length,d=String(a),e=d.length,f=arguments.length>1?arguments[1]:void 0,g=f?Number(f):0;g!=g&&(g=0);var h=Math.min(Math.max(g,0),c);return e+h>c?!1:-1!=p.call(b,d,g)}function d(a){if(null==this)throw TypeError();var b=String(this),c=a?Number(a):0;if(isNaN(c)&&(c=0),0>c||1/0==c)throw RangeError();if(0==c)return"";for(var d="";c--;)d+=b;return d}function e(a){if(null==this)throw TypeError();var b=String(this),c=b.length,d=a?Number(a):0;if(isNaN(d)&&(d=0),0>d||d>=c)return void 0;var e,f=b.charCodeAt(d);return f>=55296&&56319>=f&&c>d+1&&(e=b.charCodeAt(d+1),e>=56320&&57343>=e)?1024*(f-55296)+e-56320+65536:f}function f(a){var b=a.raw,c=b.length>>>0;if(0===c)return"";for(var d="",e=0;;){if(d+=b[e],e+1===c)return d;d+=arguments[++e]}}function g(){var a,b,c=[],d=Math.floor,e=-1,f=arguments.length;if(!f)return"";for(;++e<f;){var g=Number(arguments[e]);if(!isFinite(g)||0>g||g>1114111||d(g)!=g)throw RangeError("Invalid code point: "+g);65535>=g?c.push(g):(g-=65536,a=(g>>10)+55296,b=g%1024+56320,c.push(a,b))}return String.fromCharCode.apply(null,c)}function h(){var a=$traceurRuntime.checkObjectCoercible(this),b=String(a);return j(b)}function i(i){var j=i.String;l(j.prototype,["codePointAt",e,"endsWith",b,"includes",c,"repeat",d,"startsWith",a]),l(j,["fromCodePoint",g,"raw",f]),m(j.prototype,h,Symbol)}var j=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/StringIterator.js").createStringIterator,k=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),l=k.maybeAddFunctions,m=k.maybeAddIterator,n=k.registerPolyfill,o=Object.prototype.toString,p=String.prototype.indexOf,q=String.prototype.lastIndexOf;return n(i),{get startsWith(){return a},get endsWith(){return b},get includes(){return c},get repeat(){return d},get codePointAt(){return e},get raw(){return f},get fromCodePoint(){return g},get stringPrototypeIterator(){return h},get polyfillString(){return i}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/String.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/ArrayIterator.js",[],function(){"use strict";function a(a,b){var c=g(a),d=new m;return d.iteratorObject_=c,d.arrayIteratorNextIndex_=0,d.arrayIterationKind_=b,d}function b(){return a(this,l)}function c(){return a(this,j)}function d(){return a(this,k)}var e,f=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),g=f.toObject,h=f.toUint32,i=f.createIteratorResultObject,j=1,k=2,l=3,m=function(){};return $traceurRuntime.createClass(m,(e={},Object.defineProperty(e,"next",{value:function(){var a=g(this),b=a.iteratorObject_;if(!b)throw new TypeError("Object is not an ArrayIterator");var c=a.arrayIteratorNextIndex_,d=a.arrayIterationKind_,e=h(b.length);return c>=e?(a.arrayIteratorNextIndex_=1/0,i(void 0,!0)):(a.arrayIteratorNextIndex_=c+1,d==k?i(b[c],!1):d==l?i([c,b[c]],!1):i(c,!1))},configurable:!0,enumerable:!0,writable:!0}),Object.defineProperty(e,Symbol.iterator,{value:function(){return this},configurable:!0,enumerable:!0,writable:!0}),e),{}),{get entries(){return b},get keys(){return c
},get values(){return d}}}),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Array.js",[],function(){"use strict";function a(a){var b,c,d=arguments[1],e=arguments[2],f=this,g=u(a),h=void 0!==d,i=0;if(h&&!n(d))throw TypeError();if(m(g)){b=o(f)?new f:[];for(var j,k=g[$traceurRuntime.toProperty(Symbol.iterator)]();!(j=k.next()).done;){var l=j.value;b[i]=h?d.call(e,l,i):l,i++}return b.length=i,b}for(c=t(g.length),b=o(f)?new f(c):new Array(c);c>i;i++)b[i]=h?"undefined"==typeof e?d(g[i],i):d.call(e,g[i],i):g[i];return b.length=c,b}function b(){for(var a=[],b=0;b<arguments.length;b++)a[b]=arguments[b];for(var c=this,d=a.length,e=o(c)?new c(d):new Array(d),f=0;d>f;f++)e[f]=a[f];return e.length=d,e}function c(a){var b=void 0!==arguments[1]?arguments[1]:0,c=arguments[2],d=u(this),e=t(d.length),f=s(b),g=void 0!==c?s(c):e;for(f=0>f?Math.max(e+f,0):Math.min(f,e),g=0>g?Math.max(e+g,0):Math.min(g,e);g>f;)d[f]=a,f++;return d}function d(a){var b=arguments[1];return f(this,a,b)}function e(a){var b=arguments[1];return f(this,a,b,!0)}function f(a,b){var c=arguments[2],d=void 0!==arguments[3]?arguments[3]:!1,e=u(a),f=t(e.length);if(!n(b))throw TypeError();for(var g=0;f>g;g++){var h=e[g];if(b.call(c,h,g,e))return d?g:h}return d?-1:void 0}function g(f){var g=f,h=g.Array,l=g.Object,m=g.Symbol;p(h.prototype,["entries",i,"keys",j,"values",k,"fill",c,"find",d,"findIndex",e]),p(h,["from",a,"of",b]),q(h.prototype,k,m),q(l.getPrototypeOf([].values()),function(){return this},m)}var h=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/ArrayIterator.js"),i=h.entries,j=h.keys,k=h.values,l=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),m=l.checkIterable,n=l.isCallable,o=l.isConstructor,p=l.maybeAddFunctions,q=l.maybeAddIterator,r=l.registerPolyfill,s=l.toInteger,t=l.toLength,u=l.toObject;return r(g),{get from(){return a},get of(){return b},get fill(){return c},get find(){return d},get findIndex(){return e},get polyfillArray(){return g}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Array.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Object.js",[],function(){"use strict";function a(a,b){return a===b?0!==a||1/a===1/b:a!==a&&b!==b}function b(a){for(var b=1;b<arguments.length;b++){var c,d=arguments[b],e=null==d?[]:m(d),f=e.length;for(c=0;f>c;c++){var g=e[c];l(g)||(a[g]=d[g])}}return a}function c(a,b){var c,d,e=k(b),f=e.length;for(c=0;f>c;c++){var g=e[c];l(g)||(d=j(b,e[c]),i(a,e[c],d))}return a}function d(d){var e=d.Object;f(e,["assign",b,"is",a,"mixin",c])}var e=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),f=e.maybeAddFunctions,g=e.registerPolyfill,h=$traceurRuntime,i=h.defineProperty,j=h.getOwnPropertyDescriptor,k=h.getOwnPropertyNames,l=h.isPrivateName,m=h.keys;return g(d),{get is(){return a},get assign(){return b},get mixin(){return c},get polyfillObject(){return d}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Object.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/Number.js",[],function(){"use strict";function a(a){return g(a)&&m(a)}function b(b){return a(b)&&k(b)===b}function c(a){return g(a)&&n(a)}function d(b){if(a(b)){var c=k(b);if(c===b)return l(c)<=o}return!1}function e(e){var f=e.Number;h(f,["MAX_SAFE_INTEGER",o,"MIN_SAFE_INTEGER",p,"EPSILON",q]),i(f,["isFinite",a,"isInteger",b,"isNaN",c,"isSafeInteger",d])}var f=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js"),g=f.isNumber,h=f.maybeAddConsts,i=f.maybeAddFunctions,j=f.registerPolyfill,k=f.toInteger,l=Math.abs,m=isFinite,n=isNaN,o=Math.pow(2,53)-1,p=-Math.pow(2,53)+1,q=Math.pow(2,-52);return j(e),{get MAX_SAFE_INTEGER(){return o},get MIN_SAFE_INTEGER(){return p},get EPSILON(){return q},get isFinite(){return a},get isInteger(){return b},get isNaN(){return c},get isSafeInteger(){return d},get polyfillNumber(){return e}}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/Number.js"),System.registerModule("traceur-runtime@0.0.79/src/runtime/polyfills/polyfills.js",[],function(){"use strict";var a=System.get("traceur-runtime@0.0.79/src/runtime/polyfills/utils.js").polyfillAll;a(Reflect.global);var b=$traceurRuntime.setupGlobals;return $traceurRuntime.setupGlobals=function(c){b(c),a(c)},{}}),System.get("traceur-runtime@0.0.79/src/runtime/polyfills/polyfills.js");
//# sourceMappingURL=traceur-runtime.js.map