import * as assert from "assert";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import {
    IDocumentStore,
    AbstractIndexCreationTask,
} from "../../../src";

class TaskIndex extends AbstractIndexCreationTask {
    public constructor() {
        super();
        this.map = "from task in docs.Tasks select new { task.assigneeId } ";
    }
}

class Task {
    public Id: string;
    public assigneeId: string;
}

describe("lazy aggregation embedded", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("test", async () => {
        const session = store.openSession();
        const task1 = new Task();
        task1.assigneeId = "users/1";
        task1.Id = "tasks/1";

        const task2 = new Task();
        task2.assigneeId = "users/1";
        task2.Id = "tasks/2";

        const task3 = new Task();
        task3.assigneeId = "users/2";
        task3.Id = "tasks/3";
        await session.store(task1);
        await session.store(task2);
        await session.store(task3);
        await session.saveChanges();
        await new TaskIndex().execute(store);
        await testContext.waitForIndexing(store);

        const query = session.query({
            indexName: AbstractIndexCreationTask.getIndexNameForCtor(TaskIndex.name)
        })
            .aggregateBy(f =>
                f.byField("assigneeId")
                    .withDisplayName("assigneeId"));

        const lazyOp = query.executeLazy();
        const facetValue = await lazyOp.getValue();
        const userStats = facetValue["assigneeId"].Values
            .reduce((result, next) => {
                result[next.Range] = next.Count;
                return result;
            }, {});

        assert.strictEqual(userStats["users/1"], 2);
        assert.strictEqual(userStats["users/2"], 1);
    });
});
