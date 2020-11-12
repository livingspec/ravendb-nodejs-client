import { IDocumentStore } from "../../../src/Documents/IDocumentStore";
import { disposeTestDocumentStore, testContext } from "../../Utils/TestUtil";
import { RevisionsConfiguration } from "../../../src/Documents/Operations/RevisionsConfiguration";
import { RevisionsCollectionConfiguration } from "../../../src/Documents/Operations/RevisionsCollectionConfiguration";
import { ConfigureRevisionsOperation } from "../../../src/Documents/Operations/Revisions/ConfigureRevisionsOperation";
import { Company } from "../../Assets/Orders";
import { GetDetailedCollectionStatisticsOperation } from "../../../src/Documents/Operations/GetDetailedCollectionStatisticsOperation";
import { assertThat } from "../../Utils/AssertExtensions";

describe("RavenDB_14881", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can_get_detailed_collection_statistics", async () => {
        const configuration = new RevisionsConfiguration();
        configuration.collections = new Map<string, RevisionsCollectionConfiguration>();

        const revisionsCollectionConfiguration = new RevisionsCollectionConfiguration();
        revisionsCollectionConfiguration.disabled = false;
        configuration.collections.set("Companies", revisionsCollectionConfiguration);

        await store.maintenance.send(new ConfigureRevisionsOperation(configuration));

        // insert sample data
        const bulk  = store.bulkInsert();
        try {
            for (let i = 0; i < 20; i++) {
                const company = new Company();
                company.Id = "company/" + i;
                company.name = "name" + i;
                await bulk.store(company);
            }
        } finally {
            await bulk.finish();
        }

        // get detailed collection statistics before we are going to change some data
        // right now there shouldn't be any revisions

        const detailedCollectionStatistics = await store.maintenance.send(new GetDetailedCollectionStatisticsOperation());

        assertThat(detailedCollectionStatistics.CountOfDocuments)
            .isEqualTo(20);
        assertThat(detailedCollectionStatistics.CountOfConflicts)
            .isEqualTo(0);

        assertThat(Object.keys(detailedCollectionStatistics.Collections))
            .hasSize(1);

        const companies = detailedCollectionStatistics.Collections["Companies"];
        assertThat(companies)
            .isNotNull();
        assertThat(companies.CountOfDocuments)
            .isEqualTo(20);
        assertThat(companies.Size.SizeInBytes)
            .isGreaterThan(0);
    });
});