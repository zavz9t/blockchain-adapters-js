'use strict';

const BetterValidator = require(`better-validator`)
    , { sprintf } = require(`sprintf-js`)
;

module.exports = class {

    /**
     * Validates input arguments of AbstractAdapter::broadcastComment method
     * @param {string} author
     * @param {string} wif
     * @param {string} body
     * @param {Object} options
     *
     * @return {Array} An array of errors, empty - no errors
     */
    static validateBroadcastCommentArguments(author, wif, body, options) {
        const validator = new BetterValidator();

        validator(author).display(`author`).required().isString().notEmpty();
        validator(wif).display(`wif`).required().isString().notEmpty();
        validator(body).display(`body`).required().isString().notEmpty();

        validator(options).display(`options`).required().isObject((obj) => {
            obj(`app`).isString().notEmpty();
            obj(`format`).isString().notEmpty();
            obj(`parent_author`).if(
                (value) => (undefined === value || null === value || `` === value)
                , (conditional) => { // post case
                    obj(`title`).required().isString().notEmpty();
                    obj(`permlink`).isString().notEmpty();
                    obj(`tags`).required().isArray((item) => {
                        item.required().isString().notEmpty();
                    }).lengthInRange(1);
                }
            );
            obj(`parent_author`).if(
                (value) => (value && value.length > 0)
                , (conditional) => { // comment case
                    obj(`parent_author`).required().isString().notEmpty();
                    obj(`parent_permlink`).required().isString().notEmpty();
                }
            );
        });

        return validator.run();
    }

};
