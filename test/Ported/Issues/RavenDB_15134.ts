import { IDocumentStore } from "../../../src/Documents/IDocumentStore";
import { disposeTestDocumentStore, testContext } from "../../Utils/TestUtil";
import { User } from "../../Assets/Entities";
import { GetCountersOperation } from "../../../src/Documents/Operations/Counters/GetCountersOperation";
import { assertThat } from "../../Utils/AssertExtensions";

describe("RavenDB_15134", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("getCountersOperationShouldReturnNullForNonExistingCounter", async () => {
        const docId = "users/1";

        {
            const session = store.openSession();
            await session.store(new User(), docId);

            const c = session.countersFor(docId);

            c.increment("likes");
            c.increment("dislikes", 2);

            await session.saveChanges();
        }

        let vals = await store.operations.send(new GetCountersOperation(docId, ["likes", "downloads", "dislikes"]));
        assertThat(vals.Counters)
            .hasSize(3);

        assertThat(vals.Counters[0].TotalValue)
            .isEqualTo(1);
        assertThat(vals.Counters[1])
            .isNull();
        assertThat(vals.Counters[2].TotalValue)
            .isEqualTo(2);

        vals = await store.operations.send(new GetCountersOperation(docId, ["likes", "downloads", "dislikes"], true));
        assertThat(vals.Counters)
            .hasSize(3);

        assertThat(vals.Counters[0].CounterValues)
            .hasSize(1);
        assertThat(vals.Counters[1])
            .isNull();
        assertThat(vals.Counters[2].CounterValues)
            .hasSize(1);
    });

});
