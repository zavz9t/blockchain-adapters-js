'use strict';

const faker = require(`faker`)
    , sandbox = require(`sinon`).createSandbox()
    , { sprintf } = require(`sprintf-js`)
    , moment = require(`moment`)
    , { ChainTool, ChainConstant } = require(`../index`)
;

describe(`ChainTool`, () => {

    describe(`parsePostUrl`, () => {

        it(`should handle empty url`, () => {
            // when
            const result = ChainTool.parsePostUrl(``);

            // then
            should.equal(result, null, `Parsing should be done correctly`);
        });

        it(`should handle golos url`, () => {
            // given
            const url = `https://golos.io/alba-stories/@alba-stories/otelx-1000-zvyozd`;

            // when
            const result = ChainTool.parsePostUrl(url);

            // then
            result.should.be.eql(
                { author: `alba-stories`, permlink: `otelx-1000-zvyozd` }
                , `Parsing should be done correctly`
            );
        });

        it(`should handle goldvoice url`, () => {
            // given
            const url = `https://goldvoice.club/@alex007/bitstash-kriptovalyutnyi-internet-magzin-tovarov/`;

            // when
            const result = ChainTool.parsePostUrl(url);

            // then
            result.should.be.eql(
                {
                    author: `alex007`
                    , permlink: `bitstash-kriptovalyutnyi-internet-magzin-tovarov`
                }
                , `Parsing should be done correctly`
            );
        });

        it(`should handle liveblogs.space url`, () => {
            // given
            const url = `https://liveblogs.space/show.html?author=tatdt&permlink=----czerkovx-voskreseniya-khristova-na-obvodnom-kanale`;

            // when
            const result = ChainTool.parsePostUrl(url);

            // then
            result.should.be.eql(
                {
                    author: `tatdt`
                    , permlink: `----czerkovx-voskreseniya-khristova-na-obvodnom-kanale`
                }
                , `Parsing should be done correctly`
            );
        });

    });

    describe(`stripAndTransliterate`, () => {

        const dataProvider = [
            {
                input: [``]
                , expectedResult: ``
                , message: `Should skip empty strings.`
            },
            {
                input: [`hello`]
                , expectedResult: `hello`
                , message: `Should handle one word case.`
            },
            {
                input: [`Hello dear friends!`]
                , expectedResult: `hello-dear-friends`
                , message: `Should handle several words.`
            },
            {
                input: [`Word-to-Word text`]
                , expectedResult: `word-to-word-text`
                , message: `Should handle case with space replacement symbol.`
            },
            {
                input: [`Several  spaces   test     fin`]
                , expectedResult: `several-spaces-test-fin`
                , message: `Should handle several spaces case.`
            },
            {
                input: [`Several  spaces   test     fin`, `_`]
                , expectedResult: `several_spaces_test_fin`
                , message: `Should use custom space replacement symbol.`
            },
            {
                input: [`Some, item. He-he`]
                , expectedResult: `some-item-he-he`
                , message: `Should handle strings with dots.`
            },
            {
                input: [`Another,item.Be-be`]
                , expectedResult: `another-item-be-be`
                , message: `should handle dots as space symbol.`
            },
            {
                input: [`Привіт друзі!`]
                , expectedResult: `ru--privit-druzi`
                , message: `should handle ukrainian symbols.`
            },
            {
                input: [`Странные вещи`]
                , expectedResult: `ru--strannyie-veshchi`
                , message: `should handle some russian symbols correctly.`
            },
            {
                input: [`(💯 апвот) Очень злая собака 😨 - 7`]
                , expectedResult: `ru--apvot-ochenx-zlaya-sobaka-7`
                , message: `should handle emoji.`
            },
            {
                input: [`(💯 апвот) Динозаври на вулиці 😱 - 2`]
                , expectedResult: `ru--apvot-dinozavri-na-vuliczi-2`
                , message: `should handle emoji 2.`
            },
            {
                input: [`[Щоденник досягнень] День 32/100 | 08.09.2018`]
                , expectedResult: `ru--shchodennik-dosyagnenx-denx-32-100-08-09-2018`
                , message: `should handle different symbols correctly.`
            },
            {
                input: [`[Щоденник досягнень] День 32/100 | 08.09.2018`, `_`, `ua-`]
                , expectedResult: `ua-shchodennik_dosyagnenx_denx_32_100_08_09_2018`
                , message: `should use russian prefix parameter.`
            },
            {
                input: [`[Горнятко кави] Я Морячка Ты Моряк `]
                , expectedResult: `ru--gornyatko-kavi-ya-moryachka-ty-moryak`
                , message: `should trim last space symbol.`
            },
            {
                input: [`[Горнятко кави] Я Морячка Ты Моряк ⛵😱`]
                , expectedResult: `ru--gornyatko-kavi-ya-moryachka-ty-moryak`
                , message: `should trim last emoji symbol.`
            },
        ];

        dataProvider.forEach(({ input, expectedResult, message }) => {
            it(`When called with "${input}" string`, () => {
                // given

                // when
                const result = ChainTool.stripAndTransliterate.apply(ChainTool, input);

                // then
                result.should.be.eql(expectedResult, message);
            });
        });

    });

    describe(`buildCommentPermlink`, () => {

        let momentMock = null;

        beforeEach(() => {
            momentMock = sandbox.mock(moment.prototype);
        });

        afterEach(() => {
            // completely restore all fakes created through the sandbox
            sandbox.restore();
        });

        const dataProvider = [
            {
                input: [``, ``]
                , time: ``
                , expectedResult: null
                , message: `Should return NULL for empty data.`
            },
            {
                input: [`zavz9t`, ``]
                , time: ``
                , expectedResult: null
                , message: `Should return NULL for empty permlink.`
            },
            {
                input: [``, `some-link`]
                , time: ``
                , expectedResult: null
                , message: `Should return NULL for empty author.`
            },
            {
                input: [`hello`, `to-the-words`]
                , time: `20181010t151515z`
                , expectedResult: `re-hello-to-the-words-20181010t151515z`
                , message: `Should build permlink successfully.`
            },
        ];

        dataProvider.forEach(({ input, time, expectedResult, message }) => {
            it(`When called with "${input}" string`, () => {
                // given
                if (time) {
                    momentMock.expects(`utc`).once().returnsThis();
                    momentMock.expects(`format`).once().returns(time);
                } else {
                    momentMock.expects(`utc`).never();
                    momentMock.expects(`format`).never();
                }

                // when
                const result = ChainTool.buildCommentPermlink.apply(ChainTool, input);

                // then
                if (result) {
                    result.should.be.eql(expectedResult, message);
                } else {
                    should.equal(result, expectedResult, message);
                }
                momentMock.verify();
            });
        });

    });

});
