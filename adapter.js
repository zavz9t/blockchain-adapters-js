'use strict';

const appName = `@chain-post`
    , keyConnBusy = `busy`
;

let items = {};

const { sprintf } = require(`sprintf-js`)
    , sleep = require(`sleep-promise`)
    , jQuery = require(`jquery`)
    , AdapterValidator = require(`./validator/AdapterValidator`)
    , ChainConstant = require(`./constant`)
    , ChainTool = require(`./tool`)
;

const _buildPostOperation = Symbol(`buildPostOperation`)
    , _buildCommentOperation = Symbol(`buildCommentOperation`)
;

class AbstractAdapter {

    constructor() {
        this.name = null;
        this.connection = null;
    }

    reconnect() {}

    /**
     * Returns currency of implementing BlockChain
     * @return {string}
     */
    getCurrency() {
        throw new Error(`Need to implement in subclasses!`);
    }

    /**
     * @param {string} chainName Unique name of Chain
     * @param {boolean} fresh If true - will create new instance,
     *                          false - will return existing one
     *
     * @returns {AbstractAdapter}
     *
     * @throws Error If given Chain is not supported yet.
     */
    static factory(chainName, fresh = false) {
        if (fresh && (chainName in items)) {
            delete items[chainName];
        }
        if (!(chainName in items)) {
            switch (chainName) {
                case ChainConstant.STEEM:
                    items[chainName] = new Steem();
                    break;
                case ChainConstant.GOLOS:
                    items[chainName] = new Golos();
                    break;
                case ChainConstant.VOX:
                    items[chainName] = new Vox();
                    break;
                case ChainConstant.WLS:
                    items[chainName] = new Wls();
                    break;
                case ChainConstant.SEREY:
                    items[chainName] = new Serey();
                    break;
                case ChainConstant.WEKU:
                    items[chainName] = new Weku();
                    break;
                case ChainConstant.SMOKE:
                    items[chainName] = new Smoke();
                    break;
                case ChainConstant.VIZ:
                    items[chainName] = new Viz();
                    break;
                default:
                    throw new Error(sprintf(
                        `Chain "%s" is not implemented yet!`,
                        chainName
                    ));
            }
        }

        return items[chainName];
    }

    /**
     * Returns default value for "max_accepted_payout" comment option
     * @return {string}
     */
    getDefaultMaxAcceptedPayout() {
        return `1000000.000 ` + this.getCurrency();
    }

    /**
     * Returns default value for "percent_steem_dollars" comment option
     * @return {number}
     */
    getDefaultPercentSteemDollars() {
        return 10000;
    }

    /**
     * Returns default value for "allow_votes" comment option
     * @return {boolean}
     */
    getDefaultAllowVotes() {
        return true;
    }

    /**
     * Returns default value for "allow_curation_rewards" comment option
     * @return {boolean}
     */
    getDefaultAllowCurationRewards() {
        return true;
    }

    /**
     * Builds beneficiaries in Chain format received from input options
     * @param {Object} bOptions
     * @return {{account: string, weight: number}[]}
     */
    buildBeneficiariesFromOptions(bOptions) {
        let beneficiaries = [];
        for (let username in bOptions) {
            beneficiaries.push({
                account: username,
                weight: bOptions[username] * 100,
            });
        }

        return beneficiaries;
    }

    static buildJsonMetadata(tags, options) {
        let imagesList = [];
        if (options && `images` in options) {
            imagesList = options.images;
        }

        return {
            app: appName,
            format: `markdown`,
            tags: tags,
            image: imagesList
        }
    }

    static buildBeneficiaries(options) {
        return [ {account: `chain-post`, weight: 500} ]
    }

    static buildPermlink(postTitle) {
        return tool.stripAndTransliterate(postTitle, `-`, ``);
    }

    static getPlaceholders() {
        return constant.placeholders;
    }

    isWif(wif) {
        return this.connection.auth.isWif(wif);
    }

