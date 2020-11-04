import * as assert from "assert";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";
import { CreateSampleDataOperation } from "../../Utils/CreateSampleDataOperation";

import {
    GetStatisticsCommand,
    IDocumentStore,
} from "../../../src";

describe("GetStatisticsCommand()", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can get stats", async () => {
        const getStatsCmd = new GetStatisticsCommand();
        const executor = store.getRequestExecutor();

        const sampleDataOp = new CreateSampleDataOperation();
        await store.maintenance.send(sampleDataOp);

        await testContext.waitForIndexing(store, store.database, null);
        await executor.execute(getStatsCmd);

        const stats = getStatsCmd.result;
        assert.ok(stats);

        assert.ok(stats.LastDocEtag);
        assert.ok(stats.LastDocEtag > 0);

        assert.ok(stats.CountOfIndexes >= 3);

        assert.strictEqual(stats.CountOfDocuments, 1059);
        assert.ok(stats.CountOfRevisionDocuments > 0);
        assert.strictEqual(stats.CountOfDocumentsConflicts, 0);
        assert.strictEqual(stats.CountOfUniqueAttachments, 17);

        assert.ok(stats.DatabaseChangeVector);
        assert.ok(stats.DatabaseId);
        assert.ok(stats.Pager);
        assert.ok(stats.LastIndexingTime);
        assert.ok(stats.Indexes);
        assert.ok(stats.SizeOnDisk.HumaneSize);
        assert.ok(stats.SizeOnDisk.SizeInBytes);

        for (const idx of stats.Indexes) {
            assert.ok(idx.Name);
            assert.ok(idx.IsStale === false, `Index ${idx.Name} is stale`);
            assert.ok(idx.State);
            assert.ok(idx.LockMode);
            assert.ok(idx.Priority);
            assert.ok(idx.Type);
            assert.ok(idx.LastIndexingTime);
        }
    });
});
