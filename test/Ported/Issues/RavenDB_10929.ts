import { CreateDatabaseOperation, GetDatabaseRecordOperation, IDocumentStore } from "../../../src";
import { disposeTestDocumentStore, testContext } from "../../Utils/TestUtil";
import { assertThat, assertThrows } from "../../Utils/AssertExtensions";
import { UpdateDatabaseOperation } from "../../../src/ServerWide/Operations/UpdateDatabaseOperation";
import { Company } from "../../Assets/Entities";

describe("RavenDB_10929Test", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("canUpdateDatabaseRecord", async () => {
        let record = await store.maintenance.server.send(new GetDatabaseRecordOperation(store.database));

        const etag = record.Etag;
        assertThat(record)
            .isNotNull();
        assertThat(etag)
            .isGreaterThan(0);
        assertThat(record.Disabled)
            .isFalse();

        record.Disabled = true;

        await store.maintenance.server.send(new UpdateDatabaseOperation(record, etag));

        record = await store.maintenance.server.send(new GetDatabaseRecordOperation(store.database));
        assertThat(record)
            .isNotNull();
        assertThat(record.Etag)
            .isGreaterThan(etag);
        assertThat(record.Disabled)
            .isTrue();

        await assertThrows(async () => await store.maintenance.server.send(new CreateDatabaseOperation(record)),
            err => {
                assertThat(err.name)
                    .isEqualTo("ConcurrencyException");
            });

        await assertThrows(async () => {
            const session = store.openSession();
            await session.store(new Company());
        }, err => {
            assertThat(err.name)
                .isEqualTo("DatabaseDisabledException");
        })

        await assertThrows(async () => {
            const session = store.openSession();
            await session.store(new Company(), "Id");
            await session.saveChanges();
        }, err => {
            assertThat(err.name)
                .isEqualTo("DatabaseDisabledException");
        })

    });

});