    async isWifValid(username, wif, successCallback, failCallback)
    {
        while (true === this.connection.config.get(keyConnBusy)) {
            console.info(this.name + `:isWifValid: wait execution for 1 sec`);

            await sleep(1000);
        }

        this.reconnect();
        let instance = this;

        instance.connection.config.set(keyConnBusy, true);
        instance.connection.api.getAccounts([username], function (err, result) {
            if (err) {
                failCallback(err.toString());

                instance.connection.config.set(keyConnBusy, false);

                return;
            }
            if (result.length < 1) {
                failCallback(sprintf(`Account "%s" was not found at "%s" server.`, username, instance.name));

                instance.connection.config.set(keyConnBusy, false);

                return;
            }

            let pubWif = result[0].posting.key_auths[0][0]
                , isValid = false;

            try {
                isValid = instance.connection.auth.wifIsValid(wif, pubWif);
            } catch(e) {
                console.error(instance.name, e);
            }

            instance.connection.config.set(keyConnBusy, false);

            if (isValid) {
                successCallback(instance.name, username, wif);
            } else {
                failCallback(sprintf(
                    `Received WIF and username "%s" are not match at "%s" server.`,
                    username,
                    instance.name
                ));
            }
        });
    }

    publish(wif, author, postTitle, postBody, tags, options)
    {
        let operations = this.buildOperations(author, postTitle, postBody, tags, options);

        if (tool.isTest()) {
            console.log(this.name, operations);
            tool.handleSuccessfulPost(this.name, operations);
        } else {
            this.broadcastSend(wif, author, this.constructor.buildPermlink(postTitle), operations);
        }
    }

    buildOperations(author, postTitle, postBody, tags, options)
    {
        let permlink = this.constructor.buildPermlink(postTitle)
            , beneficiaries = this.constructor.buildBeneficiaries(options, author)
            , operations = [
                [
                    `comment`,
                    {
                        parent_author: ``,
                        parent_permlink: tags[0],
                        author: author,
                        permlink: permlink,
                        title: postTitle,
                        body: this.buildPostBody(postBody),
                        json_metadata: JSON.stringify(this.constructor.buildJsonMetadata(tags, options))
                    }
                ],
                [
                    `comment_options`,
                    {
                        author: author,
                        permlink: permlink,
                        max_accepted_payout: this.getDefaultMaxAcceptedPayout(),
                        percent_steem_dollars: this.getDefaultPercentSteemDollars(),
                        allow_votes: this.getDefaultAllowVotes(),
                        allow_curation_rewards: this.getDefaultAllowCurationRewards(),
                    }
                ]
            ]
        ;
        if (beneficiaries && beneficiaries.length > 0) {
            operations[1][1][`extensions`] = [[
                0,
                {
                    beneficiaries: beneficiaries
                }
            ]];
        }
        return operations;
    }

    buildPostBody(postBody)
    {
        let placeholders = this.constructor.getPlaceholders();
        for (let key in placeholders) {
            postBody = postBody.replace(new RegExp(key, 'g'), placeholders[key]);
        }

        return tool.stripPlaceholders(postBody) + constant.postBodySign;
    }

    async broadcastSend(wif, author, permlink, operations)
    {
        while (true === this.connection.config.get(keyConnBusy)) {
            console.info(this.name + `:broadcastSend: wait execution for 1 sec`);

            await sleep(1000);
        }

        this.reconnect();
        let adapterInstance = this;

        adapterInstance.processGetGetContent(author, permlink, this.getReturnVotesParameter(), function(err, result) {
            if (err) {
                tool.handlePublishError(adapterInstance.name, err);
                adapterInstance.connection.config.set(keyConnBusy, false);

                return;
            }

            if (result[`permlink`] === permlink) {
                permlink = permlink + `-` + Math.floor(Date.now() / 1000);

                operations[0][1][`permlink`] = permlink;
                if (1 in operations) {
                    operations[1][1][`permlink`] = permlink;
                }
            }

            adapterInstance.connection.broadcast.send(
                {'extensions': [], 'operations': operations},
                {'posting': wif},
                function (err, result) {
                    adapterInstance.connection.config.set(keyConnBusy, false);
                    if (!err) {
                        tool.handleSuccessfulPost(adapterInstance.name, result);
                    } else {
                        tool.handlePublishError(adapterInstance.name, err);
                    }
                }
            );
        });
    }

