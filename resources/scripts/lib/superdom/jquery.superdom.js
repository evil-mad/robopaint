/*! jQuery SuperDOM v0.0.6 | (c) 2014 metaist | http://opensource.org/licenses/MIT */
(function (factory) {
  'use strict';
  if ('function' === typeof define && define.amd) {
    define(['jquery'], factory); // register anonymous AMD module
  } else { factory(jQuery); } // browser globals
}(function ($) {
  'use strict';

  //*** Start jQuery Internals ***//
  var strundefined = typeof undefined,
    rcheckableType = /^(?:checkbox|radio)$/i,
    rclass = /[\t\r\n\f]/g,
    rhtml = /<|&#?\w+;/,
    rleadingWhitespace = /^\s+/,
    rnotwhite = /\S+/g,
    rscriptType = /^$|\/(?:java|ecma)script/i,
    //rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);
    //SUPERDOM: namespace-aware
    rsingletag = /^<((\w+:)?\w+)\s*\/?>(?:<\/\1>|)$/,
    rtagName = /<([\w:]+)/,
    rtagNameNS = /\w+:\w+/g, //SUPERDOM: namespace-aware
    rnodeNameNS = /(\w+:)?(\w+)/, //SUPERDOM: namespace-aware
    rtbody = /<tbody/i,
    // Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
    whitespace = "[\\x20\\t\\r\\n\\f]",
    rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
    // CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
    runescape = new RegExp("\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig"),
    funescape = function (_, escaped, escapedWhitespace) {
      var high = "0x" + escaped - 0x10000;
      // NaN means non-codepoint
      // Support: Firefox
      // Workaround erroneous numeric interpretation of +"0x"
      return high !== high || escapedWhitespace ?
        escaped :
        high < 0 ?
          // BMP codepoint
          String.fromCharCode(high + 0x10000) :
          // Supplemental Plane codepoint (surrogate pair)
          String.fromCharCode(high >> 10 | 0xD800, high & 0x3FF | 0xDC00);
    },

    nodeNames =
      'abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|' +
      'figure|footer|header|hgroup|mark|meter|nav|output|progress|section|' +
      'summary|time|video',

    // We have to close these tags to support XHTML (#13200)
    wrapMap = {
      option: [ 1, "<select multiple='multiple'>", "</select>" ],
      legend: [ 1, "<fieldset>", "</fieldset>" ],
      area: [ 1, "<map>", "</map>" ],
      param: [ 1, "<object>", "</object>" ],
      thead: [ 1, "<table>", "</table>" ],
      tr: [ 2, "<table><tbody>", "</tbody></table>" ],
      col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
      td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

      // IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
      // unless wrapped in a div with non-breaking characters in front of it.
      _default: $.support.htmlSerialize ? [0, "", ""] : [1, "X<div>", "</div>"]
    },

    createSafeFragment = function (document) {
      var list = nodeNames.split('|'),
        safeFrag = document.createDocumentFragment();
      if (safeFrag.createElement) {
        while (list.length) { createDOM(safeFrag, list.pop()); }
      }
      return safeFrag;
    },

    getAll = function (context, tag) {
      var elems, elem,
        i = 0,
        found = typeof context.getElementsByTagName !== strundefined ?
                //context.getElementsByTagName(tag || '*') :
                //SUPERDOM: namespace-aware version
                context.getElementsByTagNameNS('*', tag || '*') :
                typeof context.querySelectorAll !== strundefined ?
                context.querySelectorAll(tag || '*') :
                undefined;

      if (!found) {
        for (found = [], elems = context.childNodes || context;
             (elem = elems[i]) != null; i++) { 11// jshint ignore:line
          if (!tag || $.nodeName(elem, tag)) {
            found.push(elem);
          } else {
            $.merge(found, getAll(elem, tag));
          }
        }
      }

      return tag === undefined || tag && $.nodeName(context, tag) ?
        $.merge([context], found) :
        found;
    },

    // Used in buildFragment, fixes the defaultChecked property
    fixDefaultChecked = function (elem) {
      if (rcheckableType.test(elem.type)) {
        elem.defaultChecked = elem.checked;
      }
    },

    // Mark scripts as having already been evaluated
    setGlobalEval = function (elems, refElements) {
      var elem, i = 0;
      for (; (elem = elems[i]) != null; i++) { // jshint ignore:line
        $._data(elem, "globalEval",
                !refElements || $._data(refElements[i], 'globalEval'));
      }
    },

    //*** End jQuery Internals *** //

    /**
      @private Return normalized class name.
      @param {String} classes - class attribute
      @return {String} single space-separated classnames
    */
    normClass = function (classes) {
      return (' ' + classes + ' ').replace(rclass, ' ');
    },

    /**
      @private Return an new namespace-aware Element.
      @param {Document|DocumentFragment} context (default: document) -
        owning object for the newly created Element
      @param {String} tag - name of the Element to create; may be prefixed
        with a local namespace name
      @param {String} ns - (default: inferred from tag) local namespace name or
        full namespace URI
      @return {Element} that was created

      Alternate signatures:
        createDOM(context, tag, ns)
        createDOM(context, tag)
        createDOM(tag, ns)
        createDOM(tag)

      @example The following are all equivalent:
        createDOM(document, 'text', 'svg')
        createDOM(document, 'text', 'http://www.w3.org/2000/svg')
        createDOM('svg:text')
    */
    createDOM = function (context, tag, ns) {
      var i;
      if ('string' === typeof context) {
        ns = tag;
        tag = context;
        context = document;
      }//end if: alternate syntax (tag, ns)
      if (!tag) { return null; }

      i = tag.indexOf(':');
      if (!ns && i > 0) {
        ns = tag.substring(0, i);
        if (!$.superdom.options.keepNSPrefix) { tag = tag.substring(i + 1); }
      }//end if: handled qualified ns
      if ($.ns.hasOwnProperty(ns)) { ns = $.ns[ns]; }
      return  ns ? context.createElementNS(ns, tag) :
                   context.createElement(tag);
    },

    /**
      @private Return a Document that results from parsing the given text.
      @param {String} txt - text to parse
      @return {Document} parsed documnet

      This method constructs a small XML document that has all of the known
      namespaces incorporated into it.
      @see $.buildFragment
    */
    DOCTYPE = '<!DOCTYPE data PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ' +
              '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
    superParse = function (txt) {
      var doc,
        str = DOCTYPE +  '<root xmlns="' + $.ns.xhtml + '" ';
      $.each($.ns, function (prefix, ns) {
        if ('xmlns' === prefix) { return; }
        str += 'xmlns:' + prefix + '="' + ns + '" ';
      });
      str += '>' + txt + '</root>';
      try {
        doc = $.parseXML(str);
      } catch (e) {
        $.error('Error parsing XML.');
      }//end try: maybe have a parsed document
      return doc && doc.documentElement;
    },

    /**
      @private Remove namespace prefix from a tag's name.
      @param {Document|DocumentFragment} context - owner of the node
      @param {Element} node - node to fix
      @return {Element} new node with the namespace prefix removed

      Tags that have namespaces are hard to select.
      @see http://www.w3.org/TR/selectors-api2/#resolving-namespaces

      Therefore, we attempt to (recursively) re-create the tags without the
      namespace prefix. When document.querySelectorAll supports this, we can
      revisit the need to do this.
    */
    fixNSPrefix = function (context, node) {
      var idx, newNode = createDOM(context, node.nodeName);
      $.each($.makeArray(node.childNodes), function (idx, child) {
        if (1 === child.nodeType) { child = fixNSPrefix(context, child); }
        newNode.appendChild(child);
      });//end each: children copied

      $.each(node.attributes, function (idx) {
        newNode.attributes.setNamedItem(this.cloneNode());
      });//end each: attributes copied

      return newNode;
    },

    // For noConflict
    original = {
      superdom: $.superdom,
      ns: $.ns,
      parseDOM: $.parseDOM,
      parseHTML: $.parseHTML,
      nodeName: $.nodeName,
      buildFragment: $.buildFragment,
      expr: {
        ':': { ns: $.expr[':'].ns },
        filter: { TAG: $.expr.filter.TAG },
        find: { TAG: $.expr.find.TAG }
      },
      fn: {
        hasNS: $.fn.hasNS,
        addClass: $.fn.addClass,
        removeClass: $.fn.removeClass,
        toggleClass: $.fn.toggleClass,
        hasClass: $.fn.hasClass
      }
    },

    getProp = function (item, dotname) {
      var parts = dotname.split('.'),
        name = parts.slice(-1)[0],
        i, L = parts.length - 1;

      for (i = 0; i < L; i++) { item = item[parts[i]]; }//traverse item
      return item[name];
    },

    setProp = function (topitem, dotname, val) {
      var result = topitem, item = topitem,
        parts = dotname.split('.'),
        name = parts.slice(-1)[0],
        L = parts.length - 1;

      for (var i = 0; i < L; i++) {
        if (!item.hasOwnProperty(parts[i])) { item[parts[i]] = {}; }
        item = item[parts[i]];
      }//traverse item

      if (!$.isPlainObject(val)) { item[name] = val;
      } else {
        $.each(val, function (k, v) {
          setProp(topitem, dotname + '.' + k, v);
        });
      }//end if: set the object

      return result;
    },

    plugin = {
      superdom: {
        version: '0.0.6',
        options: {
          keepNSPrefix: false // true = keep namespace prefix in tag names
        },

        /** Revert the entire plugin.
            @param Array names: zero or more dotted names to remove
        */
        noConflict: function (names) {
          var result = plugin;
          if (names && 'array' !== $.type(names)) { names = [names]; }
          if (!names || 0 === names.length) {
            $.each(original, function (k, v) { setProp($, k, v); });
          } else {
            result = {};
            $.each(names, function (i, k) {
              setProp(result, k, getProp(plugin, k)); // save plugin fn
              setProp($, k, getProp(original, k)); // revert control
            });
          }//end if: reverted some

          return result;
        }
      },

      // List of known namespaces.
      // From: https://github.com/mbostock/d3/blob/master/src/core/ns.js
      ns: {
        math: 'http://www.w3.org/1998/Math/MathML',
        svg: 'http://www.w3.org/2000/svg',
        xhtml: 'http://www.w3.org/1999/xhtml',
        xlink: 'http://www.w3.org/1999/xlink',
        xml: 'http://www.w3.org/XML/1998/namespace',
        xmlns: 'http://www.w3.org/2000/xmlns/'
      },

      // jQuery
      expr: {
        ':': {
          /** Filter DOM nodes by namespace. */
          ns: function (obj, index, meta, stack) {
            return $(obj).hasNS(meta[3]);
          }
        },

        filter: {
          /** @see jquery-1.11.0.js: 1639 */
          TAG: function (nodeNameSelector) {
            var nodeName =
              nodeNameSelector.replace(runescape, funescape).toLowerCase();
            return nodeNameSelector === "*" ?
              function () { return true; } :
              function (elem) {
                return (elem.nodeName &&
                       //elem.nodeName.toLowerCase() === nodeName;
                       //SUPERDOM: namespace-aware
                       rnodeNameNS.exec(elem.nodeName.toLowerCase())[2] ===
                       nodeName);

              };
          }
        },

        find: {
          /** @see jquery-1.11.0.js: 1154 */
          TAG: $.support.getElementsByTagName ?
          function (tag, context) {
            if (typeof context.getElementsByTagName !== strundefined) {
              //results = context.getElementsByTagName(tag);
              //SUPERDOM: use namespace aware version
              return context.getElementsByTagNameNS('*', tag);
            }
          } :
          function (tag, context) {
            var elem, tmp = [], i = 0,
              //results = context.getElementsByTagName(tag);
              //SUPERDOM: use namespace aware version
              results = context.getElementsByTagNameNS('*', tag);

            // Filter out possible comments
            if ('*' === tag) {
              while ((elem = results[i++])) {
                if (1 === elem.nodeType) { tmp.push(elem); }
              }
              return tmp;
            }
            return results;
          }
        }
      },

      /** @see jquery-1.11.0.js: 350 */
      /** @see jquery-2.1.1.js: 341 */
      nodeName: function (elem, name) {
        return (elem.nodeName &&
               //elem.nodeName.toLowerCase() === name.toLowerCase();
               //SUPERDOM: namespace-aware tag name
               rnodeNameNS.exec(elem.nodeName.toLowerCase())[2] ===
               name.toLowerCase());
      },

      /** @see jquery-1.11.0.js: 5514 */
      /** @see jquery-2.1.1.js: 5060 */
      buildFragment: function (elems, context, scripts, selection) {
        var j, elem, contains,
          tmp, tag, tbody, wrap,
          l = elems.length,

          // Ensure a safe fragment
          safe = createSafeFragment(context),

          nodes = [],
          i = 0;

        for (; i < l; i++) {
          elem = elems[i];

          if (elem || elem === 0) {

            // Add nodes directly
            if ('object' === $.type(elem)) {
              $.merge(nodes, elem.nodeType ? [elem] : elem);

            // Convert non-html into a text node
            } else if (!rhtml.test(elem)) {
              nodes.push(context.createTextNode(elem));

            // Convert html into DOM nodes
            } else {
              tmp = tmp || safe.appendChild(context.createElement('div'));

              // Deserialize a standard representation
              tag = (rtagName.exec(elem) || ['', ''])[1].toLowerCase();
              wrap = wrapMap[tag] || wrapMap._default;

              //  tmp.innerHTML =
              //    wrap[1] + elem.replace(rxhtmlTag, '<$1></$2>') + wrap[2];
              //SUPERDOM: use the browser parser to parse this tag
              tmp = superParse(
                wrap[1] + elem.replace(rxhtmlTag, '<$1></$2>') + wrap[2]
              );

              // Descend through wrappers to the right content
              j = wrap[0];
              while (j--) {
                tmp = tmp.lastChild;
              }

              // Manually add leading whitespace removed by IE
              if (!$.support.leadingWhitespace &&
                  rleadingWhitespace.test(elem)) {
                nodes.push(
                  context.createTextNode(rleadingWhitespace.exec(elem)[0])
                );
              }

              // Remove IE's autoinserted <tbody> from table fragments
              if (!$.support.tbody) {
                // String was a <table>, *may* have spurious <tbody>
                elem = tag === "table" && !rtbody.test(elem) ?
                  tmp.firstChild :

                  // String was a bare <thead> or <tfoot>
                  wrap[1] === "<table>" && !rtbody.test(elem) ?
                    tmp :
                    0;

                j = elem && elem.childNodes.length;
                while (j--) {
                  tbody = elem.childNodes[j];
                  if ($.nodeName(tbody, 'tbody') && !tbody.childNodes.length) {
                    elem.removeChild(tbody);
                  }
                }
              }

              //$.merge(nodes, tmp.childNodes);
              //SUPERDOM: remove the namespace prefix from the DOM node
              j = tmp.childNodes.length;
              for (var k = 0; k < j; k++) {
                nodes.push(fixNSPrefix(context, tmp.childNodes[k]));
              }//end for: fixed all nodes

              // Fix #12392 for WebKit and IE > 9
              tmp.textContent = '';

              // Fix #12392 for oldIE
              while (tmp.firstChild) {
                tmp.removeChild(tmp.firstChild);
              }

              // Remember the top-level container for proper cleanup
              tmp = safe.lastChild;
            }
          }
        }

        // Fix #11356: Clear elements from fragment
        if (tmp) {
          safe.removeChild(tmp);
        }

        // Reset defaultChecked for any radios and checkboxes
        // about to be appended to the DOM in IE 6/7 (#8060)
        if (!$.support.appendChecked) {
          $.grep(getAll(nodes, 'input'), fixDefaultChecked);
        }

        i = 0;
        while ((elem = nodes[i++])) {

          // #4087 - If origin and destination elements are the same, and this
          // is that element, do not do anything
          if (selection && $.inArray(elem, selection) !== -1) {
            continue;
          }

          contains = $.contains(elem.ownerDocument, elem);

          // Append to fragment
          tmp = getAll(safe.appendChild(elem), 'script');

          // Preserve script evaluation history
          if (contains) { setGlobalEval(tmp); }

          // Capture executables
          if (scripts) {
            j = 0;
            while ((elem = tmp[j++])) {
              if (rscriptType.test(elem.type || '')) {
                scripts.push(elem);
              }
            }
          }
        }

        tmp = null;
        return safe;
      },

      /** @see http://api.jquery.com/jQuery.parseHTML/ */
      parseDOM: function (data, context, keepScripts) {
        if (!data || 'string' !== typeof data) { return null; }
        if ('boolean' === typeof context) {
          keepScripts = context;
          context = false;
        }//end if: alternate syntax (data, keepScripts)

        context = context || document;

        var parsed = rsingletag.exec(data),
            scripts = !keepScripts && [];

        //if (parsed) { return [context.createElement(parsed[1])]; }
        //SUPERDOM: Create a single tag
        if (parsed) { return [createDOM(context, parsed[1])]; }

        parsed = $.buildFragment([data], context, scripts);

        if (scripts && scripts.length) { $(scripts).remove(); }

        return $.merge([], parsed.childNodes);
      }
    },

    fn = {
      /**
        Return true if any of the selected nodes is in the namespace.
        @param {String} ns - URL for a namespace or its local name
        @return {boolean} true if any element is in the namespace
      */
      hasNS: function (ns) {
        var i, L = this.length;
        ns = ns.toLowerCase();
        if ($.ns.hasOwnProperty(ns)) { ns = $.ns[ns]; }
        for (i = 0; i < L; i++) {
          if (ns === this[i].namespaceURI) { return true; }
        }
        return false;
      },

      /** @see http://api.jquery.com/addClass */
      addClass: function (value) {
        var classes, proceed = 'string' === typeof value && value;

        if ($.isFunction(value)) {
          return this.each(function (j) {
            $(this).addClass(
              //SUPERDOM: Use getAttribute instead of .className
              value.call(this, j, this.getAttribute('class'))
            );
          });
        }//end if: applied function to each node

        if (!proceed) { return this; }

        classes = value.match(rnotwhite) || [];

        return this.each(function () {
          if (1 !== this.nodeType) { return; } // nothing to do

          //SUPERDOM: Use getAttribute instead of .className
          var oldClasses = this.getAttribute('class'),
            newClasses = oldClasses ? normClass(oldClasses) : ' ';

          $.each(classes, function (j, className) {
            if (-1 === newClasses.indexOf(' ' + className + ' ')) {
              newClasses += className + ' ';
            }//end if
          });//end $.each class name

          // only change attribute if it's different to avoid re-rendering
          newClasses = $.trim(newClasses);
          if (oldClasses !== newClasses) {
            this.setAttribute('class', newClasses);
          }// classes added
        });//end $.each
      },//end: addClass

      /** @see http://api.jquery.com/removeClass */
      removeClass: function (value) {
        var classes, proceed = 0 === arguments.length ||
          ('string' === typeof value && value);

        if ($.isFunction(value)) {
          return this.each(function (j) {
            $(this).removeClass(
              value.call(this, j, this.getAttribute('class'))
            );
          });
        }//end if: applied to each node

        if (!proceed) { return this; }

        classes = value.match(rnotwhite) || [];

        return this.each(function () {
          //SUPERDOM: Use getAttribute instead of .className
          var oldClasses = this.getAttribute('class'),
            newClasses = oldClasses ? normClass(oldClasses) : '';

          if (1 !== this.nodeType || !newClasses) { return; } //nothing to do
          $.each(classes, function (j, className) {
            className = ' ' + className + ' ';
            while (newClasses.indexOf(className) >= 0) {
              newClasses = newClasses.replace(className, ' ');
            }//end while: all instances of this class name removed
          });//end $.each class name

          // only change attribute if it's different to avoid re-rendering
          newClasses = value ? $.trim(newClasses) : '';
          if (oldClasses !== newClasses) {
            this.setAttribute('class', newClasses);
          }// classes removed
        });
      },//end removeClass

      /** @see http://api.jquery.com/toggleClass */
      toggleClass: function (value, stateVal) {
        var type = typeof value;

        if ('boolean' === typeof stateVal && 'string' === type) {
          return stateVal ? this.addClass(value) : this.removeClass(value);
        }//end if

        if ($.isFunction(value)) {
          return this.each(function (j) {
            $(this).toggleClass(
              //SUPERDOM: Use getAttribute instead of .className
              value.call(this, j, this.getAttribute('class'), stateVal),
              stateVal
            );
          });
        }//end if: applied to all nodes

        return this.each(function () {
          var classes, newClasses, oldClasses, self = $(this);

          if ('string' === type) {
            // toggle individual class names
            classes = value.match(rnotwhite) || [];

            $.each(classes, function (j, className) {
              return self.hasClass(className) ?
                      self.removeClass(className) :
                      self.addClass(className);
            });//end $.each
          } else if (type === strundefined || 'boolean' === type) {
            // Toggle whole class name
            oldClasses = this.getAttribute('class');
            if (oldClasses) {
              self.data('__className__', oldClasses);
            }//end if: stored the old class name

            /*
             If the element has a class name or if we're passed "false",
             then remove the whole classname (if there was one, the above
             saved it). Otherwise bring back whatever was previously saved
             (if anything), falling back to the empty string if nothing was
             stored.
            */
            this.setAttribute('class', oldClasses ||
                false === value ? '' : self.data('__className__') || ''
              );
          }//end if
        });//$.each
      },//end toggleClass

      /** @see http://api.jquery.com/hasClass */
      hasClass: function (selector) {
        var name = ' ' + selector + ' ', i = 0, L = this.length;
        for (i = 0; i < L; i += 1) {
          //SUPERDOM: Use getAttribute instead of .className
          if (1 === this[i].nodeType &&
              normClass(this[i].getAttribute('class')).indexOf(name) >= 0) {
            return true;
          }//end if: checked DOM node
        }//end for

        return false;
      }//end hasClass
    };

  plugin.parseHTML = plugin.parseDOM;

  // export the plugin
  $.extend(true, $, plugin);
  $.fn.extend(fn);
  plugin.fn = fn;

  return plugin;
}));
