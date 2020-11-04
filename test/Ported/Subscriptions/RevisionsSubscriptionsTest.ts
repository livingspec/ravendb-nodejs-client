import { Company, User } from "../../Assets/Entities";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import DocumentStore, {
    IDocumentStore,
    RevisionsCollectionConfiguration,
    RevisionsConfiguration,
    ConfigureRevisionsOperation
} from "../../../src";
import * as assert from "assert";

// skipped for the time being
// subscriptions are not working with server version 4.1
// due to RavenDB-12127
describe("RevisionsSubscriptionsTest", function () {
    this.timeout(5 * 10 * 1000);

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("plain revisions subscriptions", async function() {
        const subscriptionId = await store.subscriptions.createForRevisions({
            DocumentType: User
        });

        const defaultCollection = new RevisionsCollectionConfiguration();
        defaultCollection.disabled = false;
        defaultCollection.minimumRevisionsToKeep = 51;

        const usersConfig = new RevisionsCollectionConfiguration();
        usersConfig.disabled = false;

        const donsConfig = new RevisionsCollectionConfiguration();
        donsConfig.disabled = false;

        const configuration = new RevisionsConfiguration();
        configuration.defaultConfig = defaultCollection;

        configuration.collections = new Map<string, RevisionsCollectionConfiguration>();
        configuration.collections.set("Users", usersConfig);
        configuration.collections.set("Dons", donsConfig);

        const operation = new ConfigureRevisionsOperation(configuration);

        await store.maintenance.send(operation);

        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                const session = store.openSession();
                const user = new User();
                user.name = "users" + i + " ver " + j;
                await session.store(user, "users/" + i);

                const company = new Company();
                company.name = "dons" + i + " ver " + j;
                await session.store(company, "dons/" + i);

                await session.saveChanges();
            }
        }

        const sub = store.subscriptions.getSubscriptionWorkerForRevisions<User>({
            DocumentType: User,
            SubscriptionName: subscriptionId
        });

        try {
            await new Promise((resolve, reject) => {
                const names = new Set<string>();

                sub.on("error", reject);

                sub.on("batch", (batch, callback) => {
                    try {
                        batch.items.forEach(item => {
                            const result = item.result;
                            names.add(
                                (result.Current ? result.Current.name : null)
                                + (result.Previous ? result.Previous.name : null));

                            if (names.size === 100) {
                                resolve();
                            }
                        });
                    } catch (err) {
                        callback(err);
                        return;
                    }

                    callback();
                });
            });
        } finally {
            sub.dispose();
        }
    });

    it("plain revisions subscriptions compare docs", async function() {
        const subscriptionId = await store.subscriptions.createForRevisions({
            DocumentType: User
        });

        const defaultCollection = new RevisionsCollectionConfiguration();
        defaultCollection.disabled = false;
        defaultCollection.minimumRevisionsToKeep = 51;

        const usersConfig = new RevisionsCollectionConfiguration();
        usersConfig.disabled = false;

        const donsConfig = new RevisionsCollectionConfiguration();
        donsConfig.disabled = false;

        const configuration = new RevisionsConfiguration();
        configuration.defaultConfig = defaultCollection;

        configuration.collections = new Map<string, RevisionsCollectionConfiguration>();
        configuration.collections.set("Users", usersConfig);
        configuration.collections.set("Dons", donsConfig);

        const operation = new ConfigureRevisionsOperation(configuration);

        await store.maintenance.send(operation);

        for (let j = 0; j < 10; j++) {
            const session = store.openSession();
            const user = new User();
            user.name = "users1 ver " + j;
            user.age = j;
            await session.store(user, "users/1");

            const company = new Company();
            company.name = "dons1 ver " + j;
            await session.store(company, "dons/1");

            await session.saveChanges();
        }

        const sub = await store.subscriptions.getSubscriptionWorkerForRevisions<User>({
            SubscriptionName: subscriptionId,
            DocumentType: User
        });

        try {
            await new Promise(resolve => {
                const names = new Set<string>();

                let maxAge = -1;

                sub.on("batch", (batch, callback) => {
                    batch.items.forEach(item => {
                        const x = item.result;

                        if (x.Current.age > maxAge && x.Current.age  > (x.Previous ? x.Previous.age : -1)) {
                            names.add(
                                (x.Current ? x.Current.name : null)
                                + " " + (x.Previous ? x.Previous.name : null));
                            maxAge = x.Current.age;
                        }

                        if (names.size === 10) {
                            resolve();
                        }
                    });

                    callback();
                });
            });
        } finally {
            sub.dispose();
        }
    });

});
