import { disposeTestDocumentStore, testContext } from "../../Utils/TestUtil";
import { CreateDatabaseOperation, DatabaseRecord, GetDatabaseRecordOperation, IDocumentStore } from "../../../src";
import { ToggleDatabasesStateOperation } from "../../../src/Documents/Operations/ToggleDatabasesStateOperation";
import { assertThat, assertThrows } from "../../Utils/AssertExtensions";
import { AddDatabaseNodeOperation } from "../../../src/ServerWide/Operations/AddDatabaseNodeOperation";
import { Genre } from "../../Assets/Graph";

describe("DatabasesTest", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("canDisableAndEnableDatabase", async () => {
        const dbRecord: DatabaseRecord = {
            DatabaseName: "enableDisable"
        };

        const databaseOperation = new CreateDatabaseOperation(dbRecord);
        await store.maintenance.server.send(databaseOperation);

        let toggleResult = await store.maintenance.server.send(
            new ToggleDatabasesStateOperation("enableDisable", true));

        assertThat(toggleResult)
            .isNotNull();
        assertThat(toggleResult.Name)
            .isNotNull();

        const disabledDatabaseRecord = await store.maintenance.server.send(new GetDatabaseRecordOperation("enableDisable"));
        assertThat(disabledDatabaseRecord.Disabled)
            .isTrue();

        // now enable database

        toggleResult = await store.maintenance.server.send(
            new ToggleDatabasesStateOperation("enableDisable", false));

        assertThat(toggleResult)
            .isNotNull();
        assertThat(toggleResult.Name)
            .isNotNull();

        const enabledDatabaseRecord = await store.maintenance.server.send(new GetDatabaseRecordOperation("enableDisable"));
        assertThat(enabledDatabaseRecord.Disabled)
            .isFalse();
    });

    it("canAddNode", async () => {
        await assertThrows(async () => {
            // we assert this by throwing - we are running single node cluster
            await store.maintenance.server.send(new AddDatabaseNodeOperation(store.database));
        }, err => {
            assertThat(err.message)
                .contains("Can't add node");
        });
    });

    it("canGetInfoAutoIndexInfo", async () => {
        await testContext.createMoviesData(store);

        {
            const session = store.openSession();

            await session.query(Genre)
                .whereEquals("name", "Fantasy")
                .all();
        }

        const record = await store.maintenance.server
            .send(new GetDatabaseRecordOperation(store.database));

        assertThat(record.AutoIndexes)
            .hasSize(1);
        assertThat(Object.keys(record.AutoIndexes))
            .contains("Auto/Genres/Byname");

        const autoIndexDefinition = record.AutoIndexes["Auto/Genres/Byname"];
        assertThat(autoIndexDefinition)
            .isNotNull();

        assertThat(autoIndexDefinition.Type)
            .isEqualTo("AutoMap");
        assertThat(autoIndexDefinition.Name)
            .isEqualTo("Auto/Genres/Byname");
        assertThat(autoIndexDefinition.Priority)
            .isEqualTo("Normal");
        assertThat(autoIndexDefinition.Collection)
            .isEqualTo("Genres");
        assertThat(autoIndexDefinition.MapFields)
            .hasSize(1);
        assertThat(autoIndexDefinition.GroupByFields)
            .hasSize(0);

        const fieldOptions = autoIndexDefinition.MapFields["name"];

        assertThat(fieldOptions.Storage)
            .isEqualTo("No");
        assertThat(fieldOptions.Indexing)
            .isEqualTo("Default");
        assertThat(fieldOptions.Aggregation)
            .isEqualTo("None");
        assertThat(fieldOptions.Spatial)
            .isNull();
        assertThat(fieldOptions.GroupByArrayBehavior)
            .isEqualTo("NotApplicable");
        assertThat(fieldOptions.Suggestions)
            .isFalse();
        assertThat(fieldOptions.IsNameQuoted)
            .isFalse();
    });
});