    async processGetGetContent(author, permlink, votes, callback)
    {
        this.connection.config.set(keyConnBusy, true);
        if (votes === null) {
            this.connection.api.getContent(author, permlink, function (err, result) {
                callback(err, result);
            });
        } else {
            this.connection.api.getContent(author, permlink, votes, function (err, result) {
                callback(err, result);
            });
        }
    }

    /**
     * Returns parameter for "apiGetContent" method
     * In some Chains api.getContent method require third parameter
     * which indicates does this call will return active votes for comment or not
     *
     * @return {null|number}
     */
    getReturnVotesParameter() {
        return null
    }

    vote(url, accounts)
    {
        let params = tool.parsePostUrl(url);

        this.reconnect();
        let adapterInstance = this;

        this.processGetGetContent(params[`author`], params[`permlink`], this.getReturnVotesParameter(), function(err, result) {
            if (err) {
                tool.handlePublishError(adapterInstance.name, err);

                return;
            }
            if (result.id === 0) {
                tool.handlePublishError(
                    adapterInstance.name,
                    sprintf(
                        `Post with url: "%s" was not found at "%s" chain.`,
                        url,
                        constant.adapterDisplayNames[adapterInstance.name]
                    )
                );

                return;
            }

            for (let i in result.active_votes) {
                if (result.active_votes[i].voter in accounts) {
                    delete accounts[result.active_votes[i].voter];
                }
            }

            if (tool.isEmptyObject(accounts)) {
                tool.handlePublishWarning(adapterInstance.name, `This post were upvoted by chosen accounts earlier.`)

                return;
            }

            let operations = adapterInstance.buildVoteOperations(params[`author`], params[`permlink`], 10000, accounts);

            if (tool.isTest()) {
                console.log(operations, Object.values(accounts));
                tool.finishPublishing();

                return;
            }

            adapterInstance.connection.broadcast.send(
                {'extensions': [], 'operations': operations},
                Object.values(accounts),
                function (err, result) {
                    if (!err) {
                        tool.handleSuccessfulVote(adapterInstance.name, Object.keys(accounts));
                    } else {
                        tool.handlePublishError(adapterInstance.name, err);
                    }
                }
            );
        });
    }

