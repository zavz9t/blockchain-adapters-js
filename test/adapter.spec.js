'use strict';

const faker = require(`faker`)
    , sandbox = require(`sinon`).createSandbox()
    , ChainAdapter = require(`../adapter`)
    , ChainConstant = require(`../constant`)
    , ChainTool = require(`../tool`)
;

describe(`adapter`, () => {

    afterEach(() => {
        // completely restore all fakes created through the sandbox
        sandbox.restore();
    });

    describe(`WekuAdapter`, () => {

        const adapter = ChainAdapter.factory(ChainConstant.WEKU);
        let adapterMock = null;

        beforeEach(() => {
            adapterMock = sandbox.mock(adapter);
        });

        const errorDataProvider = [
            {
                input: []
                , errorContain: `"author"`
                , message: `Cannot create "comment" without arguments.`
            },
            {
                input: [``, ``, ``, {}]
                , errorContain: `"author"`
                , message: `Empty arguments are not allowed.`
            },
            {
                input: [`author`, `wif`, `body`, {}]
                , errorContain: `"options"`
                , message: `"options" cannot be empty.`
            },
            {
                input: [`author`, `wif`, `body`, { app: `some-app` }]
                , errorContain: `"title"`
                , message: `"title" required in "options" at new Post case.`
            },
            {
                input: [`author`, `wif`, `body`, { title: `` }]
                , errorContain: `"title"`
                , message: `"title" cannot be empty in "options" at new Post case.`
            },
            {
                input: [`author`, `wif`, `body`, { title: `some-title`, app: `` }]
                , errorContain: `"app"`
                , message: `"app" cannot be empty in "options".`
            },
            {
                input: [`author`, `wif`, `body`, { title: `some-title`, format: `` }]
                , errorContain: `"format"`
                , message: `"format" cannot be empty in "options".`
            },
            {
                input: [`author`, `wif`, `body`, { title: `some-title`, permlink: `` }]
                , errorContain: `"permlink"`
                , message: `"permlink" cannot be empty in "options".`
            },
            {
                input: [
                    `author`
                    , `wif`
                    , `body`
                    , {
                        parent_author: `some-author`
                        , parent_permlink: ``
                    }
                ]
                , errorContain: `"parent_permlink"`
                , message: `"parent_permlink" required in "options" at comment case.`
            },
            {
                input: [
                    `author`
                    , `wif`
                    , `body`
                    , { title: `some-title` }
                ]
                , errorContain: `"tags"`
                , message: `"tags" are required in "options" at Post case.`
            },
            {
                input: [
                    `author`
                    , `wif`
                    , `body`
                    , { title: `some-title`, tags: [] }
                ]
                , errorContain: `"tags"`
                , message: `"tags" cannot be empty in "options" at Post case.`
            },
        ];

        errorDataProvider.forEach(({ input, errorContain, message }) => {
            it(`When called with "${input}" arguments`, async () => {
                // given
                const broadcastMock = sandbox.mock(adapter.connection.broadcast);
                broadcastMock.expects(`send`).never();

                adapterMock.expects(`reconnect`).never();
                adapterMock.expects(`apiGetContent`).never();

                // when
                let resultError = null;
                try {
                    await adapter.broadcastComment.apply(adapter, input);
                } catch (err) {
                    resultError = err;
                }

                // then
                if (null === resultError) {
                    should.fail(message);
                } else {
                    resultError.should.be.an(`error`);
                    resultError.message.should.have.string(
                        errorContain
                        , `Expected validator should fail.`
                    );
                }

                broadcastMock.verify();
                adapterMock.verify();
            });
        });

        it(`should create basic post`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
            ;

            const expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(postTitle)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: ``
                            , parent_permlink: expectedTags[0]
                            , author: postAuthor
                            , permlink: expectedPermlink
                            , title: postTitle
                            , body: postBody
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: expectedTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, expectedPermlink, adapter.getReturnVotesParameter())
                .resolves({ id: 0 })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , { title: postTitle, tags: tags }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should handle error at "apiGetContent" call`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , tags = faker.random.words(5).split(` `)
            ;

            const expectedPermlink = ChainTool.stripAndTransliterate(postTitle);

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`).never();

            adapterMock.expects(`reconnect`).once();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, expectedPermlink, adapter.getReturnVotesParameter())
                .rejects(`Something bad happens.`)
            ;

            // when
            let resultError = null;
            try {
                await adapter.broadcastComment(
                    postAuthor
                    , authorWif
                    , postBody
                    , {title: postTitle, tags: tags}
                );
            } catch (err) {
                resultError = err;
            }

            // then
            if (null === resultError) {
                should.fail(`Post creation should throw an error.`);
            } else {
                resultError.should.be.an(`error`);
            }

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should handle permlink duplicate case`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
            ;

            const expectedResult = { success: true }
                , originalPermlink = ChainTool.stripAndTransliterate(postTitle)
                , expectedPermlink = faker.random.alphaNumeric(32)
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildUniquePermlink`)
                .once().withExactArgs(originalPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: ``
                            , parent_permlink: expectedTags[0]
                            , author: postAuthor
                            , permlink: expectedPermlink
                            , title: postTitle
                            , body: postBody
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: expectedTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(
                    postAuthor
                    , originalPermlink
                    , adapter.getReturnVotesParameter()
                )
                .resolves({ id: faker.random.number() })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , { title: postTitle, tags: tags }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should define "permlink" at post case`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postPermlink = ChainTool.stripAndTransliterate(faker.random.words(3))
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
            ;

            const expectedResult = { success: true };

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: ``
                            , parent_permlink: expectedTags[0]
                            , author: postAuthor
                            , permlink: postPermlink
                            , title: postTitle
                            , body: postBody
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: expectedTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, postPermlink, adapter.getReturnVotesParameter())
                .resolves({ id: 0 })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , { title: postTitle, tags: tags, permlink: postPermlink }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should define "app" at post case`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postPermlink = ChainTool.stripAndTransliterate(faker.random.words(3))
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , appName = faker.random.alphaNumeric(12)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
            ;

            const expectedResult = { success: true };

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: ``
                            , parent_permlink: expectedTags[0]
                            , author: postAuthor
                            , permlink: postPermlink
                            , title: postTitle
                            , body: postBody
                            , json_metadata: JSON.stringify({
                                app: appName
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: expectedTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, postPermlink, adapter.getReturnVotesParameter())
                .resolves({ id: 0 })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , {
                    title: postTitle,
                    tags: tags,
                    permlink: postPermlink,
                    app: appName,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should define "format" at post case`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postPermlink = ChainTool.stripAndTransliterate(faker.random.words(3))
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , format = faker.random.alphaNumeric(12)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
            ;

            const expectedResult = { success: true };

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: ``
                            , parent_permlink: expectedTags[0]
                            , author: postAuthor
                            , permlink: postPermlink
                            , title: postTitle
                            , body: postBody
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: format
                                , tags: expectedTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, postPermlink, adapter.getReturnVotesParameter())
                .resolves({ id: 0 })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , {
                    title: postTitle,
                    tags: tags,
                    permlink: postPermlink,
                    format: format,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should define beneficiaries for post`, async () => {
            // given
            const postTitle = faker.random.words(5)
                , postBody = faker.random.words(13)
                , postAuthor = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , tags = faker.random.words(5).split(` `)
                , expectedTags = tags.map((item) => {
                    return ChainTool.stripAndTransliterate(item);
                })
                , beneficiaries = {
                    benef1: faker.random.number({ min: 10, max: 50 }),
                    benef2: faker.random.number({ min:5, max: 30 }),
                }
            ;

            const expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(postTitle)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [
                            [`comment`, {
                                parent_author: ``
                                , parent_permlink: expectedTags[0]
                                , author: postAuthor
                                , permlink: expectedPermlink
                                , title: postTitle
                                , body: postBody
                                , json_metadata: JSON.stringify({
                                    app: ChainConstant.COMMENT_APP_NAME
                                    , format: ChainConstant.COMMENT_FORMAT
                                    , tags: expectedTags
                                })
                            }],
                            [`comment_options`, {
                                author: postAuthor
                                , permlink: expectedPermlink
                                , max_accepted_payout: adapter.getDefaultMaxAcceptedPayout()
                                , percent_steem_dollars: adapter.getDefaultPercentSteemDollars()
                                , allow_votes: adapter.getDefaultAllowVotes()
                                , allow_curation_rewards: adapter.getDefaultAllowCurationRewards()
                                , extensions: [[
                                    0,
                                    {
                                        beneficiaries: [
                                            {
                                                account: `benef1`,
                                                weight: beneficiaries.benef1 * 100,
                                            },
                                            {
                                                account: `benef2`,
                                                weight: beneficiaries.benef2 * 100,
                                            },
                                        ],
                                    },
                                ]]
                            }],
                        ]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(postAuthor, expectedPermlink, adapter.getReturnVotesParameter())
                .resolves({ id: 0 })
            ;

            // when
            const result = await adapter.broadcastComment(
                postAuthor
                , authorWif
                , postBody
                , { title: postTitle, tags: tags, beneficiaries: beneficiaries }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
        });

        it(`should create comment to post`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , { parent_author: parentAuthor, parent_permlink: parentPermlink }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should keep tags empty if "json_metadata" was corrupted`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: faker.random.alphaNumeric(32),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: []
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , { parent_author: parentAuthor, parent_permlink: parentPermlink }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should keep tags empty if "json_metadata" received without "tags"`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata:  JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: []
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , { parent_author: parentAuthor, parent_permlink: parentPermlink }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should handle "getContent" error for comment`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`).never();

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`).never();

            adapterMock.expects(`reconnect`).once();

            adapterMock.expects(`apiGetContent`).once()
                .rejects(new Error(`Something went wrong.`))
            ;

            // when
            let resultError = null;
            try {
                await adapter.broadcastComment(
                    author
                    , authorWif
                    , body
                    , {
                        parent_author: parentAuthor,
                        parent_permlink: parentPermlink,
                    }
                );
            } catch (err) {
                resultError = err;
            }

            // then
            if (null === resultError) {
                should.fail(`Comment creation should throw an error.`);
            } else {
                resultError.should.be.an(`error`);
            }

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should handle "post" not found case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
            ;

            const contentResult = {
                    id: 0,
                    permlink: ``,
                    json_metadata: ``,
                }
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`).never();

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`).never();

            adapterMock.expects(`reconnect`).once();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            let resultError = null;
            try {
                await adapter.broadcastComment(
                    author
                    , authorWif
                    , body
                    , {
                        parent_author: parentAuthor,
                        parent_permlink: parentPermlink,
                    }
                );
            } catch (err) {
                resultError = err;
            }

            // then
            if (null === resultError) {
                should.fail(`Comment creation should throw an error.`);
            } else {
                resultError.should.be.an(`error`);
            }

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should ignore "permlink" at comment case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , permlink = ChainTool.stripAndTransliterate(faker.random.words(3))
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = faker.random.alphaNumeric(16)
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    permlink: permlink,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should define "app" at comment case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , appName = faker.random.alphaNumeric(8)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: appName
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    app: appName,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should define "format" at comment case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , format = faker.random.alphaNumeric(8)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: ChainConstant.COMMENT_APP_NAME
                        , format: format
                        , tags: postTags
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: format
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    format: format,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should ignore "title" option at comment case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , title = faker.random.words(5)
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    title: title,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should ignore "tags" option at comment case`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , tags = faker.random.words(5).split(` `)
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [[`comment`, {
                            parent_author: parentAuthor
                            , parent_permlink: parentPermlink
                            , author: author
                            , permlink: expectedPermlink
                            , title: ``
                            , body: body
                            , json_metadata: JSON.stringify({
                                app: ChainConstant.COMMENT_APP_NAME
                                , format: ChainConstant.COMMENT_FORMAT
                                , tags: postTags
                            })
                        }]]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    tags: tags,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        it(`should create comment to post with beneficiaries`, async () => {
            // given
            const parentAuthor = faker.internet.userName().toLowerCase()
                , parentPermlink = ChainTool.stripAndTransliterate(faker.random.words(5))
                , body = faker.random.words(13)
                , author = faker.internet.userName().toLowerCase()
                , authorWif = faker.random.alphaNumeric(32)
                , postTags = faker.random.words(5).split(` `)
                , beneficiaries = {
                    benef3: faker.random.number({ min: 10, max: 50 }),
                    benef2: faker.random.number({ min:5, max: 40 }),
                }
            ;

            const contentResult = {
                    id: faker.random.number(),
                    permlink: parentPermlink,
                    json_metadata: JSON.stringify({
                        app: faker.random.alphaNumeric(16),
                        format: ChainConstant.COMMENT_FORMAT,
                        tags: postTags,
                    }),
                }
                , expectedResult = { success: true }
                , expectedPermlink = ChainTool.stripAndTransliterate(faker.random.words(7))
            ;

            const toolMock = sandbox.mock(ChainTool);
            toolMock.expects(`buildCommentPermlink`)
                .once().withExactArgs(parentAuthor, parentPermlink)
                .returns(expectedPermlink)
            ;

            const broadcastMock = sandbox.mock(adapter.connection.broadcast);
            broadcastMock.expects(`send`)
                .once()
                .callsFake((data, credentials, resultCallback) => {
                    validateBroadcastSendCall(
                        data
                        , credentials
                        , resultCallback
                        , [
                            [`comment`, {
                                parent_author: parentAuthor
                                , parent_permlink: parentPermlink
                                , author: author
                                , permlink: expectedPermlink
                                , title: ``
                                , body: body
                                , json_metadata: JSON.stringify({
                                    app: ChainConstant.COMMENT_APP_NAME
                                    , format: ChainConstant.COMMENT_FORMAT
                                    , tags: postTags
                                })
                            }],
                            [`comment_options`, {
                                author: author
                                , permlink: expectedPermlink
                                , max_accepted_payout: adapter.getDefaultMaxAcceptedPayout()
                                , percent_steem_dollars: adapter.getDefaultPercentSteemDollars()
                                , allow_votes: adapter.getDefaultAllowVotes()
                                , allow_curation_rewards: adapter.getDefaultAllowCurationRewards()
                                , extensions: [[
                                    0,
                                    {
                                        beneficiaries: [
                                            {
                                                account: `benef3`,
                                                weight: beneficiaries.benef3 * 100,
                                            },
                                            {
                                                account: `benef2`,
                                                weight: beneficiaries.benef2 * 100,
                                            },
                                        ],
                                    },
                                ]]
                            }],
                        ]
                        , { posting: authorWif }
                        , expectedResult
                    );
                })
            ;

            adapterMock.expects(`reconnect`).twice();

            adapterMock.expects(`apiGetContent`)
                .once().withExactArgs(parentAuthor, parentPermlink, adapter.getReturnVotesParameter())
                .resolves(contentResult)
            ;

            // when
            const result = await adapter.broadcastComment(
                author
                , authorWif
                , body
                , {
                    parent_author: parentAuthor,
                    parent_permlink: parentPermlink,
                    beneficiaries: beneficiaries,
                }
            );

            // then
            result.should.be.equal(expectedResult, `Result of comment creation should be successful.`);

            broadcastMock.verify();
            adapterMock.verify();
            toolMock.verify();
        });

        // ---
        // helpers
        // ---

        function validateBroadcastSendCall(
            data
            , credentials
            , resultCallback
            , expectedOperations
            , expectedCredentials
            , expectedResult
        ) {
            data.should.be.an(`Object`)
                .that.have.property(`extensions`)
                .that.is.an(`array`).eql([], `"extensions" should be empty`)
            ;
            data.should.have.property(`operations`)
                .that.is.an(`array`).eql(
                    expectedOperations
                    , `Correct "operations" should be sent.`
                )
            ;

            credentials.should.be.an(`Object`)
                .that.eql(expectedCredentials, `Given author WIF should be used.`)
            ;

            resultCallback(null, expectedResult);
        }

    });

});
