//The MIT License
//Copyright (c) 2012 Aaron Powell
/**
 * Changes in 2025 by codedread:
 * - Removed unused code.
 * - Modernized code style.
 * - Made into an ES module.
 */

/** @type {Object<string, IDBTransactionMode>} */
const transactionModes = {
    readonly: 'readonly',
    readwrite: 'readwrite',
};

const defaultMapper = (value) => value;

export class Server {
    /** @type {IDBDatabase} */
    db;

    /** @type {string} */
    name;

    /** @type {boolean} */
    closed;

    /**
     * @param {IDBDatabase} db 
     * @param {string} name 
     */
    constructor(db, name) {
        this.db = db;
        this.name = name;
        this.closed = false;
    }

    add(table) {
        if (this.closed) {
            throw 'Database has been closed';
        }

        var records = [];
        var counter = 0;

        for (var i = 0; i < arguments.length - 1; i++) {
            if (Array.isArray(arguments[i + 1])) {
                for (var j = 0; j < arguments[i + 1].length; j++) {
                    records[counter] = arguments[i + 1][j];
                    counter++;
                }
            } else {
                records[counter] = arguments[i + 1];
                counter++;
            }
        }

        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        return new Promise((resolve, reject) => {
            records.forEach((record) => {
                let req;
                if (record.item && record.key) {
                    var key = record.key;
                    record = record.item;
                    req = store.add(record, key);
                } else {
                    req = store.add(record);
                }

                req.onsuccess = function(e) {
                    var target = e.target;
                    var keyPath = target.source.keyPath;
                    if (keyPath === null) {
                        keyPath = '__id__';
                    }
                    Object.defineProperty(record, keyPath, {
                        value: target.result,
                        enumerable: true,
                    });
                };
            });

            transaction.oncomplete = () => {
                resolve(records, this);
            };
            transaction.onerror = function(e) {
                reject(e);
            };
            transaction.onabort = function(e) {
                reject(e);
            };
        });
    }

    update(table) {
        if (this.closed) {
            throw 'Database has been closed';
        }

        var records = [];
        for (var i = 0; i < arguments.length - 1; i++) {
            records[i] = arguments[i + 1];
        }

        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table),
            keyPath = store.keyPath;

        return new Promise((resolve, reject) => {
            records.forEach((record) => {
                let req;
                let count;
                if (record.item && record.key) {
                    var key = record.key;
                    record = record.item;
                    req = store.put(record, key);
                } else {
                    req = store.put(record);
                }

                req.onsuccess = function(e) {
                    // deferred.notify(); es6 promise can't notify
                };
            });

            transaction.oncomplete = () => {
                resolve(records, this);
            };
            transaction.onerror = function(e) {
                reject(e);
            };
            transaction.onabort = function(e) {
                reject(e);
            };
        });
    }

    remove(table, key) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        return new Promise((resolve, reject) => {
            var req = store['delete'](key);
            transaction.oncomplete = function() {
                resolve(key);
            };
            transaction.onerror = function(e) {
                reject(e);
            };
        });
    }

    clear(table) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        var req = store.clear();
        return new Promise((resolve, reject) => {
            transaction.oncomplete = function() {
                resolve();
            };
            transaction.onerror = function(e) {
                reject(e);
            };
        });
    }

    close() {
        if (this.closed) {
            throw 'Database has been closed';
        }
        this.db.close();
        this.closed = true;
        delete dbCache[this.name];
    }

    get(table, id) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table),
            store = transaction.objectStore(table);

        var req = store.get(id);
        return new Promise((resolve, reject) => {
            req.onsuccess = function(e) {
                resolve(e.target.result);
            };
            transaction.onerror = function(e) {
                reject(e);
            };
        });
    }

    query(table, index) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        return new IndexQuery(table, this.db, index);
    }
}

