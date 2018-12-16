'use strict';

const STEEMIT_BANDWIDTH_AVERAGE_WINDOW_SECONDS = 60 * 60 * 24 * 7
    , STEEM_VOTING_MANA_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
    , STEEM_RC_MANA_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
    , CHAIN_ENERGY_REGENERATION_SECONDS = 432000 // 432000 sec = 5 days
;

let numeral = require(`numeral`);

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
}

module.exports = ChainTool;