    /**
     * Provides account information for specified username
     * @param {string} username
     * @returns {Promise<Object>}
     */
    async apiGetAccount(username)
    {
        const currentInstance = this;
        return new Promise((resolve, reject) => {
            currentInstance.reconnect();
            currentInstance.connection.api.getAccounts([username], function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    if (result.length) {
                        resolve(result[0]);
                    } else {
                        reject(new Error(sprintf(
                            `Account "%s" not found in "%s" BlockChain.`
                            , username
                            , currentInstance.name
                        )));
                    }
                }
            });
        });
    }

    /**
     * Provides information about post/comment
     * @param {string}   author   Username of author
     * @param {string}   permlink
     * @param {int|null} votes    Need to return active votes of post/comment. Null - this not implemented in library
     * @returns {Promise<Object>}
     */
    async apiGetContent(author, permlink, votes = null)
    {
        const currentInstance = this;
        return new Promise((resolve, reject) => {
            const callbackFunction = function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            };

            currentInstance.reconnect();
            if (votes === null) {
                currentInstance.connection.api.getContent(author, permlink, callbackFunction);
            } else {
                currentInstance.connection.api.getContent(author, permlink, votes, callbackFunction);
            }
        });
    }

    /**
     * Performs vote operation for post/comment
     * @param {string} voter    Username of voter
     * @param {string} wif      Private key (WIF) of voter
     * @param {string} author   Username of author
     * @param {string} permlink
     * @param {int}    weight   Weight of vote
     * @returns {Promise<Object>}
     */
    async broadcastVote(voter, wif, author, permlink, weight)
    {
        const currentInstance = this;
        return new Promise((resolve, reject) => {
            currentInstance.connection.broadcast.send(
                {
                    extensions: []
                    , operations: [[
                        `vote`,
                        {
                            voter: voter,
                            author: author,
                            permlink: permlink,
                            weight: weight
                        }
                    ]]
                },
                { posting: wif },
                function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    /**
     * Performs publish comment/post operation
     * @param {string} author Username of comment's author
     * @param {string} wif Private key (WIF) of author
     * @param {string} body Text of comment/post
     * @param {Object} options Additional options
     *                          - title
     *                          - permlink
     *                          - tags
     *                          - app
     *                          - format
     *                          - parent_author
     *                          - parent_permlink
     *                          - beneficiaries
     *
     * @returns {Promise<Object>}
     */
    async broadcastComment(author, wif, body, options)
    {
        const validationErrors = AdapterValidator.validateBroadcastCommentArguments(
            author
            , wif
            , body
            , options
        );
        if (validationErrors.length > 0) {
            return new Promise((resolve, reject) => {
                reject(new Error(
                    `Validation errors: ` + JSON.stringify(validationErrors)
                ));
            });
        }

        const currentInstance = this
            , operations = []
        ;
        let currentOptions = Object.assign({}, options);
        currentOptions.app = options.app || ChainConstant.COMMENT_APP_NAME;
        currentOptions.format = options.format || ChainConstant.COMMENT_FORMAT;

        let commentOperation = null;
        if (
            false === (`parent_author` in options)
            || false === Boolean(options.parent_author)
        ) {
            commentOperation = await this[_buildPostOperation](
                author
                , body
                , currentOptions
            );
        } else {
            commentOperation = await this[_buildCommentOperation](
                author
                , body
                , currentOptions
            );
        }
        operations.push(commentOperation);

        if (`beneficiaries` in options && options.beneficiaries) {
            operations.push([
                `comment_options`,
                {
                    author: author,
                    permlink: commentOperation[1].permlink,
                    max_accepted_payout: this.getDefaultMaxAcceptedPayout(),
                    percent_steem_dollars: this.getDefaultPercentSteemDollars(),
                    allow_votes: this.getDefaultAllowVotes(),
                    allow_curation_rewards: this.getDefaultAllowCurationRewards(),
                    extensions: [[
                        0,
                        { beneficiaries: this.buildBeneficiariesFromOptions(options.beneficiaries) },
                    ]],
                }
            ]);
        }

        return new Promise((resolve, reject) => {
            currentInstance.reconnect();
            currentInstance.connection.broadcast.send(
                { extensions: [], operations: operations },
                { posting: wif },
                function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    async processAccountsInfo(accounts, callback)
    {
        let adapterInstance = this;

        adapterInstance.reconnect();
        adapterInstance.connection.api.getDynamicGlobalProperties(function(err, dynamicProperties) {
            if (err) {
                console.error(sprintf(
                    `%s: Failed to load dynamic global properties`,
                    adapterInstance.name
                ));
                console.error(err);

                return;
            }

            adapterInstance.reconnect();
            adapterInstance.connection.api.getAccounts(accounts, function (err, result) {
                if (err) {
                    console.error(sprintf(
                        `%s: Failed to load accounts: "%s"`,
                        adapterInstance.name,
                        JSON.stringify(accounts)
                    ));
                    console.error(err);

                    return;
                }

                callback(result, dynamicProperties);
            });
        });
    }

    async processContent(url, callback)
    {
        let params = tool.parsePostUrl(url);

        this.reconnect();
        let adapterInstance = this;

        this.processGetGetContent(params[`author`], params[`permlink`], this.getReturnVotesParameter(), function(err, result) {
            if (err) {
                console.error(adapterInstance.name + `\n- - -\n` + err);

                return;
            }
            if (result.id === 0) {
                console.error(
                    sprintf(
                        `Post with url: "%s" was not found at "%s" chain.`,
                        url,
                        constant.adapterDisplayNames[adapterInstance.name]
                    )
                );

                return;
            }

            let tags = ``
                , tagsKey = `tags`
                , images = ``
                , imagesKey = `image`
                , jsonMetadata = JSON.parse(result.json_metadata)
            ;

            if (tagsKey in jsonMetadata) {
                tags = jsonMetadata[tagsKey].join(` `)
            }
            if (imagesKey in jsonMetadata) {
                images = JSON.stringify(jsonMetadata[imagesKey])
            }

            callback(result.title, result.body, tags, images);
        });
    }

    buildVoteOperations(author, permlink, weight, accounts)
    {
        let operations = [];
        for (let username in accounts) {
            operations.push([
                `vote`,
                {
                    voter: username,
                    author: author,
                    permlink: permlink,
                    weight: weight
                }
            ]);
        }

        return operations;
    }

    async claimRewardBalance(wif, username, successCallback, failCallback)
    {
        let adapterInstance = this;

        this.reconnect();
        this.processAccountsInfo([username], function (accounts, gp) {
            if (accounts.length !== 1) {
                if (failCallback) {
                    failCallback(sprintf(`User "%s" not found in "%s" chain.`, username, adapterInstance.name));
                }
                console.error(message);

                return;
            }

            adapterInstance.claimRewardBalanceProcess(wif, accounts[0], gp, successCallback, failCallback);
        });
    }

    async claimRewardBalanceProcess(wif, account, gp, successCallback, failCallback) {
        let adapterInstance = this;

        this.connection.broadcast.claimRewardBalance(
            wif
            , account.name
            , account.reward_steem_balance
            , account.reward_sbd_balance
            , account.reward_vesting_balance
            , function(error, result) {
                if (error) {
                    failCallback(sprintf(`Failed to claim rewards of "%s" account.`, account.name));
                    console.error(error);

                    return;
                }

                adapterInstance.connection.api.getAccounts([account.name], function(error, result) {
                    if (error) {
                        failCallback(sprintf(`Failed to load new account "%s" data.`, account.name));
                        console.error(error);

                        return;
                    }

                    successCallback(result[0], gp);
                });
            }
        );
    }

    // private methods

    /**
     * Builds "comment" operation for broadcast request at new Post case
     * @param {string} author
     * @param {string} body
     * @param {Object} options
     * @return {Promise<*[]>}
     */
    async [_buildPostOperation](author, body, options) {
        const tags = options.tags.map((item) => {
            return ChainTool.stripAndTransliterate(item);
        });
        let permlink = options.permlink
            || ChainTool.stripAndTransliterate(options.title)
        ;

        this.reconnect();
        const postContent = await this.apiGetContent(
            author
            , permlink
            , this.getReturnVotesParameter()
        );
        if (postContent.id > 0) {
            permlink = ChainTool.buildUniquePermlink(permlink);
        }

        return [
            `comment`
            , {
                parent_author: ``
                , parent_permlink: tags[0]
                , author: author
                , permlink: permlink
                , title: options.title
                , body: body
                , json_metadata: JSON.stringify({
                    app: options.app
                    , format: options.format
                    , tags: tags
                }),
            }
        ];
    }

    /**
     * Builds "comment" operation for broadcast request at new Comment case
     * @param {string} author
     * @param {string} body
     * @param {Object} options
     * @return {Promise<*[]>}
     */
    async [_buildCommentOperation](author, body, options) {
        this.reconnect();
        const postContent = await this.apiGetContent(
            options.parent_author
            , options.parent_permlink
            , this.getReturnVotesParameter()
        );
        if (0 === postContent.id) {
            return new Promise((resolve, reject) => {
                reject(new Error(sprintf(
                    `Cannot find post "%s" to add comment to it.`
                    , JSON.stringify({
                        author: options.parent_author,
                        permlink: options.parent_permlink,
                    })
                )));
            });
        }
        let tags = [];
        try {
            const metadata = JSON.parse(postContent.json_metadata);
            if (`tags` in metadata && metadata.tags) {
                tags = metadata.tags;
            }
        } catch (err) {}

        return [
            `comment`
            , {
                parent_author: options.parent_author
                , parent_permlink: options.parent_permlink
                , author: author
                , permlink: ChainTool.buildCommentPermlink(
                    options.parent_author
                    , options.parent_permlink
                )
                , title: ``
                , body: body
                , json_metadata: JSON.stringify({
                    app: options.app
                    , format: options.format
                    , tags: tags
                }),
            }
        ];
    }
}

class Steem extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.STEEM;
        this.connection = require(`@steemit/steem-js`);

        if (false === this.connection.config.get(keyConnBusy)) {
            this.reconnect();
        }
    }

    getCurrency() {
        return `SBD`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.steemPlaceholders);
    }

    reconnect() {
        this.connection.api.setOptions({ url: `https://api.steemit.com` });
        this.connection.config.set(`address_prefix`, `STM`);
        this.connection.config.set(`chain_id`, `0000000000000000000000000000000000000000000000000000000000000000`);
    }

    async processAccountsInfo(accounts, callback) {
        function rcLoadCallback(resultAccounts, dynamicProperties) {
            // load RC data
            let requestData = {
                jsonrpc: `2.0`,
                id: 1,
                method: `rc_api.find_rc_accounts`,
                params: {
                    accounts: accounts
                }
            };
            jQuery.ajax({
                url: `https://api.steemit.com`,
                type: `POST`,
                data: JSON.stringify(requestData),
                success: function (response) {
                    let nameToIndex = {};
                    for (let i in resultAccounts) {
                        nameToIndex[resultAccounts[i].name] = i;
                    }

                    for (let i in response.result.rc_accounts) {
                        let account = response.result.rc_accounts[i]
                            , key = nameToIndex[account.account]
                        ;
                        resultAccounts[key][`max_rc`] = account.max_rc;
                        resultAccounts[key][`max_rc_creation_adjustment`] = account.max_rc_creation_adjustment;
                        resultAccounts[key][`rc_manabar`] = account.rc_manabar;
                    }

                    callback(resultAccounts, dynamicProperties);
                },
                error: function(e) {
                    console.error(e);

                    callback(resultAccounts, dynamicProperties);
                }
            });
        }

        super.processAccountsInfo(accounts, rcLoadCallback);
    }
}

class Golos extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.GOLOS;
        this.connection = require(`golos-js`);
    }

    getCurrency() {
        return `GBG`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.golosPlaceholders);
    }

    static buildBeneficiaries(options)
    {
        let beneficiaries = super.buildBeneficiaries(options)
            , keyGolosIo = `as_golosio`
            , keyVik = `for_vik`
        ;

        if (keyGolosIo in options && options[keyGolosIo]) {
            beneficiaries.push({ account: `golosio`, weight: 1000 });
        }
        if (keyVik in options && options[keyVik]) {
            beneficiaries.push({ account: `vik`, weight: options[keyVik] * 100 });
            beneficiaries.push({ account: `netfriend`, weight: 1000 });
        }

        return beneficiaries;
    }

    reconnect() {
        this.connection.config.set(`websocket`, `wss://ws.golos.io`);
    }

    /**
     * @inheritdoc
     */
    getReturnVotesParameter() {
        return -1
    }
}

class Vox extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.VOX;
        this.connection = require(`@steemit/steem-js`);

        if (false === this.connection.config.get(keyConnBusy)) {
            this.reconnect();
        }
    }

    getCurrency() {
        return `GOLD`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.voxPlaceholders);
    }

    static buildBeneficiaries(options)
    {
        let beneficiaries = super.buildBeneficiaries(options)
            , keyDs = `for_ds`
        ;

        if (keyDs in options && options[keyDs]) {
            beneficiaries.push({ account: `denis-skripnik`, weight: 100 });
        }

        return beneficiaries;
    }

    static buildJsonMetadata(tags, options)
    {
        let metadata = super.buildJsonMetadata(tags, options)
            , keyDs = `for_ds`
        ;

        if (keyDs in options && options[keyDs]) {
            metadata[`tags`] = tags.concat([`dpos-post`]);
        }

        return metadata;
    }

    reconnect() {
        this.connection.api.setOptions({ url: `wss://vox.community/ws` });
        this.connection.config.set(`address_prefix`, `VOX`);
        this.connection.config.set(`chain_id`, `88a13f63de69c3a927594e07d991691c20e4cf1f34f83ae9bd26441db42a8acd`);
    }
}

