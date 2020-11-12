import { User } from "../../Assets/Entities";
import { assertThat } from "../../Utils/AssertExtensions";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import {
    IDocumentStore,
    PutCompareExchangeValueOperation,
    SessionOptions,
} from "../../../src";

describe("RavenDB-12132", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () => 
        await disposeTestDocumentStore(store));

    it("canPutObjectWithId", async () => {
        {
            const user = Object.assign(new User(), { Id: "users/1", name: "Grisha" });
           
            const res = await store.operations.send(
                new PutCompareExchangeValueOperation<User>("test", user, 0));

            assertThat(res.successful)
                    .isTrue();

            assertThat(res.value.name)
                    .isEqualTo("Grisha");
            assertThat(res.value.Id)
                    .isEqualTo("users/1");

        }
    });

    it("canCreateClusterTransactionRequest1", async function () {
            const user = Object.assign(new User(), { Id: "this/is/my/id", name: "Grisha" });
            const sessionOpts = { transactionMode: "ClusterWide" } as SessionOptions;
            
            const session = store.openSession(sessionOpts);
            session.advanced.clusterTransaction.createCompareExchangeValue<User>("usernames/ayende", user);
            await session.saveChanges();
            const userFromCluster = (await session.advanced.clusterTransaction
                .getCompareExchangeValue<User>("usernames/ayende")).value;
            assertThat(userFromCluster.name)
                .isEqualTo(user.name);
            assertThat(userFromCluster.Id)
                .isEqualTo(user.Id);
    });
});
