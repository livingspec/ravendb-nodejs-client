import * as BluebirdPromise from "bluebird";
import * as assert from "assert";
import { RavenTestContext, testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import {
    IDocumentStore,
    ConflictSolver,
    DocumentStore,
    DocumentConventions,
} from "../../../src";
import { ReplicationTestContext } from "../../Utils/ReplicationTestContext";
import { Address, User } from "../../Assets/Entities";
import { QueryCommand } from "../../../src/Documents/Commands/QueryCommand";
import { tryGetConflict } from "../../../src/Mapping/Json";
import { Stopwatch } from "../../../src/Utility/Stopwatch";
import { throwError } from "../../../src/Exceptions";

(RavenTestContext.isPullRequest ? describe.skip : describe)(
    `${RavenTestContext.isPullRequest ? "[Skipped on PR] " : ""}` +
    "RavenDB-6292", function () {

        let store: IDocumentStore;
        let replication: ReplicationTestContext;

        beforeEach(async function () {
            store = await testContext.getDocumentStore();
            replication = new ReplicationTestContext();
        });

        afterEach(async () => {
            replication = null;
            await disposeTestDocumentStore(store);
        });

        afterEach(async () =>
            await disposeTestDocumentStore(store));

        describe("with resolveToLatest to false", () => {

            beforeEach(() => {
                testContext.customizeDbRecord = r => {
                    const conflictSolver: ConflictSolver = {
                        resolveToLatest: false,
                        resolveByCollection: {}
                    };
                    r.ConflictSolverConfig = conflictSolver;
                };
            });

            afterEach(() => testContext.customizeDbRecord = null);

            it("if included document is conflicted, it should not throw conflict exception", async () => {
                let source: DocumentStore;
                let destination: DocumentStore;

                try {
                    source = await testContext.getDocumentStore();
                    try {
                        destination = await testContext.getDocumentStore();

                        {
                            const session = source.openSession();
                            const address = new Address();
                            address.city = "New York";
                            await session.store(address, "addresses/1");
                            await session.saveChanges();
                        }

                        {
                            const session = destination.openSession();
                            const address = new Address();
                            address.city = "Torun";
                            await session.store(address, "addresses/1");

                            const user = new User();
                            user.name = "John";
                            user.addressId = "addresses/1";
                            await session.store(user, "users/1");
                            await session.saveChanges();
                        }

                        await replication.setupReplication(source, destination);
                        await waitForConflict(destination, "addresses/1");

                        {
                            const session = destination.openSession();
                            const documentQuery = session.advanced
                                .documentQuery<User>(User)
                                .include("addressId");

                            const iq = documentQuery.getIndexQuery();

                            const user = await documentQuery.first();

                            assert.strictEqual(user.name, "John");

                            try {
                                await session.load<Address>(user.addressId);
                                assert.fail("Should have thrown");
                            } catch (err) {
                                assert.strictEqual(err.name, "DocumentConflictException");
                            }

                            const queryCommand = new QueryCommand(
                                DocumentConventions.defaultConventions, iq, {
                                    indexEntriesOnly: false,
                                    metadataOnly: false
                                });

                            await destination.getRequestExecutor().execute(queryCommand);

                            const result = queryCommand.result;
                            const address = result.Includes["addresses/1"];
                            const metadata = address["@metadata"];
                            assert.strictEqual(metadata["@id"], "addresses/1");

                            assert.ok(tryGetConflict(metadata));
                        }
                    } finally {
                        destination.dispose();
                    }
                } finally {
                    source.dispose();
                }

                async function waitForConflict(docStore: IDocumentStore, id: string) {
                    const sw = Stopwatch.createStarted();
                    while (sw.elapsed < 10000) {
                        try {
                            const session = docStore.openSession();
                            await session.load(id);

                            await BluebirdPromise.delay(10);
                        } catch (e) {
                            if (e.name === "DocumentConflictException") {
                                return;
                            }

                            throw e;
                        }
                    }

                    throwError("InvalidOperationException",
                        "Waited for conflict on '" + id + "' but it did not happen");
                }
            });
        });
    });