var IndexQuery = function(table, db, indexName) {
    var that = this;
    var modifyObj = false;

    var runQuery = function(
        type,
        args,
        cursorType,
        direction,
        limitRange,
        filters,
        mapper
    ) {
        var transaction = db.transaction(
                table,
                modifyObj
                    ? transactionModes.readwrite
                    : transactionModes.readonly
            ),
            store = transaction.objectStore(table),
            index = indexName ? store.index(indexName) : store,
            keyRange = type ? IDBKeyRange[type].apply(null, args) : null,
            results = [],
            indexArgs = [keyRange],
            limitRange = limitRange ? limitRange : null,
            filters = filters ? filters : [],
            counter = 0;

        if (cursorType !== 'count') {
            indexArgs.push(direction || 'next');
        }

        // create a function that will set in the modifyObj properties into
        // the passed record.
        var modifyKeys = modifyObj ? Object.keys(modifyObj) : false;
        var modifyRecord = function(record) {
            for (var i = 0; i < modifyKeys.length; i++) {
                var key = modifyKeys[i];
                var val = modifyObj[key];
                if (val instanceof Function) val = val(record);
                record[key] = val;
            }
            return record;
        };

        index[cursorType].apply(index, indexArgs).onsuccess = function(e) {
            var cursor = e.target.result;
            if (typeof cursor === typeof 0) {
                results = cursor;
            } else if (cursor) {
                if (limitRange !== null && limitRange[0] > counter) {
                    counter = limitRange[0];
                    cursor.advance(limitRange[0]);
                } else if (
                    limitRange !== null &&
                    counter >= limitRange[0] + limitRange[1]
                ) {
                    //out of limit range... skip
                } else {
                    var matchFilter = true;
                    var result =
                        'value' in cursor ? cursor.value : cursor.key;

                    filters.forEach(function(filter) {
                        if (!filter || !filter.length) {
                            //Invalid filter do nothing
                        } else if (filter.length === 2) {
                            matchFilter =
                                matchFilter &&
                                result[filter[0]] === filter[1];
                        } else {
                            matchFilter =
                                matchFilter &&
                                filter[0].apply(undefined, [result]);
                        }
                    });

                    if (matchFilter) {
                        counter++;
                        results.push(mapper(result));
                        // if we're doing a modify, run it now
                        if (modifyObj) {
                            result = modifyRecord(result);
                            cursor.update(result);
                        }
                    }
                    cursor['continue']();
                }
            }
        };

        return new Promise((resolve, reject) => {
            transaction.oncomplete = function() {
                resolve(results);
            };
            transaction.onerror = function(e) {
                reject(e);
            };
            transaction.onabort = function(e) {
                reject(e);
            };
        });
    };

    var Query = function(type, args) {
        var direction = 'next',
            cursorType = 'openCursor',
            filters = [],
            limitRange = null,
            mapper = defaultMapper,
            unique = false;

        var execute = function() {
            return runQuery(
                type,
                args,
                cursorType,
                unique ? direction + 'unique' : direction,
                limitRange,
                filters,
                mapper
            );
        };

        var limit = function() {
            limitRange = Array.prototype.slice.call(arguments, 0, 2);
            if (limitRange.length == 1) {
                limitRange.unshift(0);
            }

            return {
                execute: execute,
            };
        };
        var count = function() {
            direction = null;
            cursorType = 'count';

            return {
                execute: execute,
            };
        };
        var keys = function() {
            cursorType = 'openKeyCursor';

            return {
                desc: desc,
                execute: execute,
                filter: filter,
                distinct: distinct,
                map: map,
            };
        };
        var filter = function() {
            filters.push(Array.prototype.slice.call(arguments, 0, 2));

            return {
                keys: keys,
                execute: execute,
                filter: filter,
                desc: desc,
                distinct: distinct,
                modify: modify,
                limit: limit,
                map: map,
            };
        };
        var desc = function() {
            direction = 'prev';

            return {
                keys: keys,
                execute: execute,
                filter: filter,
                distinct: distinct,
                modify: modify,
                map: map,
            };
        };
        var distinct = function() {
            unique = true;
            return {
                keys: keys,
                count: count,
                execute: execute,
                filter: filter,
                desc: desc,
                modify: modify,
                map: map,
            };
        };
        var modify = function(update) {
            modifyObj = update;
            return {
                execute: execute,
            };
        };
        var map = function(fn) {
            mapper = fn;

            return {
                execute: execute,
                count: count,
                keys: keys,
                filter: filter,
                desc: desc,
                distinct: distinct,
                modify: modify,
                limit: limit,
                map: map,
            };
        };

        return {
            execute: execute,
            count: count,
            keys: keys,
            filter: filter,
            desc: desc,
            distinct: distinct,
            modify: modify,
            limit: limit,
            map: map,
        };
    };

    'only bound upperBound lowerBound'.split(' ').forEach(function(name) {
        that[name] = function() {
            return new Query(name, arguments);
        };
    });

    this.filter = function() {
        var query = new Query(null, null);
        return query.filter.apply(query, arguments);
    };

    this.all = function() {
        return this.filter();
    };
};

/**
 * Creates the database schema.
 * @param {Event} e 
 * @param {object} schema The database schema object
 * @param {IDBDatabase} db 
 */
function createSchema(e, schema, db) {
    for (var tableName in schema) {
        var table = schema[tableName];
        var store;
        if (
            !Object.hasOwn(schema, tableName) ||
            db.objectStoreNames.contains(tableName)
        ) {
            store = e.currentTarget.transaction.objectStore(tableName);
        } else {
            store = db.createObjectStore(tableName, table.key);
        }

        for (var indexKey in table.indexes) {
            var index = table.indexes[indexKey];
            try {
                store.index(indexKey);
            } catch (e) {
                store.createIndex(
                    indexKey,
                    index.key || indexKey,
                    Object.keys(index).length ? index : { unique: false }
                );
            }
        }
    }
}

/**
 * Opens a connection to the database, caching it for future use.
 * @param {Event} e 
 * @param {string} server 
 * @param {string} version 
 * @param {Object} schema 
 * @returns {Promise<Server>}
 */
function dbOpen(e, server, version, schema) {
    var db = e.target.result;
    var s = new Server(db, server);
    
    dbCache[server] = db;

    return Promise.resolve(s);
}

const dbCache = {};

/**
 * @typedef {object} DbOpenOptions
 * @property {string} server The name of the database.
 * @property {number} version The version of the database.
 * @property {object} schema The database schema.
 */

export const db = {
    version: '0.9.2',
    /**
     * @param {DbOpenOptions} options
     * @returns {Promise<Server>}
     */
    open(options) {
        /** @type {IDBOpenDBRequest} */
        var request;

        return new Promise((resolve, reject) => {
            if (dbCache[options.server]) {
                dbOpen(
                    {
                        target: {
                            result: dbCache[options.server],
                        },
                    },
                    options.server,
                    options.version,
                    options.schema
                ).then(resolve, reject);
            } else {
                request = indexedDB.open(
                    options.server,
                    options.version
                );

                request.onsuccess = function(e) {
                    dbOpen(
                        e,
                        options.server,
                        options.version,
                        options.schema
                    ).then(resolve, reject);
                };

                request.onupgradeneeded = function(e) {
                    createSchema(e, options.schema, e.target.result);
                };
                request.onerror = function(e) {
                    reject(e);
                };
            }
        });
    },
};
