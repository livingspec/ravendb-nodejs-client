import * as assert from "assert";
import {testContext} from "../Utils/TestUtil";

import {IDocumentSession, IDocumentStore, LoadOptions,} from "../../src";

describe("Various ways of fetching documents while overriding type mappings", function () {

    let store: IDocumentStore;
    let session: IDocumentSession;

    class NestedType {
        fieldA: string;
        fieldB: number;

        constructor(opts: object) {
            opts = opts || {};
            Object.assign(this, opts);
        }
    }

    class NestedTypeOverride {
        fieldA: string;
        fieldB: number;
        fieldC?: string;

        constructor(opts: object) {
            opts = opts || {};
            Object.assign(this, opts);
        }
    }

    class HasNestedType {
        name: string;
        nestedType: NestedType;

        constructor(opts: object) {
            opts = opts || {};
            Object.assign(this, opts);
        }
    }

    class File {
        name: string
        mimetype?: string;

        constructor(opts: object) {
            opts = opts || {};
            Object.assign(this, opts);
        }
    }

    class StoredFile extends File {
        mimetype: string;
    }

    beforeEach(async function () {
        testContext.customizeStore = (store) => {
            const conventions = store.conventions;
            conventions.registerEntityType(HasNestedType);
            conventions.registerEntityType(NestedType);
            conventions.registerEntityType(File);
            return Promise.resolve();
        }
        store = await testContext.getDocumentStore();

        session = store.openSession();

        {
            const nestedType = new NestedType({fieldA: "contained in nested type", fieldB: 17});
            const document = new HasNestedType({name: "has nested type", nestedType: nestedType});

            const file = new File({name: "test file", mimetype: "application/json"});

            const session = store.openSession();
            await session.store(document);
            await session.store(file);
            await session.saveChanges();
        }
    });

    afterEach(async () =>
        await store.dispose());

    it("loading empty ID list returns empty array", async () => {
        const session = store.openSession();
        const results = Object.values(await session.load([]));

        assert.notStrictEqual(results, []);
    });

    it("can load with document type override", async () => {
        {
            const session = store.openSession();
            const loadedWithDefaultType: File = await session.load("Files/1-A");

            assert.ok(loadedWithDefaultType instanceof File);
            assert.strictEqual(loadedWithDefaultType.name, "test file");
            assert.ok(loadedWithDefaultType.mimetype);
            assert.strictEqual(loadedWithDefaultType.mimetype, "application/json");
        }

        {
            const session = store.openSession();
            const loadedWithTypeOverride: StoredFile = await session.load("Files/1-A", {documentType: StoredFile} as LoadOptions<any>);

            assert.ok(loadedWithTypeOverride instanceof StoredFile);
            assert.strictEqual(loadedWithTypeOverride.name, "test file");
            assert.ok(loadedWithTypeOverride.mimetype);
            assert.strictEqual(loadedWithTypeOverride.mimetype, "application/json");
        }
    });

    it("can load with root type override", async () => {
        {
            const session = store.openSession();
            const loadedWithDefaultType: File = await session.load("Files/1-A");

            assert.ok(loadedWithDefaultType instanceof File);
            assert.strictEqual(loadedWithDefaultType.name, "test file");
            assert.ok(loadedWithDefaultType.mimetype);
            assert.strictEqual(loadedWithDefaultType.mimetype, "application/json");
        }

        {
            const typeOverrides = new Map();
            typeOverrides.set("File", StoredFile);

            const session = store.openSession();
            const loadedWithTypeOverride: StoredFile = await session.load("Files/1-A", {objectTypeOverrides: typeOverrides} as LoadOptions<any>);

            assert.ok(loadedWithTypeOverride instanceof StoredFile);
            assert.strictEqual(loadedWithTypeOverride.name, "test file");
            assert.ok(loadedWithTypeOverride.mimetype);
            assert.strictEqual(loadedWithTypeOverride.mimetype, "application/json");
        }
    });

    it("can load with nested type overrides", async () => {
        {
            const session = store.openSession();
            const loadedWithDefaultTypes: HasNestedType = await session.load("HasNestedTypes/1-A");

            assert.ok(loadedWithDefaultTypes instanceof HasNestedType);
            assert.strictEqual(loadedWithDefaultTypes.name, "has nested type");
            assert.ok(loadedWithDefaultTypes.nestedType instanceof NestedType);
            assert.strictEqual(loadedWithDefaultTypes.nestedType.fieldA, "contained in nested type");
            assert.strictEqual(loadedWithDefaultTypes.nestedType.fieldB, 17);
        }

        {
            const typeOverrides = new Map();
            typeOverrides.set("HasNestedType", HasNestedType);
            typeOverrides.set("NestedType", NestedTypeOverride);

            const session = store.openSession();
            const loadedWithTypeOverride: HasNestedType = await session.load("HasNestedTypes/1-A", {objectTypeOverrides: typeOverrides} as LoadOptions<any>);

            assert.ok(loadedWithTypeOverride instanceof HasNestedType);
            assert.strictEqual(loadedWithTypeOverride.name, "has nested type");
            assert.ok(loadedWithTypeOverride.nestedType instanceof NestedTypeOverride);
            assert.strictEqual(loadedWithTypeOverride.nestedType.fieldA, "contained in nested type");
            assert.strictEqual(loadedWithTypeOverride.nestedType.fieldB, 17);
            assert.strictEqual(loadedWithTypeOverride.nestedType.fieldC, undefined);
        }
    });

    it("can stream with nested type overrides", async () => {
        {
            const session = store.openSession();
            const query = session.advanced.rawQuery("from HasNestedTypes");
            const stream = await session.advanced.stream(query);
            stream.on("data", result => {
                const loadedWithDefaultTypes = result.document;

                assert.ok(loadedWithDefaultTypes instanceof HasNestedType);
                assert.strictEqual(loadedWithDefaultTypes.name, "has nested type");
                assert.ok(loadedWithDefaultTypes.nestedType instanceof NestedType);
                assert.strictEqual(loadedWithDefaultTypes.nestedType.fieldA, "contained in nested type");
                assert.strictEqual(loadedWithDefaultTypes.nestedType.fieldB, 17);
            });
        }

        {
            const typeOverrides = new Map();
            typeOverrides.set("HasNestedType", HasNestedType);
            typeOverrides.set("NestedType", NestedTypeOverride);

            const session = store.openSession();
            const query = session.advanced.rawQuery("from HasNestedTypes").withObjectTypeOverrides(typeOverrides);
            const stream = await session.advanced.stream(query);
            stream.on("data", result => {
                const loadedWithTypeOverride = result.document;

                assert.ok(loadedWithTypeOverride instanceof HasNestedType);
                assert.strictEqual(loadedWithTypeOverride.name, "has nested type");
                assert.ok(loadedWithTypeOverride.nestedType instanceof NestedTypeOverride);
                assert.strictEqual(loadedWithTypeOverride.nestedType.fieldA, "contained in nested type");
                assert.strictEqual(loadedWithTypeOverride.nestedType.fieldB, 17);
                assert.strictEqual(loadedWithTypeOverride.nestedType.fieldC, undefined);
            });
        }
    });

});

