'use strict';

const STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS = 60 * 60 * 24 * 7
    , STEEM_VOTING_MANA_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
    , STEEM_RC_MANA_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
    , CHAIN_ENERGY_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
;

const numeral = require(`numeral`)
    , { sprintf } = require(`sprintf-js`)
    , urlParse = require(`url-parse`)
    , moment = require(`moment`)
    , commentPermlinkPattern = `re-%s-%s-%s`
    , permlinkDatetimeFormat = `YYYYMMDD[t]HHmmss[z]`
;

class ChainTool {

    static calculateAccountReputation(account) {
        let out = Math.log10(account.reputation);
        if (isNaN(out)) {
            out = 0;
        }
        out = Math.max(out - 9, 0);
        out = ((out < 0) ? -1 : 1) * out;
        out = (out * 9) + 25;

        return out.toFixed(2);
    }

    static vestsToPower(vests, gp) {
        let totalVestingFundSteem = (`total_vesting_fund_steem` in gp)
            ? parseFloat(gp.total_vesting_fund_steem.split(` `)[0])
            : parseFloat(gp.total_vesting_fund.split(` `)[0])
            , totalVestingShares = parseFloat(gp.total_vesting_shares.split(` `)[0])
            , steemPerVests = 1e6 * totalVestingFundSteem / totalVestingShares
            , accountVests = parseFloat(vests.split(` `)[0]);

        return accountVests / 1e6 * steemPerVests
    }

    static formatPower(power) {
        return numeral(power).format(`0,0.000`);
    }

    static calculateAccountOwnPower(account, gp, raw) {
        let value = ChainTool.vestsToPower(account.vesting_shares, gp);

        return raw ? value : ChainTool.formatPower(value)
    }

    static calculateAccountReceivedPower(account, gp, raw) {
        if (!(`received_vesting_shares` in account)) {
            return 0;
        }

        let value = ChainTool.vestsToPower(account.received_vesting_shares, gp);

        return raw ? value : ChainTool.formatPower(value)
    }

    static calculateAccountDelegatedPower(account, gp, raw) {
        if (!(`delegated_vesting_shares` in account)) {
            return 0;
        }

        let value = ChainTool.vestsToPower(account.delegated_vesting_shares, gp);

        return raw ? value : ChainTool.formatPower(value)
    }

    static calculateAccountFullPower(account, gp, raw) {
        let value = ChainTool.calculateAccountOwnPower(account, gp, true)
            + ChainTool.calculateAccountReceivedPower(account, gp, true)
            - ChainTool.calculateAccountDelegatedPower(account, gp, true)
        ;

        return raw ? value : ChainTool.formatPower(value)
    }

    static calculateAccountVotingPower(account) {
        if (`voting_manabar` in account) {
            let totalShares = parseFloat(account.vesting_shares)
                + parseFloat(account.received_vesting_shares)
                - parseFloat(account.delegated_vesting_shares)
                - parseFloat(account.vesting_withdraw_rate)
                , elapsed = Math.floor(Date.now() / 1000) - account.voting_manabar.last_update_time
                , maxMana = totalShares * 1000000
                , currentMana = parseFloat(account.voting_manabar.current_mana) + elapsed * maxMana / STEEM_VOTING_MANA_REGENERATION_SECONDS
            ;

            if (currentMana > maxMana) {
                currentMana = maxMana;
            }

            return (currentMana * 100 / maxMana).toFixed(2);
        } else if (`energy` in account) {
            return (ChainTool.calculateVpCurrentValue(account, `energy`) / 100)
        } else {
            return (ChainTool.calculateVpCurrentValue(account, `voting_power`) / 100)
        }
    }

    static calculateVpCurrentValue(account, key) {
        let lastVoteTime = Date.parse(account.last_vote_time)
            , deltaTime = parseInt((new Date().getTime() - lastVoteTime + (new Date().getTimezoneOffset() * 60000)) / 1000)
            , currentValue = parseInt(account[key] + (deltaTime * 10000 / CHAIN_ENERGY_REGENERATION_SECONDS))
        ;
        if (currentValue > 10000) {
            currentValue = 10000;
        }

        return currentValue;
    }

    static formatBalance(balance) {
        let parts = balance.split(` `);

        parts[0] = ChainTool.formatPower(parts[0]);

        return parts.join(` `)
    }

    static calculateAccountEstimatedValue(account, gp) {

    }