class Wls extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.WLS;
        this.connection = require(`wlsjs-staging`);
        this.reconnect();
    }

    getCurrency() {
        return `WLS`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.wlsPlaceholders);
    }

    reconnect() {
        this.connection.api.setOptions({ url: `https://pubrpc.whaleshares.io` })
    }

    async claimRewardBalanceProcess(wif, account, gp, successCallback, failCallback) {
        let adapterInstance = this;

        this.connection.broadcast.claimRewardBalance(
            wif
            , account.name
            , account.reward_steem_balance
            , account.reward_vesting_balance
            , function(error, result) {
                if (error) {
                    failCallback(sprintf(`Failed to claim rewards of "%s" account.`, account.name));
                    console.error(error);

                    return;
                }

                adapterInstance.connection.api.getAccounts([account.name], function(error, result) {
                    if (error) {
                        failCallback(sprintf(`Failed to load new account "%s" data.`, account.name));
                        console.error(error);

                        return;
                    }

                    successCallback(result[0], gp);
                });
            }
        );
    }
}

class Serey extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.SEREY;
        this.connection = require(`@steemit/steem-js`);

        if (false === this.connection.config.get(keyConnBusy)) {
            this.reconnect();
        }
    }

    getCurrency() {
        return `SRD`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.sereyPlaceholders);
    }

    static getPercentSteemDollars()
    {
        return 0;
    }

    reconnect() {
        this.connection.api.setOptions({ url: `wss://serey.io/wss` });
        this.connection.config.set(`address_prefix`, `SRY`);
        this.connection.config.set(`chain_id`, `3b9a062c4c1f4338f6932ec8bfc083d99369df7479467bbab1811976181b0daf`);
    }
}

