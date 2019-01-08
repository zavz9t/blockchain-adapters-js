'use strict';

/**
 * Contains list of constants
 * @typedef {Object} ChainConstant
 *
 * @property {String} STEEM Name of Steem chain adapter
 * @property {String} GOLOS Name of Golos chain adapter
 * @property {String} VOX Name of VOX chain adapter
 * @property {String} WLS Name of WhaleShares chain adapter
 * @property {String} WEKU Name of Weku chain adapter
 * @property {String} SEREY Name of Serey chain adapter
 * @property {String} SMOKE Name of Smoke chain adapter
 * @property {String} VIZ Name of VIZ chain adapter
 *
 * @property {String} COMMENT_APP_NAME Default name of app for comment/post creation
 * @property {String} COMMENT_FORMAT Default format for comment/post creation
 */
let ChainConstant = {}
    , supportedChains = {
        steem: `STEEM`
        , golos: `GOLOS`
        , vox: `VOX`
        , wls: `WLS`
        , weku: `WEKU`
        , serey: `SEREY`
        , smoke: `SMOKE`
        , viz: `VIZ`
        , "chain-tools-js": `COMMENT_APP_NAME`
        , "markdown": `COMMENT_FORMAT`
    }
;

for (let propValue in supportedChains) {
    Object.defineProperty(
        ChainConstant,
        supportedChains[propValue],
        {
            value: propValue,
            writable: false,
            enumerable: true
        }
    );
}

module.exports = ChainConstant;