    /**
     * Parses URL of post in any Chain and returns Object with it author and permlink
     * @param {string} url
     * @returns {Object|null} Object where "author" is author of post and "permlink" it's permlink
     *                          or null on fail
     */
    static parsePostUrl(url) {
        if (!url) {
            return null;
        }

        let parsed = urlParse(url.toLowerCase())
            , parts = parsed.pathname.split(`/`)
            , queryParams = this.parseQueryParams(parsed.query)
            , authorIndex = 0
        ;
        if (`author` in queryParams && `permlink` in queryParams) {
            return {
                author: queryParams[`author`]
                , permlink: queryParams[`permlink`]
            };
        }

        for (let i in parts) {
            if (parts[i].length === 0) {
                continue;
            }
            if (parts[i][0] === `@`) {
                authorIndex = i * 1;
                break;
            }
        }
        if (authorIndex === 0) {
            return null;
        }

        return {
            author: parts[authorIndex].slice(1),
            permlink: parts[authorIndex + 1]
        };
    }

    /**
     * Parses URL query string and returns Object with it
     * @param {string} queryString
     * @return {Object}
     */
    static parseQueryParams(queryString) {
        if (queryString[0] === `?`) {
            queryString = queryString.slice(1);
        }
        let queryParts = queryString.split(`&`)
            , queryParams = {}
        ;

        for (let i in queryParts) {
            let [key, val] = queryParts[i].split(`=`);
            queryParams[key] = decodeURIComponent(val);
        }

        return queryParams;
    }

    /**
     * Perform transliteration cyrillic symbols to latin and strip not allowed symbols
     * @param {string} input
     * @param {string} spaceReplacement
     * @param {string} ruPrefix
     *
     * @returns {string}
     */
    static stripAndTransliterate(input, spaceReplacement = `-`, ruPrefix = `ru--`) {
        let translitAssoc = {
            "ые": "yie",
            "щ": "shch",
            "ш": "sh",
            "ч": "ch",
            "ц": "cz",
            "й": "ij",
            "ё": "yo",
            "э": "ye",
            "ю": "yu",
            "я": "ya",
            "х": "kh",
            "ж": "zh",
            "а": "a",
            "б": "b",
            "в": "v",
            "ґ": "g",
            "г": "g",
            "д": "d",
            "е": "e",
            "є": "e",
            "з": "z",
            "и": "i",
            "і": "i",
            "ї": "i",
            "к": "k",
            "л": "l",
            "м": "m",
            "н": "n",
            "о": "o",
            "п": "p",
            "р": "r",
            "с": "s",
            "т": "t",
            "у": "u",
            "ф": "f",
            "ъ": "xx",
            "ы": "y",
            "ь": "x"
        };

        if (!input) {
            return ``;
        }

        let result = input.toLowerCase()
            .replace(/[\s,\.\/]/g, spaceReplacement)
        ;

        let origResult = result;
        for (let ruChar in translitAssoc) {
            result = result.replace(new RegExp(ruChar, 'gu'), translitAssoc[ruChar]);
        }
        let containRu = false;
        if (origResult !== result) {
            containRu = true;
        }

        result = result.replace(new RegExp('[^a-z0-9\\' + spaceReplacement + ']', 'g'), '')
            .replace(new RegExp(spaceReplacement + '+', 'g'), spaceReplacement);

        if (result[0] === spaceReplacement) {
            result = result.substring(1);
        }
        if (result[result.length - 1] === spaceReplacement) {
            result = result.substring(0, result.length - 1);
        }

        // If string include ru character it should be prefixed by special prefix to roll back
        if (containRu) {
            result = ruPrefix + result;
        }

        return result;
    }

    /**
     * Builds permlink for new comment
     * @param {string} postAuthor
     * @param {string} postPermlink
     *
     * @return {string|null} Constructed permlink or null on fail
     */
    static buildCommentPermlink(postAuthor, postPermlink) {
        if (false === Boolean(postAuthor) || false === Boolean(postPermlink)) {
            return null;
        }

        return sprintf(
            commentPermlinkPattern
            , postAuthor
            , postPermlink
            , moment().utc().format(permlinkDatetimeFormat)
        );
    }

    /**
     * Builds unique permlink from given one
     * @param {string} permlink
     *
     * @return {string}
     */
    static buildUniquePermlink(permlink) {
        return sprintf(
            `%s-%s`
            , permlink
            , moment().utc().format(permlinkDatetimeFormat)
        );
    }

}

module.exports = ChainTool;