class Weku extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.WEKU;
        this.connection = require(`@steemit/steem-js`);

        if (false === this.connection.config.get(keyConnBusy)) {
            this.reconnect();
        }
    }

    getCurrency() {
        return `WKD`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.wekuPlaceholders);
    }

    static buildJsonMetadata(tags, options)
    {
        let metadata = super.buildJsonMetadata(tags, options);
        metadata[`tags`] = [`community-deals`].concat(tags);

        return metadata;
    }

    reconnect() {
        this.connection.api.setOptions({ url: `wss://standby.weku.io:8190` });
        this.connection.config.set(`address_prefix`, `WKA`);
        this.connection.config.set(`chain_id`, `b24e09256ee14bab6d58bfa3a4e47b0474a73ef4d6c47eeea007848195fa085e`);
    }
}

class Smoke extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.SMOKE;
        if (false === tool.isTerminal()) {
            this.connection = require(`./static/smoke-js.min`).smoke;
        }
    }

    getCurrency() {
        return `SMOKE`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.smokePlaceholders);
    }

    reconnect() {
        this.connection.api.setOptions({ url: `wss://rpc.smoke.io` });
    }

    buildOperations(author, postTitle, postBody, tags, options)
    {
        let operations = super.buildOperations(author, postTitle, postBody, tags, options);

        delete operations[1][1][`percent_steem_dollars`];

        return operations;
    }

    async claimRewardBalanceProcess(wif, account, gp, successCallback, failCallback) {
        let adapterInstance = this;

        this.connection.broadcast.claimRewardBalance(
            wif
            , account.name
            , account.reward_steem_balance
            , account.reward_vesting_balance
            , function(error, result) {
                if (error) {
                    failCallback(sprintf(`Failed to claim rewards of "%s" account.`, account.name));
                    console.error(error);

                    return;
                }

                adapterInstance.connection.api.getAccounts([account.name], function(error, result) {
                    if (error) {
                        failCallback(sprintf(`Failed to load new account "%s" data.`, account.name));
                        console.error(error);

                        return;
                    }

                    successCallback(result[0], gp);
                });
            }
        );
    }
}

