import { testContext, disposeTestDocumentStore } from "../Utils/TestUtil";
import * as assert from "assert";
import DocumentStore, {
    IDocumentStore,
} from "../../src";

describe("With custom key case conventions set", function () {

    let regularStore: IDocumentStore;

    beforeEach(async function () {
        regularStore = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(regularStore));

    function getStoreWithCustomConventions(setupStore: (store: DocumentStore) => void) {
        const customStore = new DocumentStore(regularStore.urls, regularStore.database);
        setupStore(customStore);
        customStore.initialize();
        return customStore;
    }

    let pascalCasedObj;
    let camelCasedObj;

    beforeEach(() => {
        pascalCasedObj = {
            Name: "John",
            Age: 25,
            Equipment: [
                {
                    Name: "Headphones",
                    ForSale: false
                },
                {
                    Name: "Baseball Cap",
                    ForSale: false
                },
                {
                    Name: "Stamps",
                    ForSale: true
                }
            ],
            RegisteredAt: new Date(1988, 10, 12),
            Collection: "People"
        };

        pascalCasedObj["@metadata"] = {
            "@collection": "People"
        };

        camelCasedObj = {
            name: "John",
            age: 25,
            equipment: [
                {
                    name: "Headphones",
                    forSale: false
                },
                {
                    name: "Baseball Cap",
                    forSale: false
                },
                {
                    name: "Stamps",
                    forSale: true
                }
            ],
            registeredAt: new Date(1988, 10, 12),
            collection: "People"
        };

        camelCasedObj["@metadata"] = {
            "@collection": "People"
        };
    });

    it("stores camelCased entities as PascalCased", async () => {
        let customCaseStore;
        const stored = camelCasedObj;
        try {
            customCaseStore = getStoreWithCustomConventions((s) => {
                s.conventions.findCollectionNameForObjectLiteral = (o) => o["collection"];
                s.conventions.entityFieldNameConvention = "camel";
                s.conventions.remoteEntityFieldNameConvention = "pascal";
                s.conventions.identityProperty = "Id";
                s.conventions.registerEntityIdPropertyName(Object, "Id");
            });

            {
                const session = customCaseStore.openSession();
                await session.store(camelCasedObj, "people/1");
                await session.saveChanges();
            }

        } finally {
            if (customCaseStore) {
                customCaseStore.dispose();
            }
        }

        {
            const session = regularStore.openSession();
            const loaded: any = await session.load("people/1");
            assert.ok(loaded);
            assert.strictEqual(loaded.Name, stored.name);
            assert.strictEqual(loaded.Age, stored.age);
            assert.ok(loaded.RegisteredAt);
            assert.strictEqual(loaded.RegisteredAt.constructor, Date, `Got ${ loaded.registeredAt } - not a Date`);

            assert.strictEqual(loaded.RegisteredAt.valueOf(), stored.registeredAt.valueOf());

            assert.strictEqual(loaded.Collection, stored.collection);
            assert.strictEqual(loaded.Equipment[0].Name, stored.equipment[0].name);

            assert.ok(loaded["@metadata"]);
            assert.strictEqual(loaded["@metadata"]["@collection"], stored.collection);
            assert.strictEqual(loaded["@metadata"]["@nested-object-types"]["RegisteredAt"], "date");
        }

    });

    it("should throw error if only one key case convention is set", async () => {
        try {
            getStoreWithCustomConventions(store => {
                store.conventions.remoteEntityFieldNameConvention = "dot";
            });
            assert.fail("should have thrown");
        } catch (err) {
            assert.ok(err.message !== "should have thrown");
        }
    });

});
