'use strict';
const { createHandler } = require('../lib/addon');
module.exports = createHandler(require('../config.json'), require('../data/catalog.json'));