class Viz extends AbstractAdapter
{
    constructor() {
        super();

        this.name = ChainConstant.VIZ;
        this.connection = require(`viz-world-js`);
    }

    getCurrency() {
        return `VIZ`;
    }

    static getPlaceholders()
    {
        return Object.assign({}, super.getPlaceholders(), constant.vizPlaceholders);
    }

    static buildJsonMetadata(tags, options)
    {
        let metadata = super.buildJsonMetadata(tags, options)
            , keyLiveBlogs = `as_liveblogs`
        ;

        if (keyLiveBlogs in options && options[keyLiveBlogs]) {
            metadata[`tags`] = tags.concat([`liveblogs`]);
        }

        return metadata;
    }

    static buildBeneficiaries(options, author)
    {
        let beneficiaries = super.buildBeneficiaries(options)
            , keyLiveBlogs = `as_liveblogs`
        ;

        if (keyLiveBlogs in options && options[keyLiveBlogs]) {
            let extraBeneficiaries = [{ account: `denis-skripnik`, weight: 100 }]
                , authorIncluded = false
            ;
            for (let i in beneficiaries) {
                if (beneficiaries[i].account === author) {
                    authorIncluded = true;
                    break;
                }
            }
            if (false === authorIncluded) {
                extraBeneficiaries.push({ account: author, weight: 1 });
            }

            beneficiaries = extraBeneficiaries.concat(beneficiaries);
        }

        return beneficiaries;
    }

    reconnect() {
        this.connection.config.set(`websocket`, `wss://ws.viz.ropox.tools`);
    }

    /**
     * @inheritdoc
     */
    getReturnVotesParameter() {
        return -1
    }

    async broadcastSend(wif, author, permlink, operations) {
        while (true === this.connection.config.get(keyConnBusy)) {
            console.info(this.name + `:broadcastSend: wait execution for 1 sec`);

            await sleep(1000);
        }

        this.reconnect();
        let adapterInstance = this;

        this.processGetGetContent(author, permlink, 0, function(err, result) {
            if (err) {
                tool.handlePublishError(adapterInstance.name, err);
                adapterInstance.connection.config.set(keyConnBusy, false);

                return;
            }

            if (result[`permlink`] === permlink) {
                permlink = permlink + `-` + Math.floor(Date.now() / 1000);

                operations[0][1][`permlink`] = permlink;
                operations[1][1][`permlink`] = permlink;
            }

            adapterInstance.connection.broadcast.content(
                wif,
                operations[0][1][`parent_author`],
                operations[0][1][`parent_permlink`],
                operations[0][1][`author`],
                operations[0][1][`permlink`],
                operations[0][1][`title`],
                operations[0][1][`body`],
                5000, // curation_percent - 50%
                operations[0][1][`json_metadata`],
                (`extensions` in operations[1][1]) ? operations[1][1][`extensions`] : [],
                function (err, result) {
                    adapterInstance.connection.config.set(keyConnBusy, false);
                    if (!err) {
                        tool.handleSuccessfulPost(adapterInstance.name, result);
                    } else {
                        tool.handlePublishError(adapterInstance.name, err);
                    }
                }
            );
        });
    }

    vote(url, accounts) {
        let params = tool.parsePostUrl(url);

        this.reconnect();
        let adapterInstance = this;

        this.processGetGetContent(params[`author`], params[`permlink`], this.getReturnVotesParameter(), function(err, result) {
            if (err) {
                tool.handlePublishError(adapterInstance.name, err);

                return;
            }
            if (result.id === 0) {
                tool.handlePublishError(
                    adapterInstance.name,
                    sprintf(
                        `Post with url: "%s" was not found at "%s" chain.`,
                        url,
                        constant.adapterDisplayNames[adapterInstance.name]
                    )
                );

                return;
            }

            for (let i in result.active_votes) {
                if (result.active_votes[i].voter in accounts) {
                    delete accounts[result.active_votes[i].voter];
                }
            }

            if (tool.isEmptyObject(accounts)) {
                tool.handlePublishWarning(adapterInstance.name, `This post were upvoted by chosen accounts earlier.`)

                return;
            }

            let operations = adapterInstance.buildVoteOperations(params[`author`], params[`permlink`], 10000, accounts);

            if (tool.isTest()) {
                console.log(operations, Object.values(accounts));
                tool.finishPublishing();

                return;
            }

            adapterInstance.connection.broadcast.send(
                {'extensions': [], 'operations': operations},
                Object.values(accounts),
                function (err, result) {
                    if (!err) {
                        tool.handleSuccessfulVote(adapterInstance.name, Object.keys(accounts));
                    } else {
                        tool.handlePublishError(adapterInstance.name, err);
                    }
                }
            );
        });
    }
}

module.exports = AbstractAdapter;
